import { notFound } from "next/navigation";

import { AgentFields } from "@/components/agent-fields";
import { AutoRefresh } from "@/components/auto-refresh";
import { Markdown } from "@/components/markdown";
import { Badge, Card, PageHeader, buttonClass, ghostButtonClass, timeAgo } from "@/components/ui";
import { cancelAgent, continueAgent } from "@/features/agents/actions";
import { MODE_INFO, RUN_STATUS, TOOL_LABELS, formatCost, formatElapsed } from "@/features/agents/labels";
import { readAgentEvents } from "@/features/agents/log";
import { getRun, getThread } from "@/features/agents/queries";
import { projectCodeDir } from "@/features/projects/dirs";

export const dynamic = "force-dynamic";

const EDIT_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

export default async function AgentRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = getRun(Number(id));
  if (!run) notFound();

  const log = await readAgentEvents(run.id);
  // A última fala do agente já aparece em "Resposta do agente"; não repete na linha do tempo.
  const finalText = run.result?.trim();
  const events = log.events.filter((e) => !(e.kind === "text" && finalText && e.text === finalText));
  const total = log.total - (log.events.length - events.length);
  const thread = getThread(run);
  const status = RUN_STATUS[run.status];
  const active = run.status === "na_fila" || run.status === "rodando";
  const changedFiles = [...new Set(events.flatMap((e) => (e.kind === "tool" && EDIT_TOOLS.has(e.tool) ? [e.detail] : [])))];
  const codeDir = projectCodeDir(run.project);

  return (
    <>
      <a href="/agentes" className="mb-4 text-sm text-gold-deep hover:underline">
        ← Agentes
      </a>
      <PageHeader
        title={`${run.project} — pedido #${run.id}`}
        subtitle={`${MODE_INFO[run.mode].label} · ${run.model} · ${timeAgo(run.createdAt)} · ${formatElapsed(run.durationMs)} · ${formatCost(run.costUsd)}`}
        action={<Badge tone={status.tone}>{run.cancelRequested && active ? "cancelando…" : status.label}</Badge>}
      />
      <AutoRefresh active={active} everyMs={3000} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card title="Pedido">
            <p className="whitespace-pre-wrap text-sm">{run.prompt}</p>
            {active && !run.cancelRequested && (
              <form action={cancelAgent} className="mt-3">
                <input type="hidden" name="id" value={run.id} />
                <button className={ghostButtonClass}>Cancelar</button>
              </form>
            )}
          </Card>

          {run.error && <p className="whitespace-pre-wrap rounded-md bg-ember-soft p-4 text-sm text-ember">{run.error}</p>}

          {run.result && (
            <Card title="Resposta do agente">
              <Markdown text={run.result} />
            </Card>
          )}

          <Card title={`O que ele fez${total > events.length ? ` (últimos ${events.length} de ${total})` : ""}`}>
            {events.length === 0 ? (
              <p className="text-sm text-body">{run.status === "na_fila" ? "Aguardando a vez na fila…" : active ? "Começando…" : "Respondeu direto, sem abrir arquivos."}</p>
            ) : (
              <ol className="space-y-1.5 text-sm">
                {events.map((e, i) =>
                  e.kind === "text" ? (
                    <li key={i} className="rounded bg-cream p-2 text-body">
                      <Markdown text={e.text} />
                    </li>
                  ) : (
                    <li key={i} className="flex gap-2">
                      <span className={`w-36 shrink-0 text-xs ${e.kind === "denied" ? "text-ember" : "text-gold-deep"}`}>
                        {e.kind === "denied" ? "bloqueado · " : ""}
                        {TOOL_LABELS[e.tool] ?? e.tool}
                      </span>
                      <code className="min-w-0 break-all text-xs text-body">{e.detail}</code>
                    </li>
                  ),
                )}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {changedFiles.length > 0 && (
            <Card title="Arquivos alterados">
              <ul className="space-y-1 text-xs">
                {changedFiles.map((f) => (
                  <li key={f}>
                    <code className="break-all">{f}</code>
                  </li>
                ))}
              </ul>
              {codeDir && (
                <a href={`vscode://file/${codeDir.replace(/\\/g, "/")}`} className="mt-3 inline-block text-sm text-gold-deep hover:underline">
                  Revisar no VS Code →
                </a>
              )}
            </Card>
          )}

          {(run.denials?.length ?? 0) > 0 && (
            <Card title="Bloqueado (precisa de você)">
              <ul className="space-y-1 text-xs">
                {run.denials!.map((d, i) => (
                  <li key={i}>
                    <span className="text-ember">{TOOL_LABELS[d.tool] ?? d.tool}:</span> <code className="break-all">{d.input}</code>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {!active && run.sessionId && (
            <Card title="Continuar a conversa">
              <form action={continueAgent} className="space-y-3">
                <input type="hidden" name="id" value={run.id} />
                <AgentFields
                  defaultMode={run.mode === "planejar" ? "editar" : run.mode}
                  defaultModel={run.model}
                  placeholder={run.mode === "planejar" ? "Ex.: pode aplicar o plano." : "Ex.: agora ajuste também o rodapé."}
                />
                <button className={buttonClass}>Enviar</button>
              </form>
            </Card>
          )}

          {thread.length > 1 && (
            <Card title="Nesta conversa">
              <ol className="space-y-1 text-sm">
                {thread.map((t) => (
                  <li key={t.id}>
                    {t.id === run.id ? (
                      <strong>#{t.id} — este pedido</strong>
                    ) : (
                      <a href={`/agentes/${t.id}`} className="hover:underline">
                        #{t.id} — {t.prompt.slice(0, 60)}
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
