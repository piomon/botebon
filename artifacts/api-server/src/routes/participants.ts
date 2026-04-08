import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, participantsTable } from "@workspace/db";
import {
  CreateParticipantBody,
  GetParticipantParams,
  GetParticipantResponse,
  UpdateParticipantParams,
  UpdateParticipantBody,
  UpdateParticipantResponse,
  DeleteParticipantParams,
  ListParticipantsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/participants", async (_req, res): Promise<void> => {
  const participants = await db
    .select()
    .from(participantsTable)
    .orderBy(participantsTable.createdAt);
  res.json(ListParticipantsResponse.parse(participants));
});

router.post("/participants", async (req, res): Promise<void> => {
  const parsed = CreateParticipantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [participant] = await db.insert(participantsTable).values(parsed.data).returning();
  res.status(201).json(GetParticipantResponse.parse(participant));
});

router.get("/participants/:id", async (req, res): Promise<void> => {
  const params = GetParticipantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [participant] = await db
    .select()
    .from(participantsTable)
    .where(eq(participantsTable.id, params.data.id));

  if (!participant) {
    res.status(404).json({ error: "Participant not found" });
    return;
  }

  res.json(GetParticipantResponse.parse(participant));
});

router.patch("/participants/:id", async (req, res): Promise<void> => {
  const params = UpdateParticipantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateParticipantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [participant] = await db
    .update(participantsTable)
    .set(parsed.data)
    .where(eq(participantsTable.id, params.data.id))
    .returning();

  if (!participant) {
    res.status(404).json({ error: "Participant not found" });
    return;
  }

  res.json(UpdateParticipantResponse.parse(participant));
});

router.delete("/participants/:id", async (req, res): Promise<void> => {
  const params = DeleteParticipantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [participant] = await db
    .delete(participantsTable)
    .where(eq(participantsTable.id, params.data.id))
    .returning();

  if (!participant) {
    res.status(404).json({ error: "Participant not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
