import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { type BrollItem, type BrollLayout, clips } from "@/db/schema";
import { VIDEO_DIRS } from "@/lib/paths";

/**
 * B-roll pelo banco gratuito do Pexels (fotos e vídeos liberados para uso comercial).
 * Precisa de PEXELS_API_KEY no .env — chave grátis em https://www.pexels.com/api/
 */
const API = "https://api.pexels.com";

export function hasPexelsKey(): boolean {
  return !!process.env.PEXELS_API_KEY?.trim();
}

export function brollDir(videoId: number): string {
  const dir = path.join(VIDEO_DIRS.trabalho, String(videoId), "broll");
  mkdirSync(dir, { recursive: true });
  return dir;
}

type PexelsVideo = {
  id: number;
  url: string;
  duration: number;
  user?: { name?: string };
  video_files: { file_type: string; width: number; height: number; link: string }[];
};
type PexelsPhoto = { id: number; url: string; photographer?: string; src: Record<string, string> };

async function pexels<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${API}${endpoint}?${new URLSearchParams(params)}`, {
    headers: { Authorization: process.env.PEXELS_API_KEY!.trim() },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 401 || res.status === 403) throw new Error("chave do Pexels recusada — confira PEXELS_API_KEY no .env");
  if (res.status === 429) throw new Error("limite de buscas do Pexels atingido (200/hora) — tente mais tarde");
  if (!res.ok) throw new Error(`Pexels respondeu ${res.status}`);
  return (await res.json()) as T;
}

async function download(url: string, file: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok || !res.body) throw new Error(`download falhou (${res.status})`);
  const partial = `${file}.parcial`;
  try {
    await pipeline(Readable.fromWeb(res.body as NodeReadableStream), createWriteStream(partial));
    renameSync(partial, file);
  } catch (e) {
    rmSync(partial, { force: true });
    throw e;
  }
}

/** Arquivo MP4 com qualidade suficiente para 1080 de largura, sem baixar um 4K à toa. */
function bestFile(v: PexelsVideo) {
  const mp4 = v.video_files.filter((f) => f.file_type === "video/mp4" && f.width && f.height);
  const short = (f: { width: number; height: number }) => Math.min(f.width, f.height);
  const good = mp4.filter((f) => short(f) >= 1080).sort((a, b) => short(a) - short(b));
  return good[0] ?? mp4.sort((a, b) => short(b) - short(a))[0];
}

/** Busca e baixa a mídia de um item. `used` evita repetir o mesmo vídeo no mesmo corte. */
async function fetchItem(videoId: number, index: number, item: BrollItem, layout: BrollLayout, used: Set<string>): Promise<BrollItem> {
  const orientation = layout === "metade" ? "landscape" : "portrait";
  const seconds = (item.endMs - item.startMs) / 1000;
  const pick = item.pick ?? 0;
  const dir = brollDir(videoId);

  const videosRes = await pexels<{ videos: PexelsVideo[] }>("/videos/search", {
    query: item.query,
    orientation,
    per_page: "15",
    size: "medium",
  });
  const videos = videosRes.videos.filter((v) => v.duration >= seconds && bestFile(v) && !used.has(`v${v.id}`));
  if (videos.length) {
    const v = videos[pick % videos.length];
    const file = `${index}-pexels-${v.id}.mp4`;
    if (!existsSync(path.join(dir, file))) await download(bestFile(v)!.link, path.join(dir, file));
    used.add(`v${v.id}`);
    return { ...item, file, media: "video", credit: v.user?.name ?? "Pexels", sourceUrl: v.url, error: undefined };
  }

  // Sem vídeo bom: foto (vira um zoom lento no render).
  const photosRes = await pexels<{ photos: PexelsPhoto[] }>("/v1/search", { query: item.query, orientation, per_page: "15" });
  const photos = photosRes.photos.filter((p) => !used.has(`f${p.id}`));
  if (!photos.length) return { ...item, file: null, error: "nada encontrado — troque os termos de busca" };
  const p = photos[pick % photos.length];
  const file = `${index}-pexels-${p.id}.jpg`;
  if (!existsSync(path.join(dir, file))) await download(p.src.large2x ?? p.src.original, path.join(dir, file));
  used.add(`f${p.id}`);
  return { ...item, file, media: "foto", credit: p.photographer ?? "Pexels", sourceUrl: p.url, error: undefined };
}

/** Job `broll_fetch`: baixa a mídia de todo item ativo que ainda não tem arquivo. */
export async function fetchBroll(payload: Record<string, unknown>): Promise<string> {
  const clipId = Number(payload.clipId);
  const clip = db.select().from(clips).where(eq(clips.id, clipId)).get();
  if (!clip) return `corte #${clipId} não existe mais`;
  const items = clip.broll ?? [];
  if (!items.length) return "sem B-roll";
  if (!hasPexelsKey()) return "sem PEXELS_API_KEY — B-roll não baixado";

  const used = new Set(
    items.filter((i) => i.file).map((i) => (i.media === "foto" ? "f" : "v") + (i.file!.match(/pexels-(\d+)/)?.[1] ?? "")),
  );
  const next: BrollItem[] = [];
  let fetched = 0;
  let failed = 0;
  for (const [index, item] of items.entries()) {
    if (item.keep === false || (item.file && existsSync(path.join(brollDir(clip.videoId), item.file)))) {
      next.push(item);
      continue;
    }
    try {
      next.push(await fetchItem(clip.videoId, index, item, clip.brollLayout, used));
      fetched++;
    } catch (e) {
      failed++;
      next.push({ ...item, file: null, error: (e as Error).message.slice(0, 200) });
    }
  }
  // Relê antes de gravar para não apagar ajustes salvos na página enquanto baixava.
  const fresh = db.select({ broll: clips.broll }).from(clips).where(eq(clips.id, clipId)).get();
  const merged = next.map((n, i) => {
    const cur = fresh?.broll?.[i];
    return cur && cur.query === n.query && (cur.pick ?? 0) === (n.pick ?? 0) ? { ...n, keep: cur.keep } : (cur ?? n);
  });
  db.update(clips).set({ broll: merged }).where(eq(clips.id, clipId)).run();
  return `B-roll: ${fetched} baixado(s)${failed ? `, ${failed} com erro` : ""}`;
}
