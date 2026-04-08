import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, participantsTable, operationsTable, settingsTable } from "@workspace/db";
import {
  RunValidationResponse,
  RunPlanBody,
  RunPlanResponse,
  RunSimulationResponse,
  ListOperationHistoryResponse,
  GetScheduleResponse,
  UpdateScheduleBody,
  UpdateScheduleResponse,
  GetDashboardSummaryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function validatePesel(pesel: string): boolean {
  if (!/^\d{11}$/.test(pesel)) return false;
  const weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  const total = weights.reduce((sum, w, i) => sum + w * parseInt(pesel[i], 10), 0);
  const check = (10 - (total % 10)) % 10;
  return check === parseInt(pesel[10], 10);
}

function validateEmail(email: string): boolean {
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email);
}

function validatePhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-]/g, "");
  return /^(\+48)?\d{9}$/.test(cleaned);
}

router.post("/operations/validate", async (req, res): Promise<void> => {
  const participants = await db.select().from(participantsTable);

  const records = participants.map((p) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!p.imie) errors.push("Brak imienia");
    if (!p.nazwisko) errors.push("Brak nazwiska");
    if (!p.pesel) errors.push("Brak PESEL");
    else if (!validatePesel(p.pesel)) errors.push(`Nieprawidlowy PESEL: ${p.pesel}`);
    if (!p.email) errors.push("Brak e-mail");
    else if (!validateEmail(p.email)) errors.push(`Nieprawidlowy e-mail: ${p.email}`);
    if (!p.telefon) errors.push("Brak telefonu");
    else if (!validatePhone(p.telefon)) warnings.push(`Podejrzany numer telefonu: ${p.telefon}`);
    if (!p.adres) errors.push("Brak adresu");
    if (!p.kodPocztowy) errors.push("Brak kodu pocztowego");
    if (!p.miasto) errors.push("Brak miasta");
    if (!p.loginPortal) errors.push("Brak loginu portalu");
    if (!p.haslo) errors.push("Brak hasla");

    const ok = errors.length === 0;

    return {
      participantId: p.id,
      imie: p.imie,
      nazwisko: p.nazwisko,
      ok,
      errors,
      warnings,
    };
  });

  for (const r of records) {
    await db
      .update(participantsTable)
      .set({ validationStatus: r.ok ? "ok" : "error" })
      .where(eq(participantsTable.id, r.participantId));
  }

  const okCount = records.filter((r) => r.ok).length;
  const errCount = records.filter((r) => !r.ok).length;

  await db.insert(operationsTable).values({
    operationType: "validate",
    status: errCount > 0 ? "errors" : "ok",
    summary: `Walidacja: ${participants.length} uczestnikow, ${okCount} OK, ${errCount} bledow`,
  });

  const report = {
    total: participants.length,
    ok: okCount,
    errorsCount: errCount,
    records,
  };

  res.json(RunValidationResponse.parse(report));
});

router.post("/operations/plan", async (req, res): Promise<void> => {
  const parsed = RunPlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { startTime, workers, spacingSec } = parsed.data;
  const startDate = new Date(startTime);
  const participants = await db.select().from(participantsTable).orderBy(participantsTable.id);

  const slots = participants.map((p, idx) => {
    const worker = (idx % workers) + 1;
    const delaySec = Math.floor(idx / workers) * spacingSec;
    const scheduledAt = new Date(startDate.getTime() + delaySec * 1000);

    return {
      slotId: idx + 1,
      worker,
      participantId: p.id,
      imie: p.imie,
      nazwisko: p.nazwisko,
      loginPortal: p.loginPortal,
      scheduledAt: scheduledAt.toISOString(),
    };
  });

  await db.insert(operationsTable).values({
    operationType: "plan",
    status: "ok",
    summary: `Plan: ${slots.length} slotow, ${workers} pracownikow, start ${startDate.toISOString()}`,
  });

  const report = {
    generatedAt: new Date().toISOString(),
    totalSlots: slots.length,
    slots,
  };

  res.json(RunPlanResponse.parse(report));
});

const SCREEN_FLOW = [
  "logowanie",
  "strona_glowna",
  "rekrutacja_lista",
  "wybor_naboru",
  "formularz_dane_osobowe",
  "formularz_dokumenty",
  "formularz_oswiadczenia",
  "podglad_wniosku",
  "WYMAGANE_RECZNE_WYSLANIE",
];

function maskPassword(password: string): string {
  if (password.length <= 2) return "***";
  return password[0] + "*".repeat(password.length - 2) + password[password.length - 1];
}

