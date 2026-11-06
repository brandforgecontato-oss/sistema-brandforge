import type { ScriptStatus } from "@/db/schema";

export const SCRIPT_STATUS: Record<ScriptStatus, { label: string; tone: "neutral" | "good" | "bad" | "gold" }> = {
  gerando: { label: "Claude escrevendo…", tone: "neutral" },
  rascunho: { label: "pronto para gravar", tone: "gold" },
  gravado: { label: "gravado", tone: "good" },
  erro: { label: "erro", tone: "bad" },
};
