"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { AGENT_MODES, type AgentMode, agentRuns } from "@/db/schema";
import { projectCodeDir } from "@/features/projects/dirs";
import { enqueue } from "@/worker/queue";
import { MODELS } from "./labels";

const MAX_PROMPT = 20_000;

function readForm(formData: FormData) {
  const prompt = String(formData.get("prompt") ?? "").trim().slice(0, MAX_PROMPT);
  const mode = String(formData.get("mode") ?? "planejar") as AgentMode;
  const model = String(formData.get("model") ?? "sonnet");
  return {
    prompt,
    mode: AGENT_MODES.includes(mode) ? mode : "planejar",
    model: MODELS.some((m) => m.value === model) ? model : "sonnet",
  };
}

function queue(values: typeof agentRuns.$inferInsert): never {
  const run = db.insert(agentRuns).values(values).returning({ id: agentRuns.id }).get();
  enqueue("agent_run", { runId: run.id });
  revalidatePath("/agentes");
  redirect(`/agentes/${run.id}`);
}

/** Novo pedido a um agente, numa conversa nova. */
export async function startAgent(formData: FormData): Promise<void> {
  const project = String(formData.get("project") ?? "");
  const { prompt, mode, model } = readForm(formData);
  // Só pastas que existem em PROJECTS_ROOT (nada de "../" vindo do formulário).
  if (!prompt || !projectCodeDir(project)) return;
  queue({ project, prompt, mode, model });
}

/** Continua a mesma conversa do Claude (ex.: "pode aplicar o plano"). */
export async function continueAgent(formData: FormData): Promise<void> {
  const parent = db.select().from(agentRuns).where(eq(agentRuns.id, Number(formData.get("id")))).get();
  const { prompt, mode, model } = readForm(formData);
  if (!parent?.sessionId || !prompt || parent.status === "rodando" || parent.status === "na_fila") return;
  queue({ project: parent.project, prompt, mode, model, parentId: parent.id, resumeSessionId: parent.sessionId });
}

export async function cancelAgent(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const run = db.select().from(agentRuns).where(eq(agentRuns.id, id)).get();
  if (!run) return;
  if (run.status === "na_fila") {
    // Ainda não começou: o worker vê o status e pula o job.
    db.update(agentRuns).set({ status: "cancelado", finishedAt: new Date() }).where(eq(agentRuns.id, id)).run();
  } else if (run.status === "rodando") {
    db.update(agentRuns).set({ cancelRequested: true }).where(eq(agentRuns.id, id)).run();
  }
  revalidatePath(`/agentes/${id}`);
  revalidatePath("/agentes");
}
