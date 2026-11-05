import { AgentFields } from "@/components/agent-fields";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge, Card, PageHeader, buttonClass, inputClass, timeAgo } from "@/components/ui";
import { startAgent } from "@/features/agents/actions";
import { MODE_INFO, RUN_STATUS, formatCost, formatElapsed } from "@/features/agents/labels";
import { listRuns } from "@/features/agents/queries";
import { isGitRepo, listProjectDirs, projectCodeDir } from "@/features/projects/dirs";

export const dynamic = "force-dynamic";

export default async function AgentesPage({ searchParams }: { searchParams: Promise<{ projeto?: string }> }) {
  const { projeto } = await searchParams;
  const projects = listProjectDirs();
  const withoutGit = projects.filter((p) => !isGitRepo(projectCodeDir(p) ?? ""));
  const runs = listRuns();
  const active = runs.some((r) => r.status === "na_fila" || r.status === "rodando");

  return (
    <>
      <PageHeader
        title="Agentes"
        subtitle="Peça algo a um agente Claude Code dentro de um projeto. Ele trabalha no PC, um pedido por vez, e o painel mostra o que ele fez."
      />
      <AutoRefresh active={active} />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card title="Novo pedido">
          <form action={startAgent} className="space-y-3">
            <select
              name="project"
              required
              defaultValue={projects.includes(projeto ?? "") ? projeto : undefined}
              className={`${inputClass} w-full`}
              aria-label="Projeto"
            >
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                  {withoutGit.includes(p) ? " (sem git)" : ""}
                </option>
              ))}
            </select>
            <AgentFields placeholder="Ex.: revise a página inicial e me diga o que falta para publicar." />
            <button className={buttonClass}>Enviar ao agente</button>
          </form>
          {withoutGit.length > 0 && (
            <p className="mt-4 rounded-md bg-gold/20 px-3 py-2 text-xs text-gold-deep">
              Sem git: {withoutGit.join(", ")}. No modo &quot;Editar arquivos&quot; não haverá como desfazer o que o agente
              mudar nesses projetos — prefira &quot;Só planejar&quot; neles até ativar o git.
            </p>
          )}
        </Card>

        <Card title="Como funciona">
          <ul className="list-disc space-y-2 pl-4 text-sm text-body">
            <li>
              <strong className="text-ink">Só planejar</strong> é seguro: o agente lê o projeto e devolve um plano. Se gostar,
              abra o pedido e mande &quot;pode aplicar&quot; em modo Editar — ele continua a mesma conversa.
            </li>
            <li>
              <strong className="text-ink">Editar arquivos</strong> não roda comandos (instalar, commit, build). Se ele precisar,
              o pedido mostra o que foi bloqueado — faça isso pelo VS Code ou pelo app (Remote Control).
            </li>
            <li>Usa a sua assinatura do Claude; o custo aparece como referência em dólares.</li>
            <li>As conversas aparecem também no Claude Code, na pasta do projeto.</li>
          </ul>
        </Card>
      </div>

      <h2 className="mb-3 mt-10 text-xs font-semibold uppercase tracking-wider text-gold-deep">Pedidos recentes</h2>
      {runs.length === 0 ? (
        <p className="text-sm text-body">Nenhum pedido ainda.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-paper">
          {runs.map((r) => {
            const status = RUN_STATUS[r.status];
            return (
              <li key={r.id}>
                <a href={`/agentes/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-cream">
                  <Badge tone={status.tone}>{status.label}</Badge>
                  <span className="text-sm font-medium">{r.project}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-body">
                    {r.parentId ? "↳ " : ""}
                    {r.prompt}
                  </span>
                  <span className="text-xs text-body">
                    {MODE_INFO[r.mode].label} · {r.model} · {formatElapsed(r.durationMs)} · {formatCost(r.costUsd)} ·{" "}
                    {timeAgo(r.createdAt)}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
