import { Badge, Card, PageHeader, timeAgo } from "@/components/ui";
import { scanAllProjects } from "@/features/projects/scan";
import { countOpenTasksByProject } from "@/features/tasks/queries";

export const dynamic = "force-dynamic";

const ACTIVE_WINDOW_MS = 10 * 60_000;

export default async function ProjetosPage() {
  const projects = await scanAllProjects();
  const openTasks = new Map(countOpenTasksByProject().map((r) => [r.project, r.total]));

  return (
    <>
      <PageHeader
        title="Projetos e agentes"
        subtitle="Cada pasta do BrandForge, com o estado do git e a última conversa do Claude Code nela."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((p) => {
          const active = p.agent && Date.now() - p.agent.lastActivityAt.getTime() < ACTIVE_WINDOW_MS;
          return (
            <Card
              key={p.name}
              title={
                <span className="flex items-center justify-between gap-2 normal-case tracking-normal">
                  <span className="font-display text-lg font-semibold text-ink">{p.name}</span>
                  {active ? <Badge tone="good">agente ativo agora</Badge> : <Badge>parado</Badge>}
                </span>
              }
            >
              <dl className="space-y-1.5 text-sm">
                <div className="flex gap-2">
                  <dt className="w-28 shrink-0 text-body">Git</dt>
                  <dd>
                    {p.isGit ? (
                      <>
                        {p.lastCommit ? `${timeAgo(p.lastCommit.at)} — ${p.lastCommit.subject}` : "sem commits"}
                        {p.uncommitted ? (
                          <span className="ml-2">
                            <Badge tone="gold">{p.uncommitted} alterações sem commit</Badge>
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <Badge tone="bad">sem git — nenhum histórico/backup de versões</Badge>
                    )}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-28 shrink-0 text-body">Tarefas abertas</dt>
                  <dd>
                    <a href={`/tarefas?projeto=${encodeURIComponent(p.name)}`} className="underline decoration-line hover:decoration-gold">
                      {openTasks.get(p.name) ?? 0}
                    </a>
                  </dd>
                </div>
                {p.claudeState && (
                  <div className="flex gap-2">
                    <dt className="w-28 shrink-0 text-body">CLAUDE.md</dt>
                    <dd className="line-clamp-3">{p.claudeState}</dd>
                  </div>
                )}
                <div className="flex gap-2">
                  <dt className="w-28 shrink-0 text-body">Claude Code</dt>
                  <dd>{p.agent ? `última atividade ${timeAgo(p.agent.lastActivityAt)}` : "nenhuma sessão encontrada"}</dd>
                </div>
              </dl>

              {p.agent?.lastUserText && (
                <p className="mt-3 rounded bg-cream p-2 text-xs text-body">
                  <strong className="text-ink">Você pediu:</strong> {p.agent.lastUserText}
                </p>
              )}
              {p.agent?.lastAssistantText && (
                <p className="mt-2 line-clamp-4 rounded bg-cream p-2 text-xs text-body">
                  <strong className="text-ink">Agente respondeu:</strong> {p.agent.lastAssistantText}
                </p>
              )}

              <div className="mt-4 flex gap-3 text-sm">
                <a href={`vscode://file/${p.codeDir.replace(/\\/g, "/")}`} className="font-medium text-gold-deep hover:underline">
                  Abrir no VS Code →
                </a>
                <a href={`/agentes?projeto=${encodeURIComponent(p.name)}`} className="font-medium text-gold-deep hover:underline">
                  Pedir ao agente →
                </a>
                {p.codeDir !== p.dir && (
                  <span className="text-xs text-body">código em {p.codeDir.slice(p.dir.length + 1)}</span>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
