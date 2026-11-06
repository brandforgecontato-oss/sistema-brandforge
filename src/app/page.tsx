import { Badge, Card, PageHeader, formatDate, timeAgo } from "@/components/ui";
import { scanAllProjects } from "@/features/projects/scan";
import { TASK_STATUS_LABELS } from "@/features/tasks/labels";
import { listFocusTasks, listOverdueTasks } from "@/features/tasks/queries";
import { countScriptsToRecord } from "@/features/scripts/queries";
import { countTrendsByStatus, latestNewTrends } from "@/features/trends/queries";

export const dynamic = "force-dynamic";

export default async function PainelPage() {
  const [projects, focus, overdue, trends, trendCounts] = await Promise.all([
    scanAllProjects(),
    listFocusTasks(),
    listOverdueTasks(),
    latestNewTrends(6),
    countTrendsByStatus(),
  ]);

  const recentAgents = projects
    .filter((p) => p.agent)
    .sort((a, b) => b.agent!.lastActivityAt.getTime() - a.agent!.lastActivityAt.getTime());
  const withoutGit = projects.filter((p) => !p.isGit);
  const toRecord = countScriptsToRecord();

  return (
    <>
      <PageHeader title="Painel" subtitle="O que está andando, o que está atrasado e o que vale a pena olhar hoje." />

      {(overdue.length > 0 || withoutGit.length > 0) && (
        <div className="mb-6 space-y-2">
          {overdue.length > 0 && (
            <p className="rounded-md bg-ember-soft px-4 py-2 text-sm text-ember">
              {overdue.length} tarefa(s) atrasada(s): {overdue.map((t) => t.title).join(", ")}.
            </p>
          )}
          {withoutGit.length > 0 && (
            <p className="rounded-md bg-gold/20 px-4 py-2 text-sm text-gold-deep">
              Sem controle de versão (git): {withoutGit.map((p) => p.name).join(", ")}. Se um agente estragar algo,
              não dá para voltar atrás.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Foco agora" className="lg:col-span-2">
          <ul className="divide-y divide-line">
            {focus.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>{t.title}</span>
                <span className="flex gap-1.5">
                  <Badge>{t.project}</Badge>
                  <Badge tone={t.status === "fazendo" ? "gold" : "neutral"}>{TASK_STATUS_LABELS[t.status]}</Badge>
                  {t.dueAt && <Badge>{formatDate(t.dueAt)}</Badge>}
                </span>
              </li>
            ))}
            {focus.length === 0 && (
              <li className="py-2 text-sm text-body">
                Nenhuma tarefa aberta. <a href="/tarefas" className="text-gold-deep underline">Criar a primeira</a>.
              </li>
            )}
          </ul>
        </Card>

        <Card title="Agentes (Claude Code)">
          <ul className="space-y-3 text-sm">
            {recentAgents.map((p) => (
              <li key={p.name}>
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-body">{timeAgo(p.agent!.lastActivityAt)}</p>
                {p.agent!.lastAssistantText && (
                  <p className="mt-1 line-clamp-2 text-xs text-body">{p.agent!.lastAssistantText}</p>
                )}
              </li>
            ))}
            {recentAgents.length === 0 && <li className="text-body">Nenhuma sessão encontrada.</li>}
          </ul>
          <a href="/projetos" className="mt-3 inline-block text-sm text-gold-deep hover:underline">
            Ver projetos →
          </a>
        </Card>

        <Card title={`Tendências novas (${trendCounts.novo})`} className="lg:col-span-3">
          <ul className="grid gap-3 md:grid-cols-2">
            {trends.map((t) => (
              <li key={t.id} className="text-sm">
                <a href={t.link} target="_blank" rel="noreferrer" className="font-medium hover:text-gold-deep">
                  {t.title}
                </a>
                <p className="text-xs text-body">
                  {t.sourceName} · {timeAgo(t.publishedAt ?? t.createdAt)}
                </p>
              </li>
            ))}
            {trends.length === 0 && <li className="text-sm text-body">Ainda não buscou. Vá em Tendências → Buscar agora.</li>}
          </ul>
          <a href="/tendencias" className="mt-3 inline-block text-sm text-gold-deep hover:underline">
            Triar tendências → ({trendCounts.ideia} ideias de conteúdo salvas)
          </a>
          <a href="/roteiros" className="mt-3 ml-6 inline-block text-sm text-gold-deep hover:underline">
            {toRecord} roteiro(s) pronto(s) para gravar →
          </a>
        </Card>
      </div>
    </>
  );
}
