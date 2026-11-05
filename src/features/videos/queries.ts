import "server-only";

import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db/client";
import { clips, jobs, videos } from "@/db/schema";
import { listVideoFiles } from "./tools";

export function listVideosWithClips() {
  const rows = db.select().from(videos).orderBy(desc(videos.createdAt)).all();
  const allClips = rows.length
    ? db.select().from(clips).where(inArray(clips.videoId, rows.map((r) => r.id))).all()
    : [];
  return rows.map((v) => ({ ...v, clips: allClips.filter((c) => c.videoId === v.id) }));
}

export function getVideoWithClips(id: number) {
  const video = db.select().from(videos).where(eq(videos.id, id)).get();
  if (!video) return null;
  const videoClips = db.select().from(clips).where(eq(clips.videoId, id)).orderBy(clips.startMs).all();
  return { ...video, clips: videoClips };
}

/** Arquivos na pasta de entrada que ainda não viraram um vídeo no painel. */
export function listUnregisteredFiles() {
  const known = new Set(
    db
      .select({ f: videos.fileName })
      .from(videos)
      .where(isNotNull(videos.fileName))
      .all()
      .map((r) => r.f),
  );
  return listVideoFiles("entrada").filter((f) => !known.has(f.name));
}

/** Há algo do pipeline de vídeo em andamento? (usado para atualizar a página sozinha) */
export function hasActiveVideoJobs(): boolean {
  return !!db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        inArray(jobs.type, ["video_download", "video_transcribe", "video_plan", "clip_render"]),
        inArray(jobs.status, ["pendente", "rodando"]),
      ),
    )
    .get();
}
