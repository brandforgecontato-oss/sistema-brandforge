import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { jobs, scripts, trendItems, videos } from "@/db/schema";

export function listScripts(limit = 100) {
  return db.select().from(scripts).orderBy(desc(scripts.createdAt)).limit(limit).all();
}

export function getScript(id: number) {
  const script = db.select().from(scripts).where(eq(scripts.id, id)).get();
  if (!script) return null;
  const trend = script.trendId ? db.select().from(trendItems).where(eq(trendItems.id, script.trendId)).get() : null;
  const video = script.videoId ? db.select().from(videos).where(eq(videos.id, script.videoId)).get() : null;
  return { ...script, trend: trend ?? null, video: video ?? null };
}

/** Roteiros prontos para gravar (aparecem na hora de enviar o vídeo). */
export function listScriptsToRecord() {
  return db
    .select({ id: scripts.id, title: scripts.title, topic: scripts.topic })
    .from(scripts)
    .where(eq(scripts.status, "rascunho"))
    .orderBy(desc(scripts.createdAt))
    .all();
}

export function hasActiveScriptJobs(): boolean {
  return !!db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.type, "script_generate"), inArray(jobs.status, ["pendente", "rodando"])))
    .get();
}

/** Id do roteiro já criado para cada tendência (para a página de tendências mostrar "ver roteiro"). */
export function scriptIdsByTrend(): Map<number, number> {
  const rows = db.select({ id: scripts.id, trendId: scripts.trendId }).from(scripts).all();
  return new Map(rows.filter((r) => r.trendId).map((r) => [r.trendId!, r.id]));
}

export function countScriptsToRecord(): number {
  return listScriptsToRecord().length;
}
