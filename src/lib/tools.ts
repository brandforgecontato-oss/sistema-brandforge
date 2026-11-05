import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { DATA_DIR } from "./paths";

/** Procura `exe` até `depth` níveis abaixo de `dir`. */
function findExe(dir: string, exe: string, depth = 3): string | null {
  if (!existsSync(dir)) return null;
  const direct = path.join(dir, exe);
  if (existsSync(direct)) return direct;
  if (depth === 0) return null;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const found = findExe(path.join(dir, entry.name), exe, depth - 1);
    if (found) return found;
  }
  return null;
}

/** Pacotes "portáteis" do winget ficam em %LOCALAPPDATA%\Microsoft\WinGet\Packages\<Id>_... */
function fromWinget(packagePrefix: string, exe: string): string | null {
  const base = path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WinGet", "Packages");
  if (!existsSync(base)) return null;
  const pkg = readdirSync(base).find((d) => d.toLowerCase().startsWith(packagePrefix.toLowerCase()));
  return pkg ? findExe(path.join(base, pkg), exe) : null;
}

/** O Claude Code do VS Code traz o próprio executável; usa a versão mais nova instalada. */
function fromVsCodeExtension(): string | null {
  const base = path.join(os.homedir(), ".vscode", "extensions");
  if (!existsSync(base)) return null;
  const versions = readdirSync(base)
    .filter((d) => d.startsWith("anthropic.claude-code-"))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const v of versions) {
    const exe = path.join(base, v, "resources", "native-binary", "claude.exe");
    if (existsSync(exe)) return exe;
  }
  return null;
}

const resolvers = {
  ffmpeg: () => process.env.FFMPEG_BIN ?? fromWinget("Gyan.FFmpeg", "ffmpeg.exe") ?? "ffmpeg",
  ffprobe: () => process.env.FFPROBE_BIN ?? fromWinget("Gyan.FFmpeg", "ffprobe.exe") ?? "ffprobe",
  ytdlp: () => process.env.YTDLP_BIN ?? fromWinget("yt-dlp.yt-dlp", "yt-dlp.exe") ?? "yt-dlp",
  whisper: () =>
    process.env.WHISPER_BIN ?? path.join(DATA_DIR, "ferramentas", "whisper", "Release", "whisper-cli.exe"),
  claude: () => process.env.CLAUDE_BIN ?? fromVsCodeExtension() ?? "claude",
} as const;

export type ToolName = keyof typeof resolvers;

const cache = new Map<ToolName, string>();
export function toolPath(name: ToolName): string {
  if (!cache.has(name)) cache.set(name, resolvers[name]());
  return cache.get(name)!;
}

export const WHISPER_MODEL =
  process.env.WHISPER_MODEL ?? path.join(DATA_DIR, "ferramentas", "modelos", "ggml-large-v3-turbo-q5_0.bin");

export type RunOptions = { cwd?: string; timeoutMs?: number; input?: string };

/** Roda um executável sem shell (argumentos nunca são interpretados) e devolve stdout/stderr. */
export function runTool(name: ToolName, args: string[], opts: RunOptions = {}): Promise<{ stdout: string; stderr: string }> {
  const bin = toolPath(name);
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: opts.cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => {
      stderr += d;
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000); // ffmpeg fala muito
    });
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill();
          reject(new Error(`${name} passou do tempo limite (${Math.round(opts.timeoutMs! / 1000)} s)`));
        }, opts.timeoutMs)
      : null;
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      reject(new Error(`não foi possível executar ${name} (${bin}): ${e.message}`));
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) return resolve({ stdout, stderr });
      const tail = (stderr || stdout).trim().split("\n").slice(-6).join("\n");
      reject(new Error(`${name} saiu com código ${code}: ${tail}`));
    });
    if (opts.input !== undefined) child.stdin.end(opts.input);
    else child.stdin.end();
  });
}
