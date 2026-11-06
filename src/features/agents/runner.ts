import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { agentRuns, jobs } from "@/db/schema";
import { projectCodeDir } from "@/features/projects/dirs";
import { toolPath } from "@/lib/tools";
import { type StreamLine, agentLogPath, describeToolInput } from "./log";

const MAX_RUN_MS = 60 * 60_000;
const CANCEL_POLL_MS = 2_000;

type Run = typeof agentRuns.$inferSelect;

function setRun(id: number, values: Partial<typeof agentRuns.$inferInsert>) {
  db.update(agentRuns).set(values).where(eq(agentRuns.id, id)).run();
}

/**
 * Comandos liberados no modo "testar": só verificam o projeto ou leem o git.
 * Tudo que não está aqui (commit, push, npm install, apagar arquivos…) continua negado.
 */
export const SAFE_COMMANDS = [
  "npm run build",
  "npm run lint",
  "npm run typecheck",
  "npm test",
  "npm run test",
  "npx tsc *",
  "git status",
  "git status *",
  "git diff",
  "git diff *",
  "git log",
  "git log *",
  "git show *",
];

/**
 * "planejar" = modo plan do Claude Code (só lê). "editar" = acceptEdits: cria e altera arquivos,
 * mas qualquer comando de terminal é bloqueado (não há ninguém para aprovar em modo não interativo).
 * "testar" = "editar" + os comandos de SAFE_COMMANDS.
 */
function buildArgs(run: Run): string[] {
  return [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    run.mode === "planejar" ? "plan" : "acceptEdits",
    ...(run.mode === "testar" ? ["--allowedTools", ...SAFE_COMMANDS.map((c) => `Bash(${c})`)] : []),
    "--model",
    run.model,
    // Sem servidores MCP: evita pedidos de login e deixa o agente focado no código.
    "--strict-mcp-config",
    ...(run.resumeSessionId ? ["--resume", run.resumeSessionId] : []),
  ];
}

/** No Windows, `kill()` não derruba os processos filhos (shells que o agente abriu); taskkill /T sim. */
function killTree(pid: number | undefined) {
  if (!pid) return;
  spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }).on("error", () => {});
}

/** Handler do job `agent_run`. Nunca relança: o resultado fica em agent_runs e o job não é repetido. */
export async function runAgent(payload: Record<string, unknown>): Promise<string> {
  const runId = Number(payload.runId);
  const run = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
  if (!run) return `pedido #${runId} não existe mais`;
  if (run.status !== "na_fila") return `pedido #${runId} ignorado (${run.status})`;

  const cwd = projectCodeDir(run.project);
  if (!cwd) {
    setRun(runId, { status: "erro", error: `projeto "${run.project}" não encontrado`, finishedAt: new Date() });
    return "projeto não encontrado";
  }

  const startedAt = Date.now();
  setRun(runId, { status: "rodando", startedAt: new Date(startedAt), error: null });
  const log = createWriteStream(agentLogPath(runId), { flags: "a" });

  return new Promise<string>((resolve) => {
    const child = spawn(toolPath("claude"), buildArgs(run), { cwd, windowsHide: true });
    let buffer = "";
    let stderr = "";
    let final: StreamLine | null = null;
    let cancelled = false;
    let timedOut = false;
    let done = false;

    const handleLine = (line: string) => {
      if (!line.trim()) return;
      log.write(line + "\n");
      let entry: StreamLine;
      try {
        entry = JSON.parse(line);
      } catch {
        return;
      }
      if (entry.type === "system" && entry.subtype === "init" && entry.session_id) setRun(runId, { sessionId: entry.session_id });
      if (entry.type === "result") final = entry;
    };

    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(handleLine);
    });
    child.stderr.on("data", (d) => {
      stderr = (stderr + d).slice(-4000);
    });

    const watcher = setInterval(() => {
      const current = db.select({ cancel: agentRuns.cancelRequested }).from(agentRuns).where(eq(agentRuns.id, runId)).get();
      if (current?.cancel && !cancelled) {
        cancelled = true;
        killTree(child.pid);
      }
    }, CANCEL_POLL_MS);
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, MAX_RUN_MS);

    const finish = (spawnError?: Error) => {
      if (done) return; // "error" e "close" podem chegar os dois
      done = true;
      clearInterval(watcher);
      clearTimeout(timer);
      handleLine(buffer);
      log.end();

      const result = final as StreamLine | null;
      const base = {
        finishedAt: new Date(),
        result: result?.result ?? null,
        costUsd: result?.total_cost_usd ?? null,
        durationMs: result?.duration_ms ?? Date.now() - startedAt,
        turns: result?.num_turns ?? null,
        denials: (result?.permission_denials ?? []).map((d) => ({ tool: d.tool_name, input: describeToolInput(d.tool_input) })),
      };

      if (cancelled) {
        setRun(runId, { ...base, status: "cancelado" });
        return resolve("cancelado pelo usuário");
      }
      const error = spawnError
        ? `não foi possível executar o Claude Code: ${spawnError.message}`
        : timedOut
          ? `passou do limite de ${MAX_RUN_MS / 60_000} min e foi interrompido`
          : !result
            ? `o Claude Code terminou sem resposta: ${stderr.trim().split("\n").slice(-4).join(" ")}`
            : result.is_error
              ? `o agente terminou com erro (${result.subtype ?? "?"})`
              : null;
      setRun(runId, { ...base, status: error ? "erro" : "concluido", error });
      resolve(error ?? `concluído em ${base.turns ?? "?"} passos, US$ ${(base.costUsd ?? 0).toFixed(3)}`);
    };

    child.on("error", finish);
    child.on("close", () => finish());
    child.stdin.end(run.prompt);
  });
}

/**
 * Pedidos que estavam rodando quando o worker caiu não são repetidos automaticamente
 * (poderiam refazer edições pela metade): ficam como erro, e você decide se pede de novo.
 */
export function failInterruptedRuns(): number {
  const changed = db
    .update(agentRuns)
    .set({ status: "erro", error: "o worker foi reiniciado enquanto o agente trabalhava — confira o projeto e peça de novo se precisar", finishedAt: new Date() })
    .where(eq(agentRuns.status, "rodando"))
    .run().changes;
  db.update(jobs)
    .set({ status: "falhou", finishedAt: new Date(), lastError: "interrompido pelo reinício do worker" })
    .where(and(eq(jobs.type, "agent_run"), eq(jobs.status, "rodando")))
    .run();
  return changed;
}
