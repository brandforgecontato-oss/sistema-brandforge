import { Badge, PageHeader, buttonClass, formatDate, ghostButtonClass, inputClass } from "@/components/ui";
import { TASK_STATUSES, type TaskStatus } from "@/db/schema";
import { listProjectDirs } from "@/features/projects/scan";
import { createTask, moveTask } from "@/features/tasks/actions";
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/features/tasks/labels";
import { listTasks } from "@/features/tasks/queries";

export const dynamic = "force-dynamic";

const NEXT_STEP: Record<TaskStatus, TaskStatus[]> = {
  a_fazer: ["fazendo", "feito"],
  fazendo: ["a_fazer", "feito"],
  feito: ["a_fazer"],
};

export default async function TarefasPage({ searchParams }: { searchParams: Promise<{ projeto?: string }> }) {
  const { projeto } = await searchParams;
  const projects = ["geral", ...listProjectDirs()];
  const columns = TASK_STATUSES.map((status) => ({ status, items: listTasks(status, projeto) }));

  return (
    <>
      <PageHeader title="Tarefas" subtitle="Um quadro só para todas as frentes. Concluídas somem depois de 14 dias." />

      <form action={createTask} className="mb-6 flex flex-wrap gap-2 rounded-lg border border-line bg-paper p-4">
        <input name="title" required placeholder="Nova tarefa…" className={`${inputClass} min-w-56 flex-1`} />
        <select name="project" defaultValue={projeto ?? "geral"} className={inputClass} aria-label="Projeto">
          {projects.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select name="priority" defaultValue="media" className={inputClass} aria-label="Prioridade">
          {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input name="dueAt" type="date" className={inputClass} aria-label="Prazo" />
        <button className={buttonClass}>Adicionar</button>
      </form>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <a href="/tarefas" className={!projeto ? "font-semibold text-gold-deep" : "text-body hover:text-ink"}>
          Todos
        </a>
        {projects.map((p) => (
          <a
            key={p}
            href={`/tarefas?projeto=${encodeURIComponent(p)}`}
            className={projeto === p ? "font-semibold text-gold-deep" : "text-body hover:text-ink"}
          >
            {p}
          </a>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {columns.map(({ status, items }) => (
          <section key={status} className="rounded-lg bg-line/40 p-3">
            <h2 className="mb-3 flex items-center justify-between px-1 text-sm font-semibold">
              {TASK_STATUS_LABELS[status]} <span className="text-body">{items.length}</span>
            </h2>
            <ul className="space-y-2">
              {items.map((task) => {
                const overdue = task.dueAt && task.status !== "feito" && task.dueAt.getTime() < Date.now();
                return (
                  <li key={task.id} className="rounded-md border border-line bg-paper p-3">
                    <p className="text-sm font-medium">{task.title}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge>{task.project}</Badge>
                      {task.priority === "alta" && <Badge tone="gold">Alta</Badge>}
                      {task.dueAt && <Badge tone={overdue ? "bad" : "neutral"}>{formatDate(task.dueAt)}</Badge>}
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      {NEXT_STEP[status].map((to) => (
                        <form key={to} action={moveTask}>
                          <input type="hidden" name="id" value={task.id} />
                          <input type="hidden" name="status" value={to} />
                          <button className={ghostButtonClass}>→ {TASK_STATUS_LABELS[to]}</button>
                        </form>
                      ))}
                    </div>
                  </li>
                );
              })}
              {items.length === 0 && <li className="px-1 text-xs text-body">Nada aqui.</li>}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
