import { and, asc, eq, inArray, lte } from "drizzle-orm";

import { db } from "@/db/client";
import { type JobType, jobs } from "@/db/schema";

export const MAX_ATTEMPTS = 3;

export function enqueue(type: JobType, payload: Record<string, unknown> = {}, runAt = new Date()) {
  return db.insert(jobs).values({ type, payload, runAt }).returning({ id: jobs.id }).get();
}

/** Pega o próximo job vencido e marca como "rodando" na mesma transação. */
export function claimNext() {
  return db.transaction((tx) => {
    const next = tx
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, "pendente"), lte(jobs.runAt, new Date())))
      .orderBy(asc(jobs.runAt))
      .limit(1)
      .get();
    if (!next) return null;
    tx.update(jobs)
      .set({ status: "rodando", startedAt: new Date(), attempts: next.attempts + 1 })
      .where(eq(jobs.id, next.id))
      .run();
    return { ...next, attempts: next.attempts + 1 };
  });
}

export function complete(id: number, result: string) {
  db.update(jobs).set({ status: "concluido", finishedAt: new Date(), result, lastError: null }).where(eq(jobs.id, id)).run();
}

export function fail(id: number, attempts: number, error: string) {
  const retry = attempts < MAX_ATTEMPTS;
  const backoffMs = 60_000 * 2 ** (attempts - 1);
  db.update(jobs)
    .set({
      status: retry ? "pendente" : "falhou",
      runAt: retry ? new Date(Date.now() + backoffMs) : undefined,
      finishedAt: retry ? null : new Date(),
      lastError: error,
    })
    .where(eq(jobs.id, id))
    .run();
}

/** Jobs que ficaram "rodando" quando o worker caiu voltam para a fila. */
export function recoverStuck() {
  return db.update(jobs).set({ status: "pendente" }).where(eq(jobs.status, "rodando")).run().changes;
}

export function hasOpenJob(type: JobType) {
  return !!db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.type, type), inArray(jobs.status, ["pendente", "rodando"])))
    .get();
}
