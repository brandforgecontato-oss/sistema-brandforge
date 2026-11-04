"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus, tasks } from "@/db/schema";

function refresh() {
  revalidatePath("/tarefas");
  revalidatePath("/");
}

export async function createTask(formData: FormData): Promise<void> {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const project = String(formData.get("project") ?? "geral").trim() || "geral";
  const priority = String(formData.get("priority") ?? "media") as TaskPriority;
  const due = String(formData.get("dueAt") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  db.insert(tasks)
    .values({
      title,
      notes,
      project,
      priority: TASK_PRIORITIES.includes(priority) ? priority : "media",
      dueAt: due ? new Date(`${due}T23:59:00`) : null,
    })
    .run();
  refresh();
}

export async function moveTask(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const status = String(formData.get("status")) as TaskStatus;
  if (!Number.isInteger(id) || !TASK_STATUSES.includes(status)) return;

  db.update(tasks)
    .set({ status, updatedAt: new Date(), doneAt: status === "feito" ? new Date() : null })
    .where(eq(tasks.id, id))
    .run();
  refresh();
}
