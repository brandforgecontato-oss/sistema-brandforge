import "server-only";

import { and, asc, count, desc, eq, gte, isNotNull, lt, ne, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { type TaskStatus, tasks } from "@/db/schema";

const priorityOrder = sql`case ${tasks.priority} when 'alta' then 0 when 'media' then 1 else 2 end`;

export function listTasks(status: TaskStatus, project?: string) {
  const where = project ? and(eq(tasks.status, status), eq(tasks.project, project)) : eq(tasks.status, status);
  if (status === "feito") {
    // Mostra só o que foi concluído nos últimos 14 dias para a coluna não crescer para sempre.
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    return db
      .select()
      .from(tasks)
      .where(and(where, gte(tasks.doneAt, new Date(cutoff))))
      .orderBy(desc(tasks.doneAt))
      .all();
  }
  return db
    .select()
    .from(tasks)
    .where(where)
    .orderBy(priorityOrder, asc(sql`coalesce(${tasks.dueAt}, 9e15)`), asc(tasks.createdAt)).all();
}

export function countOpenTasksByProject() {
  return db
    .select({ project: tasks.project, total: count() })
    .from(tasks)
    .where(ne(tasks.status, "feito"))
    .groupBy(tasks.project)
    .all();
}

export function listOverdueTasks() {
  return db
    .select()
    .from(tasks)
    .where(and(ne(tasks.status, "feito"), isNotNull(tasks.dueAt), lt(tasks.dueAt, new Date())))
    .orderBy(asc(tasks.dueAt))
    .all();
}

export function listFocusTasks(limit = 6) {
  return db
    .select()
    .from(tasks)
    .where(ne(tasks.status, "feito"))
    .orderBy(
      sql`case ${tasks.status} when 'fazendo' then 0 else 1 end`,
      priorityOrder,
      asc(sql`coalesce(${tasks.dueAt}, 9e15)`),
    )
    .limit(limit)
    .all();
}
