import { Router, type IRouter } from "express";
import { db, participantsTable, operationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { runAutomationForParticipant, runAutomationForAll, type AutomationResult, type StepLog } from "../automation/browser";

const router: IRouter = Router();

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
  const jobId = `job_${Date.now()}`;
  const participants = await db.select().from(participantsTable).orderBy(participantsTable.id);

  const job = {
    status: "running" as const,
    results: [] as AutomationResult[],
    progress: new Map<number, StepLog[]>(),
    startedAt: new Date().toISOString(),
    totalParticipants: participants.length,
    completedCount: 0,
  };
  activeJobs.set(jobId, job);

  res.json({ message: "Automatyzacja uruchomiona dla wszystkich uczestnikow", jobId, total: participants.length });

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
        11
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
    const result = await runAutomationForParticipant(participant as any);

    await db.insert(operationsTable).values({
      operationType: "automation",
      status: result.status === "error" ? "errors" : "ok",
      summary: `Automatyzacja: ${participant.imie} ${participant.nazwisko} — ${result.status}, ${result.steps.length} krokow`,
      resultData: JSON.stringify(result),
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
