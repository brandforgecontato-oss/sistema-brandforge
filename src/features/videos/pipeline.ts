import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { type VideoStatus, clips, videos } from "@/db/schema";
import { VIDEO_DIRS } from "@/lib/paths";
import { WHISPER_MODEL, runTool, toolPath } from "@/lib/tools";
import { enqueue } from "@/worker/queue";
import { buildAss } from "./captions";
import { planClips } from "./plan";
import { type Transcript, parseWhisperJson, snapToWords } from "./transcript";

export function videoWorkDir(videoId: number): string {
  const dir = path.join(VIDEO_DIRS.trabalho, String(videoId));
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function transcriptPath(videoId: number): string {
  return path.join(videoWorkDir(videoId), "transcricao.json");
}

export async function loadTranscript(videoId: number): Promise<Transcript | null> {
  const file = transcriptPath(videoId);
  if (!existsSync(file)) return null;
  return JSON.parse(await readFile(file, "utf8")) as Transcript;
}

function setVideo(id: number, values: Partial<typeof videos.$inferInsert>) {
  db.update(videos).set({ ...values, updatedAt: new Date() }).where(eq(videos.id, id)).run();
}

function getVideo(id: number) {
  const video = db.select().from(videos).where(eq(videos.id, id)).get();
  if (!video) throw new Error(`vídeo #${id} não existe mais`);
  return video;
}

/** Marca o vídeo com erro e repassa a exceção para a fila registrar a tentativa. */
async function step<T>(videoId: number, status: VideoStatus, fn: () => Promise<T>): Promise<T> {
  setVideo(videoId, { status, error: null });
  try {
    return await fn();
  } catch (error) {
    setVideo(videoId, { status: "erro", error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

function slug(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "video"
  );
}

// ---------- 1. Baixar ----------

export async function downloadVideo(payload: Record<string, unknown>): Promise<string> {
  const videoId = Number(payload.videoId);
  const video = getVideo(videoId);
  if (!video.sourceUrl) throw new Error("vídeo sem URL");

  return step(videoId, "baixando", async () => {
    const { stdout } = await runTool(
      "ytdlp",
      [
        "--no-playlist",
        "--windows-filenames",
        "-f",
        "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080]/b",
        "--merge-output-format",
        "mp4",
        "--ffmpeg-location",
        path.dirname(toolPath("ffmpeg")),
        "-o",
        path.join(VIDEO_DIRS.entrada, "%(title).70B [%(id)s].%(ext)s"),
        "-O",
        "after_move:%(title)s|||%(filepath)s",
        video.sourceUrl!,
      ],
      { timeoutMs: 30 * 60_000 },
    );
    const line = stdout.trim().split("\n").filter(Boolean).pop() ?? "";
    const [title, filePath] = line.split("|||");
    if (!filePath || !existsSync(filePath.trim())) throw new Error(`yt-dlp não informou o arquivo baixado: ${line}`);

    setVideo(videoId, { title: title?.trim() || video.title, fileName: path.basename(filePath.trim()), status: "na_fila" });
    enqueue("video_transcribe", { videoId });
    return `baixado: ${path.basename(filePath.trim())}`;
  });
}

// ---------- 2. Transcrever ----------

async function probeDurationMs(file: string): Promise<number> {
  const { stdout } = await runTool("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds)) throw new Error(`ffprobe não leu a duração: ${stdout}`);
  return Math.round(seconds * 1000);
}

export async function transcribeVideo(payload: Record<string, unknown>): Promise<string> {
  const videoId = Number(payload.videoId);
  const video = getVideo(videoId);
  if (!video.fileName) throw new Error("vídeo sem arquivo");
  const source = path.join(VIDEO_DIRS.entrada, video.fileName);
  if (!existsSync(source)) throw new Error(`arquivo não encontrado: ${source}`);

  return step(videoId, "transcrevendo", async () => {
    const dir = videoWorkDir(videoId);
    const durationMs = await probeDurationMs(source);
    const wav = path.join(dir, "audio.wav");
    await runTool("ffmpeg", ["-y", "-loglevel", "error", "-i", source, "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav], {
      timeoutMs: 20 * 60_000,
    });

    const outBase = path.join(dir, "whisper");
    await runTool(
      "whisper",
      [
        "-m", WHISPER_MODEL, "-f", wav, "-l", video.language, "-ojf", "-of", outBase, "-np", "-t", "8",
        // Vocabulário inicial: ajuda o modelo a escrever nomes próprios certo ("BrandForge" em vez de "Brand Forge").
        "--prompt", process.env.WHISPER_PROMPT ?? "Vídeo da BrandForge sobre marca, branding, Instagram e Reels.",
      ],
      { timeoutMs: 2 * 60 * 60_000 },
    );

    const raw = JSON.parse(await readFile(`${outBase}.json`, "utf8"));
    const transcript = parseWhisperJson(raw, durationMs);
    await writeFile(transcriptPath(videoId), JSON.stringify(transcript));

    setVideo(videoId, { durationMs, status: "na_fila" });
    enqueue("video_plan", { videoId });
    return `${transcript.words.length} palavras em ${Math.round(durationMs / 1000)} s`;
  });
}

// ---------- 3. Claude escolhe os cortes ----------

export async function planVideo(payload: Record<string, unknown>): Promise<string> {
  const videoId = Number(payload.videoId);
  const video = getVideo(videoId);

  return step(videoId, "planejando", async () => {
    const transcript = await loadTranscript(videoId);
    if (!transcript) throw new Error("transcrição não encontrada — transcreva de novo");
    if (transcript.words.length < 5) throw new Error("quase nenhuma fala detectada no vídeo");

    const proposals = await planClips({
      title: video.title,
      transcript,
      guidance: video.guidance,
      workDir: videoWorkDir(videoId),
    });

    db.transaction((tx) => {
      // Replanejar substitui só as propostas ainda não aprovadas; cortes já renderizados ficam.
      tx.delete(clips).where(and(eq(clips.videoId, videoId), eq(clips.status, "proposto"))).run();
      for (const p of proposals) {
        const snapped = snapToWords(transcript, p.start * 1000, p.end * 1000);
        tx.insert(clips)
          .values({ videoId, title: p.title, hook: p.hook, reason: p.reason, ...snapped })
          .run();
      }
    });

    setVideo(videoId, { status: "revisar" });
    return `${proposals.length} corte(s) proposto(s)`;
  });
}

// ---------- 4. Renderizar um corte aprovado ----------

export async function renderClip(payload: Record<string, unknown>): Promise<string> {
  const clipId = Number(payload.clipId);
  const clip = db.select().from(clips).where(eq(clips.id, clipId)).get();
  if (!clip) throw new Error(`corte #${clipId} não existe mais`);
  const video = getVideo(clip.videoId);
  const source = path.join(VIDEO_DIRS.entrada, video.fileName ?? "");
  if (!video.fileName || !existsSync(source)) throw new Error(`arquivo original não encontrado: ${source}`);

  db.update(clips).set({ status: "renderizando", error: null }).where(eq(clips.id, clipId)).run();
  try {
    const transcript = await loadTranscript(video.id);
    const clipMs = clip.endMs - clip.startMs;
    const words = (transcript?.words ?? [])
      .filter((w) => w.endMs > clip.startMs && w.startMs < clip.endMs)
      .map((w) => ({ ...w, startMs: w.startMs - clip.startMs, endMs: w.endMs - clip.startMs }));

    const dir = path.join(videoWorkDir(video.id), `corte-${clip.id}`);
    mkdirSync(dir, { recursive: true });
    // O filtro "subtitles" do FFmpeg se confunde com "C:\" no caminho; por isso roda dentro da pasta com nome relativo.
    await writeFile(path.join(dir, "legenda.ass"), buildAss(words, clip.hook, clipMs), "utf8");

    const outputFile = `${slug(video.title)}-corte-${clip.id}.mp4`;
    const output = path.join(VIDEO_DIRS.saida, outputFile);
    const filter = [
      "[0:v]split=2[a][b]",
      "[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:2,eq=brightness=-0.12[bg]",
      "[b]scale=1080:1920:force_original_aspect_ratio=decrease[fg]",
      "[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,subtitles=legenda.ass[v]",
    ].join(";");

    await runTool(
      "ffmpeg",
      [
        "-y",
        "-loglevel",
        "error",
        "-ss",
        (clip.startMs / 1000).toFixed(3),
        "-t",
        (clipMs / 1000).toFixed(3),
        "-i",
        source,
        "-filter_complex",
        filter,
        "-map",
        "[v]",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "30",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        output,
      ],
      { cwd: dir, timeoutMs: 30 * 60_000 },
    );

    db.update(clips).set({ status: "pronto", outputFile }).where(eq(clips.id, clipId)).run();
    return outputFile;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.update(clips).set({ status: "erro", error: message }).where(eq(clips.id, clipId)).run();
    throw error;
  }
}
