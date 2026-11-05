"use server";

import { existsSync } from "node:fs";
import path from "node:path";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { CLIP_FRAMINGS, type ClipFraming, clips, videos } from "@/db/schema";
import { VIDEO_DIRS } from "@/lib/paths";
import { enqueue } from "@/worker/queue";

function refresh(videoId?: number) {
  revalidatePath("/videos");
  if (videoId) revalidatePath(`/videos/${videoId}`);
}

function clean(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

export async function addVideoFromUrl(formData: FormData): Promise<void> {
  const url = clean(formData.get("url"));
  if (!url || !/^https?:\/\//i.test(url)) return;
  const video = db
    .insert(videos)
    .values({ title: url, sourceUrl: url, guidance: clean(formData.get("guidance")) })
    .returning({ id: videos.id })
    .get();
  enqueue("video_download", { videoId: video.id });
  refresh();
  redirect(`/videos/${video.id}`);
}

export async function importFile(formData: FormData): Promise<void> {
  // Só o nome do arquivo — impede apontar para fora da pasta de entrada.
  const fileName = path.basename(String(formData.get("fileName") ?? ""));
  if (!fileName || !existsSync(path.join(VIDEO_DIRS.entrada, fileName))) return;
  const video = db
    .insert(videos)
    .values({
      title: fileName.replace(/\.[^.]+$/, ""),
      fileName,
      guidance: clean(formData.get("guidance")),
    })
    .returning({ id: videos.id })
    .get();
  enqueue("video_transcribe", { videoId: video.id });
  refresh();
  redirect(`/videos/${video.id}`);
}

/** Pede novos cortes ao Claude, com orientação opcional. Substitui só propostas não aprovadas. */
export async function replanVideo(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  db.update(videos)
    .set({ guidance: clean(formData.get("guidance")), status: "na_fila", error: null })
    .where(eq(videos.id, id))
    .run();
  enqueue("video_plan", { videoId: id });
  refresh(id);
}

/** Recomeça do passo que falhou. */
export async function retryVideo(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const video = db.select().from(videos).where(eq(videos.id, id)).get();
  if (!video) return;
  const hasTranscript = existsSync(path.join(VIDEO_DIRS.trabalho, String(id), "transcricao.json"));
  const job = !video.fileName ? "video_download" : hasTranscript ? "video_plan" : "video_transcribe";
  db.update(videos).set({ status: "na_fila", error: null }).where(eq(videos.id, id)).run();
  enqueue(job, { videoId: id });
  refresh(id);
}

export async function updateClip(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const start = Number(String(formData.get("start")).replace(",", "."));
  const end = Number(String(formData.get("end")).replace(",", "."));
  const hook = clean(formData.get("hook"));
  const framingRaw = String(formData.get("framing") ?? "desfocado") as ClipFraming;
  const framing = CLIP_FRAMINGS.includes(framingRaw) ? framingRaw : "desfocado";
  const cropX = Math.min(100, Math.max(0, Math.round(Number(formData.get("cropX") ?? 50)) || 0));
  const clip = db.select().from(clips).where(eq(clips.id, id)).get();
  if (!clip || !Number.isFinite(start) || !Number.isFinite(end) || end - start < 1) return;
  db.update(clips)
    .set({ startMs: Math.round(start * 1000), endMs: Math.round(end * 1000), hook: hook ?? "", framing, cropX })
    .where(eq(clips.id, id))
    .run();
  refresh(clip.videoId);
}

export async function renderClipAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const clip = db.select().from(clips).where(eq(clips.id, id)).get();
  if (!clip) return;
  db.update(clips).set({ status: "na_fila", error: null }).where(eq(clips.id, id)).run();
  enqueue("clip_render", { clipId: id });
  refresh(clip.videoId);
}

export async function discardClip(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const clip = db.select().from(clips).where(eq(clips.id, id)).get();
  if (!clip) return;
  db.update(clips).set({ status: "descartado" }).where(eq(clips.id, id)).run();
  refresh(clip.videoId);
}
