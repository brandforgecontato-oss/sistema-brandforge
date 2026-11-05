import { createWriteStream, existsSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { VIDEO_KINDS, type VideoKind, videos } from "@/db/schema";
import { VIDEO_DIRS, ensureDataDirs } from "@/lib/paths";
import { enqueue } from "@/worker/queue";

export const dynamic = "force-dynamic";

const EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi"]);

/** Nome seguro para o Windows e sem colidir com um arquivo que já está na pasta de entrada. */
function freeName(original: string): string {
  const ext = path.extname(original).toLowerCase();
  const base =
    path
      .basename(original, path.extname(original))
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
      .trim()
      .slice(0, 80) || "video";
  let name = `${base}${ext}`;
  for (let i = 2; existsSync(path.join(VIDEO_DIRS.entrada, name)); i++) name = `${base} (${i})${ext}`;
  return name;
}

/**
 * Recebe um vídeo enviado pelo navegador (corpo cru, nome em `?nome=`) e já coloca na fila.
 * Rota em vez de Server Action porque a action tem limite de 1 MB de corpo; aqui o arquivo vai direto para o disco.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const original = url.searchParams.get("nome") ?? "";
  const ext = path.extname(original).toLowerCase();
  if (!EXTENSIONS.has(ext)) {
    return Response.json({ error: `Formato não aceito (${ext || "sem extensão"}). Use MP4, MOV, MKV, WEBM ou AVI.` }, { status: 400 });
  }
  if (!request.body) return Response.json({ error: "Arquivo vazio." }, { status: 400 });

  const kindRaw = url.searchParams.get("kind") as VideoKind;
  const kind: VideoKind = VIDEO_KINDS.includes(kindRaw) ? kindRaw : "curto";
  const guidance = url.searchParams.get("orientacao")?.trim() || null;

  ensureDataDirs();
  const fileName = freeName(original);
  const finalPath = path.join(VIDEO_DIRS.entrada, fileName);
  // Grava com outro nome até terminar, para a lista da página não mostrar um arquivo pela metade.
  const partial = `${finalPath}.parcial`;
  try {
    await pipeline(Readable.fromWeb(request.body as NodeReadableStream), createWriteStream(partial));
    renameSync(partial, finalPath);
  } catch (e) {
    rmSync(partial, { force: true });
    return Response.json({ error: `O envio foi interrompido: ${(e as Error).message}` }, { status: 500 });
  }

  const video = db
    .insert(videos)
    .values({ title: fileName.replace(/\.[^.]+$/, ""), fileName, kind, guidance })
    .returning({ id: videos.id })
    .get();
  enqueue("video_transcribe", { videoId: video.id });
  revalidatePath("/videos");
  return Response.json({ id: video.id, fileName });
}
