import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const participantsTable = pgTable("participants", {
  id: serial("id").primaryKey(),
  imie: text("imie").notNull(),
  nazwisko: text("nazwisko").notNull(),
  pesel: text("pesel").notNull(),
  email: text("email").notNull(),
  telefon: text("telefon").notNull(),
  adres: text("adres").notNull(),
  kodPocztowy: text("kod_pocztowy").notNull(),
  miasto: text("miasto").notNull(),
  loginPortal: text("login_portal").notNull(),
  haslo: text("haslo").notNull(),
  notatki: text("notatki"),
  portal: text("portal").default("ebon"),
  validationStatus: text("validation_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertParticipantSchema = createInsertSchema(participantsTable).omit({ id: true, createdAt: true });
export type InsertParticipant = z.infer<typeof insertParticipantSchema>;
export type Participant = typeof participantsTable.$inferSelect;
