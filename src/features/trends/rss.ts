import { XMLParser } from "fast-xml-parser";

export type FeedEntry = {
  title: string;
  link: string;
  summary: string | null;
  publishedAt: Date | null;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  processEntities: true,
  htmlEntities: true,
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object" && "#text" in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)["#text"]);
  }
  return "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toDate(value: unknown): Date | null {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function atomLink(link: unknown): string {
  const links = asArray(link as Record<string, string> | Record<string, string>[]);
  const alternate = links.find((l) => !l["@rel"] || l["@rel"] === "alternate") ?? links[0];
  return alternate?.["@href"] ?? text(link);
}

/** Lê RSS 2.0 ou Atom e devolve uma lista normalizada. */
export function parseFeed(xml: string): FeedEntry[] {
  const doc = parser.parse(xml);

  if (doc?.rss?.channel) {
    return asArray(doc.rss.channel.item).map((item: Record<string, unknown>) => ({
      title: stripHtml(text(item.title)),
      link: text(item.link).trim(),
      summary: stripHtml(text(item.description)).slice(0, 400) || null,
      publishedAt: toDate(item.pubDate ?? item["dc:date"]),
    }));
  }

  if (doc?.feed) {
    return asArray(doc.feed.entry).map((entry: Record<string, unknown>) => ({
      title: stripHtml(text(entry.title)),
      link: atomLink(entry.link).trim(),
      summary: stripHtml(text(entry.summary ?? entry.content)).slice(0, 400) || null,
      publishedAt: toDate(entry.published ?? entry.updated),
    }));
  }

  throw new Error("Formato de feed não reconhecido (nem RSS nem Atom).");
}
