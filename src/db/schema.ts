import { pgTable, text, timestamp, integer, doublePrecision, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// 'users' table mapped to Firebase Authentication users
export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  uid: text("uid").notNull().unique(), // Firebase Auth UID
  email: text("email").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow(),
});

// 'records' table to persist log entries
export const records = pgTable("records", {
  id: doublePrecision("id").primaryKey(), // Using double precision to store JavaScript Date.now() + Math.random() safely
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  data: text("data").notNull(),
  dia: text("dia").notNull(),
  semana: integer("semana").notNull(),
  atividade: text("atividade").notNull(),
  colaborador: text("colaborador").notNull(),
  setor: text("setor"),
  volumes: integer("volumes").notNull(),
  horas: doublePrecision("horas").notNull(),
  vph: text("vph").notNull(),
  timestamp: doublePrecision("timestamp").notNull(),
  synced: boolean("synced").default(true).notNull(),
  tipo: text("tipo").notNull(), // 'direta' | 'indireta'
  createdAt: timestamp("created_at").defaultNow(),
});

// Relationships
export const usersRelations = relations(users, ({ many }) => ({
  records: many(records),
}));

export const recordsRelations = relations(records, ({ one }) => ({
  user: one(users, {
    fields: [records.userId],
    references: [users.id],
  }),
}));
