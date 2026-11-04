import { mkdirSync } from "node:fs";
import path from "node:path";

/** Banco e vídeos ficam fora do OneDrive para não sincronizar arquivos grandes nem travar o SQLite. */
export const DATA_DIR = process.env.DATA_DIR ?? "C:\\BrandForge-dados";
export const PROJECTS_ROOT = process.env.PROJECTS_ROOT ?? path.resolve(process.cwd(), "..");

export const DB_PATH = path.join(DATA_DIR, "painel.db");
export const VIDEO_DIRS = {
  entrada: path.join(DATA_DIR, "videos", "entrada"),
  trabalho: path.join(DATA_DIR, "videos", "trabalho"),
  saida: path.join(DATA_DIR, "videos", "saida"),
} as const;

export function ensureDataDirs(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  for (const dir of Object.values(VIDEO_DIRS)) mkdirSync(dir, { recursive: true });
}
