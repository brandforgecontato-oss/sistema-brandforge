import "server-only";

import { execFile } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { VIDEO_DIRS, ensureDataDirs } from "@/lib/paths";

const run = promisify(execFile);

export type ToolStatus = { name: string; command: string; purpose: string; version: string | null };

const TOOLS = [
  { name: "FFmpeg", command: "ffmpeg", args: ["-version"], purpose: "cortar, juntar e exportar vídeo" },
  { name: "yt-dlp", command: "yt-dlp", args: ["--version"], purpose: "baixar vídeos de referência" },
  { name: "whisper.cpp", command: "whisper-cli", args: ["--help"], purpose: "transcrever e gerar legendas" },
];

/** Verifica se cada ferramenta do pipeline (Fase 2) está no PATH. */
export async function checkVideoTools(): Promise<ToolStatus[]> {
  return Promise.all(
    TOOLS.map(async (tool) => {
      try {
        const { stdout, stderr } = await run(tool.command, tool.args, { timeout: 8000, windowsHide: true });
        const firstLine = (stdout || stderr).split("\n").find((l) => l.trim()) ?? "instalado";
        return { name: tool.name, command: tool.command, purpose: tool.purpose, version: firstLine.slice(0, 80) };
      } catch {
        return { name: tool.name, command: tool.command, purpose: tool.purpose, version: null };
      }
    }),
  );
}

const VIDEO_EXT = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"]);

export type VideoFile = { name: string; sizeMb: number; modifiedAt: Date };

export function listVideos(folder: keyof typeof VIDEO_DIRS): VideoFile[] {
  ensureDataDirs();
  const dir = VIDEO_DIRS[folder];
  return readdirSync(dir)
    .filter((f) => VIDEO_EXT.has(path.extname(f).toLowerCase()))
    .map((f) => {
      const stat = statSync(path.join(dir, f));
      return { name: f, sizeMb: stat.size / 1024 / 1024, modifiedAt: stat.mtime };
    })
    .sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
}
