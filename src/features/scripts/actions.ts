"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { type ScriptBeat, scripts, trendItems } from "@/db/schema";
import { enqueue } from "@/worker/queue";

function clean(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function refresh(id?: number) {
  revalidatePath("/roteiros");
  revalidatePath("/tendencias");
  revalidatePath("/");
  if (id) revalidatePath(`/roteiros/${id}`);
}

/** Novo roteiro a partir de um tema livre. */
export async function createScript(formData: FormData): Promise<void> {
  const topic = clean(formData.get("topic"));
  if (!topic) return;
  const script = db.insert(scripts).values({ topic, guidance: clean(formData.get("guidance")) }).returning({ id: scripts.id }).get();
  enqueue("script_generate", { scriptId: script.id });
  refresh();
  redirect(`/roteiros/${script.id}`);
}

/** Novo roteiro a partir de uma tendência (a tendência vira "ideia de conteúdo"). */
export async function scriptFromTrend(formData: FormData): Promise<void> {
  const trendId = Number(formData.get("trendId"));
  const trend = db.select().from(trendItems).where(eq(trendItems.id, trendId)).get();
  if (!trend) return;
  const existing = db.select({ id: scripts.id }).from(scripts).where(eq(scripts.trendId, trendId)).get();
  if (existing) redirect(`/roteiros/${existing.id}`);
  db.update(trendItems).set({ status: "ideia" }).where(eq(trendItems.id, trendId)).run();
  const script = db.insert(scripts).values({ topic: trend.title, trendId }).returning({ id: scripts.id }).get();
  enqueue("script_generate", { scriptId: script.id });
  refresh();
  redirect(`/roteiros/${script.id}`);
}

/** Reescreve com o Claude, com orientação nova. */
export async function regenerateScript(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  db.update(scripts).set({ guidance: clean(formData.get("guidance")), status: "gerando", error: null }).where(eq(scripts.id, id)).run();
  enqueue("script_generate", { scriptId: id });
  refresh(id);
}

/** Salva as edições feitas à mão. */
export async function saveScript(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const script = db.select().from(scripts).where(eq(scripts.id, id)).get();
  if (!script) return;
  const beats: ScriptBeat[] = [];
  for (let i = 0; formData.has(`fala_${i}`); i++) {
    const fala = clean(formData.get(`fala_${i}`));
    if (fala) beats.push({ fala, tela: clean(formData.get(`tela_${i}`)) ?? "" });
  }
  const extra = clean(formData.get("fala_nova"));
  if (extra) beats.push({ fala: extra, tela: clean(formData.get("tela_nova")) ?? "" });
  db.update(scripts)
    .set({
      title: clean(formData.get("title")) ?? script.title,
      hookText: clean(formData.get("hookText")) ?? "",
      beats,
      caption: clean(formData.get("caption")) ?? "",
      hashtags: clean(formData.get("hashtags")) ?? "",
      updatedAt: new Date(),
    })
    .where(eq(scripts.id, id))
    .run();
  refresh(id);
}

export async function deleteScript(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  db.delete(scripts).where(eq(scripts.id, id)).run();
  refresh();
  redirect("/roteiros");
}
