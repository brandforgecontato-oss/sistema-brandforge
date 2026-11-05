import "server-only";

import { desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { agentRuns } from "@/db/schema";

export function listRuns(limit = 50) {
  return db.select().from(agentRuns).orderBy(desc(agentRuns.createdAt)).limit(limit).all();
}

export function getRun(id: number) {
  if (!Number.isInteger(id)) return null;
  return db.select().from(agentRuns).where(eq(agentRuns.id, id)).get() ?? null;
}

/** A conversa inteira: o pedido, os anteriores dele (mesma sessão) e os que vieram depois. */
export function getThread(run: typeof agentRuns.$inferSelect) {
  let root = run;
  while (root.parentId) {
    const parent = getRun(root.parentId);
    if (!parent) break;
    root = parent;
  }
  const thread = [root];
  for (let i = 0; i < thread.length; i++) {
    thread.push(...db.select().from(agentRuns).where(eq(agentRuns.parentId, thread[i].id)).all());
  }
  return thread.sort((a, b) => a.id - b.id);
}

export function listActiveRuns() {
  return db.select().from(agentRuns).where(inArray(agentRuns.status, ["na_fila", "rodando"])).all();
}
