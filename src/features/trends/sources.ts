import { db } from "@/db/client";
import { trendSources } from "@/db/schema";

/** Fontes iniciais de IA/tech. Dá para ligar, desligar e adicionar outras pela página /tendencias. */
export const DEFAULT_TREND_SOURCES = [
  { name: "Hacker News (150+ pontos)", url: "https://hnrss.org/frontpage?points=150" },
  { name: "The Verge — IA", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { name: "TechCrunch — IA", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { name: "OpenAI News", url: "https://openai.com/news/rss.xml" },
  { name: "Google — IA", url: "https://blog.google/technology/ai/rss/" },
  { name: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml" },
  { name: "Tecnoblog", url: "https://tecnoblog.net/feed/" },
  { name: "Canaltech", url: "https://canaltech.com.br/rss/" },
];

/** Insere as fontes padrão que ainda não existem. Retorna quantas foram adicionadas. */
export function seedDefaultTrendSources(): number {
  const result = db.insert(trendSources).values(DEFAULT_TREND_SOURCES).onConflictDoNothing().run();
  return result.changes;
}
