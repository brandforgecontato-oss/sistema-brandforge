import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`);

export const TASK_STATUSES = ["a_fazer", "fazendo", "feito"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["baixa", "media", "alta"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** Quadro de tarefas único para todas as frentes. `project` é o nome da pasta do projeto ou "geral". */
export const tasks = sqliteTable(
  "tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    notes: text("notes"),
    project: text("project").notNull().default("geral"),
    status: text("status", { enum: TASK_STATUSES }).notNull().default("a_fazer"),
    priority: text("priority", { enum: TASK_PRIORITIES }).notNull().default("media"),
    dueAt: integer("due_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
    doneAt: integer("done_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("tasks_status_idx").on(t.status)],
);

export const trendSources = sqliteTable("trend_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  url: text("url").notNull().unique(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastFetchedAt: integer("last_fetched_at", { mode: "timestamp_ms" }),
  lastError: text("last_error"),
  createdAt: createdAt(),
});

export const TREND_STATUSES = ["novo", "salvo", "ideia", "descartado"] as const;
export type TrendStatus = (typeof TREND_STATUSES)[number];

export const trendItems = sqliteTable(
  "trend_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => trendSources.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    link: text("link").notNull(),
    summary: text("summary"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    status: text("status", { enum: TREND_STATUSES }).notNull().default("novo"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("trend_items_link_uq").on(t.link), index("trend_items_status_idx").on(t.status)],
);

export const JOB_TYPES = ["fetch_trends"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = ["pendente", "rodando", "concluido", "falhou"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Fila durável usada pelo worker (tendências agora; pipeline de vídeo na Fase 2). */
export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type", { enum: JOB_TYPES }).notNull(),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
    status: text("status", { enum: JOB_STATUSES }).notNull().default("pendente"),
    attempts: integer("attempts").notNull().default(0),
    runAt: integer("run_at", { mode: "timestamp_ms" }).notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    result: text("result"),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (t) => [index("jobs_status_run_idx").on(t.status, t.runAt)],
);
