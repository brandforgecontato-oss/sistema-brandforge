import { mkdirSync } from "node:fs";
import path from "node:path";

import { DATA_DIR } from "./paths";
import { runTool } from "./tools";

/**
 * Pergunta ao Claude Code (assinatura logada, sem chave de API) e recebe JSON validado pelo schema.
 * Sem ferramentas, sem MCP e sem configurações de projeto; `cwd` fica fora do BrandForge para
 * nenhum CLAUDE.md de projeto entrar no contexto.
 */
export async function askClaudeJson<T>(opts: {
  schema: object;
  prompt: string;
  cwd?: string;
  model?: string;
  timeoutMs?: number;
}): Promise<T> {
  const cwd = opts.cwd ?? path.join(DATA_DIR, "claude");
  mkdirSync(cwd, { recursive: true });
  const { stdout } = await runTool(
    "claude",
    [
      "-p",
      "--output-format",
      "json",
      "--model",
      opts.model ?? process.env.CLAUDE_MODEL ?? "sonnet",
      "--no-session-persistence",
      "--tools",
      "",
      "--strict-mcp-config",
      "--setting-sources",
      "",
      "--json-schema",
      JSON.stringify(opts.schema),
    ],
    { cwd, timeoutMs: opts.timeoutMs ?? 5 * 60_000, input: opts.prompt },
  );
  const parsed = JSON.parse(stdout) as { is_error?: boolean; subtype?: string; result?: string; structured_output?: T };
  if (parsed.is_error) throw new Error(`Claude respondeu com erro (${parsed.subtype}): ${parsed.result ?? ""}`.slice(0, 500));
  if (!parsed.structured_output) throw new Error("Claude não devolveu a resposta no formato pedido.");
  return parsed.structured_output;
}
