import "server-only";

import { execFile } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { open, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { PROJECTS_ROOT } from "@/lib/paths";
import { codeDirFor, listProjectDirs } from "./dirs";

export { listProjectDirs };

const run = promisify(execFile);

export type AgentActivity = {
  sessionFile: string;
  lastActivityAt: Date;
  lastAssistantText: string | null;
  lastUserText: string | null;
};

export type ProjectInfo = {
  name: string;
  dir: string;
  /** Onde o código está de fato (pode ser uma subpasta, ex.: brandforge-site-oficial/template_sites-main). */
  codeDir: string;
  isGit: boolean;
  lastCommit: { at: Date; subject: string } | null;
  uncommitted: number | null;
  claudeState: string | null;
  agent: AgentActivity | null;
};

async function git(dir: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await run("git", ["-C", dir, ...args], { timeout: 8000, windowsHide: true });
    return stdout.trim();
  } catch {
    return null;
  }
}

/** Primeiras linhas da seção "Estado atual" do CLAUDE.md (convenção usada nos projetos BrandForge). */
async function readClaudeState(dir: string): Promise<string | null> {
  const file = path.join(dir, "CLAUDE.md");
  if (!existsSync(file)) return null;
  const content = await readFile(file, "utf8");
  const match = content.match(/##\s*Estado atual\s*\n([\s\S]*?)(\n##\s|$)/i);
  const body = (match?.[1] ?? content).trim();
  // Pula títulos, imports (@AGENTS.md) e comentários HTML para pegar a primeira frase de conteúdo.
  const firstLine = body.split("\n").find((l) => l.trim() && !/^\s*(#|@|<!--|>)/.test(l)) ?? "";
  return firstLine.replace(/^[-*]\s*/, "").replace(/\*\*/g, "").slice(0, 400) || null;
}

/** Claude Code guarda cada projeto em ~/.claude/projects/<caminho com : e \ trocados por ->. */
function claudeSessionDir(dir: string): string | null {
  const base = path.join(os.homedir(), ".claude", "projects");
  if (!existsSync(base)) return null;
  const encoded = dir.replace(/[:\\/ ]/g, "-").toLowerCase();
  const found = readdirSync(base).find((name) => name.toLowerCase() === encoded);
  return found ? path.join(base, found) : null;
}

/** Tira o markdown mais comum para o texto caber limpo num card. */
function plain(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\*\*|__|`/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractText(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const parts = content
    .filter((c) => c && typeof c === "object" && (c as { type?: string }).type === "text")
    .map((c) => (c as { text: string }).text);
  return parts.length ? parts.join("\n") : null;
}

/** Lê só o final do log da sessão mais recente (os arquivos podem ter dezenas de MB). */
async function readAgentActivity(dirs: string[]): Promise<AgentActivity | null> {
  const latest = [...new Set(dirs)]
    .map(claudeSessionDir)
    .filter((d): d is string => d !== null)
    .flatMap((sessionDir) =>
      readdirSync(sessionDir)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => ({ f, file: path.join(sessionDir, f), mtime: statSync(path.join(sessionDir, f)).mtime })),
    )
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())[0];
  if (!latest) return null;

  const file = latest.file;
  const handle = await open(file, "r");
  try {
    const { size } = await handle.stat();
    const length = Math.min(size, 512 * 1024);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    const lines = buffer.toString("utf8").split("\n").reverse();

    let lastAssistantText: string | null = null;
    let lastUserText: string | null = null;
    for (const line of lines) {
      if (lastAssistantText && lastUserText) break;
      let entry: { type?: string; isMeta?: boolean; message?: { content?: unknown } };
      try {
        entry = JSON.parse(line);
      } catch {
        continue; // primeira linha pode estar cortada
      }
      const text = extractText(entry.message?.content);
      if (!text || entry.isMeta) continue;
      if (entry.type === "assistant" && !lastAssistantText) lastAssistantText = text;
      if (entry.type === "user" && !lastUserText && !text.startsWith("<")) lastUserText = text;
    }

    return {
      sessionFile: latest.f,
      lastActivityAt: latest.mtime,
      lastAssistantText: lastAssistantText ? plain(lastAssistantText).slice(0, 500) : null,
      lastUserText: lastUserText ? plain(lastUserText).slice(0, 300) : null,
    };
  } finally {
    await handle.close();
  }
}

export async function scanProject(name: string): Promise<ProjectInfo> {
  const dir = path.join(PROJECTS_ROOT, name);
  const codeDir = codeDirFor(name);
  const isGit = existsSync(path.join(codeDir, ".git"));
  const [log, status, claudeState, agent] = await Promise.all([
    isGit ? git(codeDir, ["log", "-1", "--format=%ct%x09%s"]) : null,
    isGit ? git(codeDir, ["status", "--porcelain"]) : null,
    readClaudeState(codeDir).catch(() => null),
    readAgentActivity([dir, codeDir]).catch(() => null),
  ]);

  const [ts, ...subject] = (log ?? "").split("\t");
  return {
    name,
    dir,
    codeDir,
    isGit,
    lastCommit: log ? { at: new Date(Number(ts) * 1000), subject: subject.join("\t") } : null,
    uncommitted: status === null ? null : status.split("\n").filter(Boolean).length,
    claudeState,
    agent,
  };
}

export async function scanAllProjects(): Promise<ProjectInfo[]> {
  return Promise.all(listProjectDirs().map(scanProject));
}
