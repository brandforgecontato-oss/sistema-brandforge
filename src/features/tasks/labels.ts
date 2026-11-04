import type { TaskPriority, TaskStatus } from "@/db/schema";

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  a_fazer: "A fazer",
  fazendo: "Fazendo",
  feito: "Feito",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};