router.post("/operations/simulate", async (_req, res): Promise<void> => {
  const participants = await db.select().from(participantsTable).orderBy(participantsTable.id);

  const simulations = participants.map((p) => {
    const steps = SCREEN_FLOW.map((screen) => {
      if (screen === "logowanie") {
        return {
          screen,
          status: "ok",
          message: `Logowanie: login=${p.loginPortal}, haslo=${maskPassword(p.haslo)}`,
          fieldsUsed: { login: p.loginPortal, haslo: maskPassword(p.haslo) },
        };
      } else if (screen === "formularz_dane_osobowe") {
        return {
          screen,
          status: "ok",
          message: `Wypelnianie danych: ${p.imie} ${p.nazwisko}`,
          fieldsUsed: {
            imie: p.imie,
            nazwisko: p.nazwisko,
            pesel: p.pesel,
            email: p.email,
            telefon: p.telefon,
            adres: p.adres,
            kod_pocztowy: p.kodPocztowy,
            miasto: p.miasto,
          },
        };
      } else if (screen === "WYMAGANE_RECZNE_WYSLANIE") {
        return {
          screen,
          status: "STOP",
          message: "Symulacja zakonczona. Wymagane reczne potwierdzenie i wyslanie.",
        };
      } else {
        return {
          screen,
          status: "ok",
          message: `Ekran '${screen}' — przejscie OK`,
        };
      }
    });

    return {
      participantId: p.id,
      imie: p.imie,
      nazwisko: p.nazwisko,
      loginPortal: p.loginPortal,
      finalStatus: "awaiting_manual_submit",
      steps,
    };
  });

  await db.insert(operationsTable).values({
    operationType: "simulate",
    status: "ok",
    summary: `Symulacja: ${simulations.length} uczestnikow, wszystkie oczekuja recznego wyslania`,
  });

  const report = {
    generatedAt: new Date().toISOString(),
    total: simulations.length,
    simulations,
  };

  res.json(RunSimulationResponse.parse(report));
});

router.get("/operations/history", async (_req, res): Promise<void> => {
  const ops = await db
    .select()
    .from(operationsTable)
    .orderBy(desc(operationsTable.createdAt))
    .limit(20);
  res.json(ListOperationHistoryResponse.parse(ops));
});

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const participants = await db.select().from(participantsTable);

  const validatedOk = participants.filter((p) => p.validationStatus === "ok").length;
  const validatedErrors = participants.filter((p) => p.validationStatus === "error").length;
  const notValidated = participants.filter((p) => !p.validationStatus).length;

  const lastValidationOp = await db
    .select()
    .from(operationsTable)
    .where(eq(operationsTable.operationType, "validate"))
    .orderBy(desc(operationsTable.createdAt))
    .limit(1);

  const lastSimulationOp = await db
    .select()
    .from(operationsTable)
    .where(eq(operationsTable.operationType, "simulate"))
    .orderBy(desc(operationsTable.createdAt))
    .limit(1);

  const scheduleSetting = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, "schedule_start_time"))
    .limit(1);

  const summary = {
    totalParticipants: participants.length,
    validatedOk,
    validatedErrors,
    notValidated,
    lastValidation: lastValidationOp[0]?.createdAt?.toISOString() ?? null,
    lastSimulation: lastSimulationOp[0]?.createdAt?.toISOString() ?? null,
    scheduleSet: scheduleSetting.length > 0,
    scheduledStart: scheduleSetting[0]?.value ?? null,
  };

  res.json(GetDashboardSummaryResponse.parse(summary));
});

router.get("/settings/schedule", async (_req, res): Promise<void> => {
  const settings = await db.select().from(settingsTable);

  const getValue = (key: string, def: string) => {
    const found = settings.find((s) => s.key === key);
    return found?.value ?? def;
  };

  const schedule = {
    startTime: getValue("schedule_start_time", "2026-04-10T16:00:00+02:00"),
    workers: parseInt(getValue("schedule_workers", "3"), 10),
    spacingSec: parseInt(getValue("schedule_spacing_sec", "2"), 10),
    portalUrl: getValue("portal_url", "https://przykladowy-portal-naboru.pl"),
  };

  res.json(GetScheduleResponse.parse(schedule));
});

router.put("/settings/schedule", async (req, res): Promise<void> => {
  const parsed = UpdateScheduleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const pairs: Array<{ key: string; value: string }> = [
    { key: "schedule_start_time", value: String(parsed.data.startTime) },
    { key: "schedule_workers", value: String(parsed.data.workers) },
    { key: "schedule_spacing_sec", value: String(parsed.data.spacingSec) },
    { key: "portal_url", value: String(parsed.data.portalUrl) },
  ];

  for (const pair of pairs) {
    const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, pair.key)).limit(1);
    if (existing.length > 0) {
      await db.update(settingsTable).set({ value: pair.value }).where(eq(settingsTable.key, pair.key));
    } else {
      await db.insert(settingsTable).values({ key: pair.key, value: pair.value });
    }
  }

  res.json(UpdateScheduleResponse.parse(parsed.data));
});

export default router;
