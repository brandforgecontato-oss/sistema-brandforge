import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { trendItems, trendSources } from "@/db/schema";
import { parseFeed } from "./rss";

export type FetchSummary = { sources: number; newItems: number; errors: string[] };

const MAX_ITEMS_PER_SOURCE = 30;

async function fetchSource(source: typeof trendSources.$inferSelect): Promise<number> {
  const response = await fetch(source.url, {
    headers: { "User-Agent": "BrandForge-Painel/0.1 (leitor RSS)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const entries = parseFeed(await response.text())
    .filter((e) => e.title && e.link.startsWith("http"))
    .slice(0, MAX_ITEMS_PER_SOURCE);

  let inserted = 0;
  for (const entry of entries) {
    const result = db
      .insert(trendItems)
      .values({ sourceId: source.id, ...entry })
      .onConflictDoNothing()
      .run();
    inserted += result.changes;
  }
  return inserted;
}

/** Busca todas as fontes ativas. Uma fonte com erro não impede as outras. */
export async function fetchAllTrends(): Promise<FetchSummary> {
  const sources = db.select().from(trendSources).where(eq(trendSources.enabled, true)).all();
  const summary: FetchSummary = { sources: sources.length, newItems: 0, errors: [] };

  await Promise.all(
    sources.map(async (source) => {
      try {
        // Não usar `+= await`: o valor antigo é lido antes do await e as fontes em paralelo se sobrescreveriam.
        const inserted = await fetchSource(source);
        summary.newItems += inserted;
        db.update(trendSources)
          .set({ lastFetchedAt: new Date(), lastError: null })
          .where(eq(trendSources.id, source.id))
          .run();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        summary.errors.push(`${source.name}: ${message}`);
        db.update(trendSources)
          .set({ lastFetchedAt: new Date(), lastError: message })
          .where(eq(trendSources.id, source.id))
          .run();
      }
    }),
  );

  return summary;
}
