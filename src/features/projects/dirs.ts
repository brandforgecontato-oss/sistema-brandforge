// Sem "server-only": também é usado pelo worker (tsx).
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { PROJECTS_ROOT } from "@/lib/paths";

export const IGNORED = new Set(["node_modules", ".next", ".git"]);

/** Pastas de projeto dentro de PROJECTS_ROOT (ignora arquivos soltos como PDFs). */
export function listProjectDirs(): string[] {
  if (!existsSync(PROJECTS_ROOT)) return [];
  return readdirSync(PROJECTS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !IGNORED.has(d.name))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));
}

const CODE_MARKERS = [".git", "package.json", "CLAUDE.md"];

function looksLikeCode(dir: string): boolean {
  return CODE_MARKERS.some((m) => existsSync(path.join(dir, m)));
}

/** A pasta do projeto, ou a primeira subpasta que tenha código, se a raiz só guarda PDFs. */
export function findCodeDir(dir: string): string {
  if (looksLikeCode(dir)) return dir;
  const child = readdirSync(dir, { withFileTypes: true }).find(
    (d) => d.isDirectory() && !IGNORED.has(d.name) && !d.name.startsWith(".") && looksLikeCode(path.join(dir, d.name)),
  );
  return child ? path.join(dir, child.name) : dir;
}

/** Pasta de código de um projeto pelo nome; `null` se o nome não for uma pasta conhecida (evita "../"). */
export function projectCodeDir(name: string): string | null {
  if (!listProjectDirs().includes(name)) return null;
  return findCodeDir(path.join(PROJECTS_ROOT, name));
}

export function isGitRepo(dir: string): boolean {
  return existsSync(path.join(dir, ".git"));
}
