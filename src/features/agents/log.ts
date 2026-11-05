// Leitura do registro stream-json do Claude Code. Sem "server-only": usado pelo worker e pelas páginas.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { AGENT_LOG_DIR } from "@/lib/paths";

export type AgentEvent =
  | { kind: "text"; text: string }
  | { kind: "tool"; tool: string; detail: string }
  | { kind: "denied"; tool: string; detail: string };

export type StreamLine = {
  type?: string;
  subtype?: string;
  session_id?: string;
  tool_name?: string;
  message?: { content?: unknown };
  // linha final ("result")
  result?: string;
  is_error?: boolean;
  total_cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
  permission_denials?: { tool_name: string; tool_input?: Record<string, unknown> }[];
};

export function agentLogPath(runId: number): string {
  return path.join(AGENT_LOG_DIR, `${runId}.jsonl`);
}

const ROOT_HINT = /^[A-Za-z]:[\\/].*?[\\/](OneDrive[\\/]BrandForge[\\/][^\\/]+[\\/])/;

/** Resumo de uma linha do que a ferramenta foi chamada para fazer (arquivo, comando, busca…). */
export function describeToolInput(input: Record<string, unknown> | undefined): string {
  if (!input) return "";
  const value =
    input.file_path ?? input.notebook_path ?? input.command ?? input.pattern ?? input.url ?? input.query ?? input.description ?? input.path ?? "";
  // Caminhos absolutos ficam enormes; mostra a partir da pasta do projeto.
  return String(value).replace(ROOT_HINT, "").replace(/\s+/g, " ").slice(0, 160);
}

/** Converte uma linha do registro em eventos legíveis (ignora "pensamento", hooks e telemetria). */
export function eventsFromLine(entry: StreamLine): AgentEvent[] {
  if (entry.type === "system" && entry.subtype === "permission_denied") {
    return [{ kind: "denied", tool: entry.tool_name ?? "?", detail: "" }];
  }
  if (entry.type !== "assistant" || !Array.isArray(entry.message?.content)) return [];
  const events: AgentEvent[] = [];
  for (const block of entry.message.content as { type?: string; text?: string; name?: string; input?: Record<string, unknown> }[]) {
    if (block.type === "text" && block.text?.trim()) events.push({ kind: "text", text: block.text.trim() });
    if (block.type === "tool_use") events.push({ kind: "tool", tool: block.name ?? "?", detail: describeToolInput(block.input) });
  }
  return events;
}

/** Eventos de um pedido, na ordem; `limit` mantém só os mais recentes. */
export async function readAgentEvents(runId: number, limit = 300): Promise<{ events: AgentEvent[]; total: number }> {
  const file = agentLogPath(runId);
  if (!existsSync(file)) return { events: [], total: 0 };
  const events: AgentEvent[] = [];
  for (const line of (await readFile(file, "utf8")).split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as StreamLine;
      // O "denied" vem logo depois do tool_use bloqueado: junta o detalhe da tentativa.
      for (const e of eventsFromLine(entry)) {
        const prev = events[events.length - 1];
        if (e.kind === "denied" && prev?.kind === "tool" && prev.tool === e.tool) events[events.length - 1] = { ...e, detail: prev.detail };
        else events.push(e);
      }
    } catch {
      // linha incompleta enquanto o agente ainda escreve
    }
  }
  return { events: events.slice(-limit), total: events.length };
}
