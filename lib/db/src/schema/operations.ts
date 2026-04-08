import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const operationsTable = pgTable("operations", {
  id: serial("id").primaryKey(),
  operationType: text("operation_type").notNull(),
  status: text("status").notNull(),
  summary: text("summary").notNull(),
  resultData: text("result_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOperationSchema = createInsertSchema(operationsTable).omit({ id: true, createdAt: true });
export type InsertOperation = z.infer<typeof insertOperationSchema>;
export type Operation = typeof operationsTable.$inferSelect;
