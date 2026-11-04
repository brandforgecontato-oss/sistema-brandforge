import "server-only";

import { count, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { type TrendStatus, trendItems, trendSources } from "@/db/schema";

export function listTrendItems(status: TrendStatus, limit = 80) {
  return db
    .select({
      id: trendItems.id,
      title: trendItems.title,
      link: trendItems.link,
      summary: trendItems.summary,
      publishedAt: trendItems.publishedAt,
      createdAt: trendItems.createdAt,
      status: trendItems.status,
      sourceName: trendSources.name,
    })
    .from(trendItems)
    .innerJoin(trendSources, eq(trendItems.sourceId, trendSources.id))
    .where(eq(trendItems.status, status))
    .orderBy(desc(sql`coalesce(${trendItems.publishedAt}, ${trendItems.createdAt})`))
    .limit(limit)
    .all();
}

export function countTrendsByStatus(): Record<TrendStatus, number> {
  const rows = db
    .select({ status: trendItems.status, total: count() })
    .from(trendItems)
    .groupBy(trendItems.status)
    .all();
  const out: Record<TrendStatus, number> = { novo: 0, salvo: 0, ideia: 0, descartado: 0 };
  for (const row of rows) out[row.status] = row.total;
  return out;
}

export function listTrendSources() {
  return db.select().from(trendSources).orderBy(trendSources.name).all();
}

export function latestNewTrends(limit = 5) {
  return listTrendItems("novo", limit);
}
