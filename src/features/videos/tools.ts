import "server-only";

import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { VIDEO_DIRS, ensureDataDirs } from "@/lib/paths";
import { type ToolName, WHISPER_MODEL, runTool, toolPath } from "@/lib/tools";

export type ToolStatus = { name: string; purpose: string; version: string | null; path: string };

const TOOLS: { tool: ToolName; name: string; args: string[]; purpose: string }[] = [
  { tool: "ffmpeg", name: "FFmpeg", args: ["-version"], purpose: "cortar, legendar e exportar" },
  { tool: "ytdlp", name: "yt-dlp", args: ["--version"], purpose: "baixar vídeos por link" },
  { tool: "whisper", name: "whisper.cpp", args: ["--help"], purpose: "transcrever com tempo de cada palavra" },
  { tool: "claude", name: "Claude Code", args: ["--version"], purpose: "escolher os melhores cortes" },
];

/** Verifica se cada ferramenta do pipeline responde. */
export async function checkVideoTools(): Promise<ToolStatus[]> {
  const results = await Promise.all(
    TOOLS.map(async (t) => {
      try {
        const { stdout, stderr } = await runTool(t.tool, t.args, { timeoutMs: 10_000 });
        const line = (stdout || stderr).split("\n").find((l) => l.trim()) ?? "instalado";
        const version = t.tool === "whisper" ? "instalado" : line.trim().slice(0, 60);
        return { name: t.name, purpose: t.purpose, version, path: toolPath(t.tool) };
      } catch {
        return { name: t.name, purpose: t.purpose, version: null, path: toolPath(t.tool) };
      }
    }),
  );
  results.push({
    name: "Modelo do whisper",
    purpose: "large-v3-turbo (bom em português)",
    version: existsSync(WHISPER_MODEL) ? path.basename(WHISPER_MODEL) : null,
    path: WHISPER_MODEL,
  });
  return results;
}

const VIDEO_EXT = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"]);

export type VideoFile = { name: string; sizeMb: number; modifiedAt: Date };

export function listVideoFiles(folder: keyof typeof VIDEO_DIRS): VideoFile[] {
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
