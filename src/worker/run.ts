import { desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { type JobType, jobs } from "@/db/schema";
import { fetchAllTrends } from "@/features/trends/fetch";
import { claimNext, complete, enqueue, fail, hasOpenJob, recoverStuck } from "./queue";

const POLL_MS = 5_000;
const TRENDS_INTERVAL_MS = Number(process.env.TRENDS_INTERVAL_MIN ?? 180) * 60_000;

const handlers: Record<JobType, (payload: Record<string, unknown>) => Promise<string>> = {
  fetch_trends: async () => {
    const summary = await fetchAllTrends();
    const errors = summary.errors.length ? ` | erros: ${summary.errors.join("; ")}` : "";
    return `${summary.newItems} itens novos de ${summary.sources} fontes${errors}`;
  },
};

/** Agenda a busca de tendências se a última terminou há mais tempo que o intervalo. */
function scheduleTrends() {
  if (hasOpenJob("fetch_trends")) return;
  const last = db
    .select({ finishedAt: jobs.finishedAt })
    .from(jobs)
    .where(eq(jobs.type, "fetch_trends"))
    .orderBy(desc(jobs.createdAt))
    .get();
  const lastAt = last?.finishedAt?.getTime() ?? 0;
  if (Date.now() - lastAt >= TRENDS_INTERVAL_MS) enqueue("fetch_trends");
}

let stopping = false;

async function tick() {
  scheduleTrends();
  const job = claimNext();
  if (!job) return;
  const started = Date.now();
  try {
    const result = await handlers[job.type](job.payload ?? {});
    complete(job.id, result);
    console.log(`[worker] ${job.type}#${job.id} ok em ${Date.now() - started}ms — ${result}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(job.id, job.attempts, message);
    console.error(`[worker] ${job.type}#${job.id} falhou (tentativa ${job.attempts}): ${message}`);
  }
}

async function main() {
  const recovered = recoverStuck();
  console.log(`[worker] iniciado. Tendências a cada ${TRENDS_INTERVAL_MS / 60_000} min.${recovered ? ` ${recovered} job(s) recuperado(s).` : ""}`);
  while (!stopping) {
    await tick().catch((e) => console.error("[worker] erro no ciclo:", e));
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  console.log("[worker] encerrado.");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

void main();
