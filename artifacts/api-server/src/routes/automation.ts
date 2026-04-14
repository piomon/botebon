import { Router, type IRouter } from "express";
import { db, participantsTable, operationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  runAutomationForParticipant, runAutomationForAll, runFstAutomationForParticipant,
  fstPreloginAll, fstSubmitAll, fstCleanupAll, getFstSessionsStatus, fstDryRunSingle,
  getFstSubmitJobStatus, setFstSubmitJob,
  type AutomationResult, type StepLog, type PortalType
} from "../automation/browser";
import { chromium } from "playwright-core";
import { existsSync } from "fs";

const router: IRouter = Router();

router.post("/automation/prewarm", async (_req, res): Promise<void> => {
  const start = Date.now();
  const chromiumPaths = [
    process.env.CHROMIUM_PATH,
    "/nix/store/zi4f80l169xlmivz8vja8wkjir5p9bfm-chromium-136.0.7103.113/bin/chromium",
    "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
  ].filter(Boolean) as string[];

  const chromiumPath = chromiumPaths.find(p => existsSync(p));
  if (!chromiumPath) {
    res.json({ ok: false, error: "Chromium not found", ms: Date.now() - start });
    return;
  }

  try {
    const browser = await chromium.launch({
      headless: true,
      executablePath: chromiumPath,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    const page = await browser.newPage();
    await page.goto("https://projektebon.pl", { waitUntil: "domcontentloaded", timeout: 15000 });
    const title = await page.title();
    await browser.close();
    res.json({ ok: true, chromiumPath, title, ms: Date.now() - start });
  } catch (err: any) {
    res.json({ ok: false, error: err.message, ms: Date.now() - start });
  }
});

const activeJobs: Map<string, {
  status: "running" | "completed" | "error";
  results: AutomationResult[];
  progress: Map<number, StepLog[]>;
  startedAt: string;
  finishedAt?: string;
  totalParticipants: number;
  completedCount: number;
}> = new Map();

router.post("/automation/run-single/:id", async (req, res): Promise<void> => {
  const participantId = parseInt(req.params.id, 10);
  if (isNaN(participantId)) {
    res.status(400).json({ error: "Nieprawidlowe ID uczestnika" });
    return;
  }

  const [participant] = await db.select().from(participantsTable).where(eq(participantsTable.id, participantId));
  if (!participant) {
    res.status(404).json({ error: "Uczestnik nie znaleziony" });
    return;
  }

  res.json({ message: "Automatyzacja uruchomiona", participantId });

  try {
    const result = await runAutomationForParticipant(participant as any);

    await db.insert(operationsTable).values({
      operationType: "automation",
      status: result.status === "error" ? "errors" : "ok",
      summary: `Automatyzacja: ${participant.imie} ${participant.nazwisko} — ${result.status}, ${result.steps.length} krokow`,
      resultData: JSON.stringify(result),
    });
  } catch (err: any) {
    await db.insert(operationsTable).values({
      operationType: "automation",
      status: "errors",
      summary: `Automatyzacja: ${participant.imie} ${participant.nazwisko} — blad: ${err.message}`,
    });
  }
});

router.post("/automation/run-all", async (req, res): Promise<void> => {
  const portal: PortalType = req.body?.portal === "fst" ? "fst" : "ebon";
  const jobId = `job_${Date.now()}`;
  const allParticipants = await db.select().from(participantsTable).orderBy(participantsTable.id);
  const participants = allParticipants.filter(p => {
    const pp = p.portal || "ebon";
    return pp === portal || pp === "both";
  });

  const job = {
    status: "running" as const,
    results: [] as AutomationResult[],
    progress: new Map<number, StepLog[]>(),
    startedAt: new Date().toISOString(),
    totalParticipants: participants.length,
    completedCount: 0,
  };
  activeJobs.set(jobId, job);

  res.json({ message: `Automatyzacja ${portal.toUpperCase()} uruchomiona dla wszystkich uczestnikow`, jobId, total: participants.length, portal });

  (async () => {
    try {
      const results = await runAutomationForAll(
        participants as any[],
        (participantId, step) => {
          const existing = job.progress.get(participantId) || [];
          existing.push(step);
          job.progress.set(participantId, existing);
          job.completedCount = Array.from(job.progress.values()).filter(steps => 
            steps.some(s => s.step === "blad_krytyczny" || s.step === "wyslanie_wniosku" || s.step === "stop_przed_wyslaniem")
          ).length;
        },
        3,
        portal
      );

      job.results = results;
      job.status = "completed";
      job.finishedAt = new Date().toISOString();
      job.completedCount = results.length;

      const okCount = results.filter(r => r.status !== "error").length;
      const errCount = results.filter(r => r.status === "error").length;

      await db.insert(operationsTable).values({
        operationType: "automation",
        status: errCount > 0 ? "errors" : "ok",
        summary: `Automatyzacja masowa: ${results.length} uczestnikow, ${okCount} OK, ${errCount} bledow`,
        resultData: JSON.stringify(results),
      });
    } catch (err: any) {
      job.status = "error";
      job.finishedAt = new Date().toISOString();
    }
  })();
});

router.get("/automation/status/:jobId", async (req, res): Promise<void> => {
  const job = activeJobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Zadanie nie znalezione" });
    return;
  }

  const progress: Record<number, StepLog[]> = {};
  job.progress.forEach((steps, pid) => {
    progress[pid] = steps;
  });

  res.json({
    status: job.status,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    totalParticipants: job.totalParticipants,
    completedCount: job.completedCount,
    progress,
    results: job.status === "completed" ? job.results : undefined,
  });
});

router.post("/automation/run-single-sync/:id", async (req, res): Promise<void> => {
  const participantId = parseInt(req.params.id, 10);
  if (isNaN(participantId)) {
    res.status(400).json({ error: "Nieprawidlowe ID uczestnika" });
    return;
  }

  const [participant] = await db.select().from(participantsTable).where(eq(participantsTable.id, participantId));
  if (!participant) {
    res.status(404).json({ error: "Uczestnik nie znaleziony" });
    return;
  }

  try {
    const dbPortal = (participant as any).portal || "ebon";
    const requestedPortal = req.body?.portal;
    const usePortal = requestedPortal || (dbPortal === "fst" ? "fst" : dbPortal === "both" ? "ebon" : dbPortal);
    const autoSubmit = req.body?.autoSubmit !== false;
    const result = usePortal === "fst"
      ? await runFstAutomationForParticipant(participant as any, undefined, autoSubmit)
      : await runAutomationForParticipant(participant as any, undefined, autoSubmit);

    await db.insert(operationsTable).values({
      operationType: "automation",
      status: result.status === "error" ? "errors" : "ok",
      summary: `Automatyzacja (${usePortal.toUpperCase()}): ${participant.imie} ${participant.nazwisko} — ${result.status}, ${result.steps.length} krokow`,
      resultData: JSON.stringify(result),
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ========== FST TWO-PHASE: Pre-login + Submit ==========

router.get("/automation/fst-sessions", async (_req, res): Promise<void> => {
  res.json({ sessions: getFstSessionsStatus() });
});

router.post("/automation/fst-prelogin", async (req, res): Promise<void> => {
  const concurrency = req.body?.concurrency || 3;
  const allParticipants = await db.select().from(participantsTable).orderBy(participantsTable.id);
  const fstParticipants = allParticipants.filter(p => {
    const pp = (p as any).portal || "ebon";
    return pp === "fst" || pp === "both";
  });

  if (fstParticipants.length === 0) {
    res.json({ message: "Brak uczestnikow FST", total: 0 });
    return;
  }

  res.json({ message: `Pre-login FST uruchomiony dla ${fstParticipants.length} uczestnikow`, total: fstParticipants.length });

  (async () => {
    try {
      const results = await fstPreloginAll(fstParticipants as any[], undefined, concurrency);
      const okCount = results.filter(r => r.success).length;
      const errCount = results.filter(r => !r.success).length;

      await db.insert(operationsTable).values({
        operationType: "fst_prelogin",
        status: errCount > 0 ? "errors" : "ok",
        summary: `FST Pre-login: ${okCount} zalogowanych, ${errCount} bledow z ${fstParticipants.length} uczestnikow`,
        resultData: JSON.stringify(results),
      });
    } catch (err: any) {
      await db.insert(operationsTable).values({
        operationType: "fst_prelogin",
        status: "errors",
        summary: `FST Pre-login blad: ${err.message}`,
      });
    }
  })();
});

router.post("/automation/fst-submit", async (req, res): Promise<void> => {
  const concurrency = req.body?.concurrency || 3;
  const autoSubmit = req.body?.autoSubmit !== false;
  const allParticipants = await db.select().from(participantsTable).orderBy(participantsTable.id);
  const fstParticipants = allParticipants.filter(p => {
    const pp = (p as any).portal || "ebon";
    return pp === "fst" || pp === "both";
  });

  if (fstParticipants.length === 0) {
    res.json({ message: "Brak uczestnikow FST", total: 0 });
    return;
  }

  const sessions = getFstSessionsStatus();
  const readySessions = sessions.filter(s => s.status === "ready");

  const job = {
    status: "running" as const,
    startedAt: new Date().toISOString(),
    totalParticipants: fstParticipants.length,
    completedCount: 0,
    results: [] as AutomationResult[],
    progress: {} as Record<number, any[]>,
    autoSubmit,
  };
  setFstSubmitJob(job);

  res.json({
    message: `FST Submit uruchomiony. Gotowych sesji: ${readySessions.length}/${fstParticipants.length}`,
    total: fstParticipants.length,
    readyCount: readySessions.length,
    autoSubmit,
  });

  (async () => {
    try {
      const onProgress = (participantId: number, step: any) => {
        if (!job.progress[participantId]) job.progress[participantId] = [];
        job.progress[participantId].push(step);
      };
      const results = await fstSubmitAll(fstParticipants as any[], onProgress, concurrency, autoSubmit);
      job.results = results;
      job.completedCount = results.length;
      job.status = "completed";
      job.finishedAt = new Date().toISOString();
      setFstSubmitJob(job);

      const okCount = results.filter(r => r.status !== "error").length;
      const errCount = results.filter(r => r.status === "error").length;

      await db.insert(operationsTable).values({
        operationType: "fst_submit",
        status: errCount > 0 ? "errors" : "ok",
        summary: `FST Submit: ${okCount} OK, ${errCount} bledow z ${fstParticipants.length} uczestnikow`,
        resultData: JSON.stringify(results),
      });
    } catch (err: any) {
      job.status = "error";
      job.finishedAt = new Date().toISOString();
      setFstSubmitJob(job);
      await db.insert(operationsTable).values({
        operationType: "fst_submit",
        status: "errors",
        summary: `FST Submit blad: ${err.message}`,
      });
    }
  })();
});

router.get("/automation/fst-submit-status", async (req, res): Promise<void> => {
  const job = getFstSubmitJobStatus();
  if (!job) {
    res.json({ status: "idle", message: "Brak aktywnego submitu" });
    return;
  }
  const includeScreenshots = req.query.screenshots === "1";
  const stripScreenshot = (step: any) => {
    const { screenshot, ...rest } = step;
    return { ...rest, hasScreenshot: !!screenshot };
  };
  const lite = {
    ...job,
    results: (job.results || []).map((r: any) => ({
      ...r,
      steps: (r.steps || []).map((s: any) => includeScreenshots ? s : stripScreenshot(s)),
    })),
    progress: Object.fromEntries(
      Object.entries(job.progress || {}).map(([k, steps]) => [
        k,
        (steps as any[]).map((s: any) => includeScreenshots ? s : stripScreenshot(s)),
      ])
    ),
  };
  res.json(lite);
});

router.get("/automation/fst-submit-screenshot/:participantId/:stepIndex", async (req, res): Promise<void> => {
  const job = getFstSubmitJobStatus();
  if (!job) { res.status(404).json({ error: "Brak joba" }); return; }
  const pid = parseInt(req.params.participantId);
  const si = parseInt(req.params.stepIndex);
  const result = (job.results || []).find((r: any) => r.participantId === pid);
  if (result) {
    const step = (result.steps || [])[si];
    if (step?.screenshot) {
      res.json({ screenshot: step.screenshot });
      return;
    }
  }
  const progressSteps = (job.progress || {})[pid];
  if (progressSteps) {
    const step = (progressSteps as any[])[si];
    if (step?.screenshot) {
      res.json({ screenshot: step.screenshot });
      return;
    }
  }
  res.status(404).json({ error: "Brak screenshota" });
});

router.post("/automation/fst-cleanup", async (_req, res): Promise<void> => {
  const result = await fstCleanupAll();
  res.json({ message: `Zamknieto ${result.closed} przegladarek`, ...result });
});

router.post("/automation/fst-dryrun/:id", async (req, res): Promise<void> => {
  const participantId = parseInt(req.params.id, 10);
  if (isNaN(participantId)) {
    res.status(400).json({ error: "Nieprawidlowe ID uczestnika" });
    return;
  }

  const [participant] = await db.select().from(participantsTable).where(eq(participantsTable.id, participantId));
  if (!participant) {
    res.status(404).json({ error: "Uczestnik nie znaleziony" });
    return;
  }

  const pp = (participant as any).portal || "ebon";
  if (pp !== "fst" && pp !== "both") {
    res.status(400).json({ error: "Uczestnik nie jest przypisany do FST" });
    return;
  }

  try {
    const result = await fstDryRunSingle(participant as any);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/automation/explore-fst", async (req, res): Promise<void> => {
  const { login, password } = req.body || {};
  if (!login || !password) {
    res.status(400).json({ error: "Wymagane login i password" });
    return;
  }

  try {
    const { exploreFstPortal } = await import("../automation/browser");
    const result = await exploreFstPortal(login, password);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
