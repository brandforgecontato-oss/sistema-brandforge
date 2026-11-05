import type { ClipStatus, VideoStatus } from "@/db/schema";

export const VIDEO_STATUS: Record<VideoStatus, { label: string; tone: "neutral" | "good" | "bad" | "gold" }> = {
  na_fila: { label: "na fila", tone: "neutral" },
  baixando: { label: "baixando…", tone: "gold" },
  transcrevendo: { label: "transcrevendo…", tone: "gold" },
  planejando: { label: "Claude escolhendo cortes…", tone: "gold" },
  revisar: { label: "cortes para revisar", tone: "good" },
  erro: { label: "erro", tone: "bad" },
};

export const CLIP_STATUS: Record<ClipStatus, { label: string; tone: "neutral" | "good" | "bad" | "gold" }> = {
  proposto: { label: "proposto", tone: "neutral" },
  na_fila: { label: "na fila", tone: "gold" },
  renderizando: { label: "renderizando…", tone: "gold" },
  pronto: { label: "pronto", tone: "good" },
  erro: { label: "erro", tone: "bad" },
  descartado: { label: "descartado", tone: "neutral" },
};

export function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
