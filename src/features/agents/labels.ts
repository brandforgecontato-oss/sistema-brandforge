import type { AgentMode, AgentRunStatus } from "@/db/schema";

type Tone = "neutral" | "good" | "bad" | "gold";

export const RUN_STATUS: Record<AgentRunStatus, { label: string; tone: Tone }> = {
  na_fila: { label: "na fila", tone: "neutral" },
  rodando: { label: "trabalhando…", tone: "gold" },
  concluido: { label: "concluído", tone: "good" },
  erro: { label: "erro", tone: "bad" },
  cancelado: { label: "cancelado", tone: "neutral" },
};

export const MODE_INFO: Record<AgentMode, { label: string; hint: string }> = {
  planejar: { label: "Só planejar", hint: "lê o código e responde com um plano — não altera nada" },
  editar: { label: "Editar arquivos", hint: "cria e altera arquivos; comandos no terminal ficam bloqueados" },
};

export const MODELS = [
  { value: "sonnet", label: "Sonnet (rápido, o normal)" },
  { value: "opus", label: "Opus (mais caprichado, mais lento)" },
  { value: "haiku", label: "Haiku (tarefas simples)" },
] as const;

export const TOOL_LABELS: Record<string, string> = {
  Read: "leu",
  Write: "criou",
  Edit: "editou",
  MultiEdit: "editou",
  NotebookEdit: "editou",
  Glob: "procurou arquivos",
  Grep: "buscou no código",
  Bash: "terminal",
  PowerShell: "terminal",
  WebFetch: "abriu página",
  WebSearch: "pesquisou na web",
  Task: "subagente",
  Agent: "subagente",
  TodoWrite: "lista de tarefas",
  ExitPlanMode: "apresentou o plano",
};

export function formatCost(usd: number | null | undefined): string {
  return usd == null ? "—" : `US$ ${usd.toFixed(usd < 0.1 ? 3 : 2)}`;
}

export function formatElapsed(ms: number | null | undefined): string {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}
