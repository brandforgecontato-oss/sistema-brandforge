import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { type ScriptBeat, scripts, trendItems } from "@/db/schema";
import { askClaudeJson } from "@/lib/claude";

type GeneratedScript = {
  title: string;
  hookText: string;
  beats: ScriptBeat[];
  cta: string;
  caption: string;
  hashtags: string[];
  estimatedSec: number;
};

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Nome interno curto do roteiro" },
    hookText: { type: "string", description: "Texto de tela dos primeiros segundos, até 8 palavras" },
    beats: {
      type: "array",
      minItems: 3,
      maxItems: 8,
      description: "Blocos na ordem em que são falados; o primeiro é o gancho falado e o último é a chamada para ação",
      items: {
        type: "object",
        properties: {
          fala: { type: "string", description: "O que a pessoa fala, como fala de verdade (1 a 3 frases curtas)" },
          tela: { type: "string", description: "Texto curto na tela durante esse bloco (até 6 palavras) ou vazio" },
        },
        required: ["fala", "tela"],
      },
    },
    cta: { type: "string", description: "Resumo da chamada para ação do final" },
    caption: { type: "string", description: "Legenda do post, 2 a 4 linhas curtas" },
    hashtags: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 8 },
    estimatedSec: { type: "number", description: "Duração estimada falando em ritmo natural, em segundos" },
  },
  required: ["title", "hookText", "beats", "cta", "caption", "hashtags", "estimatedSec"],
};

function buildPrompt(topic: string, guidance: string | null, trend: { title: string; summary: string | null; link: string } | null): string {
  return `Você é roteirista de vídeos curtos (Reels/TikTok/Shorts) da BrandForge, uma agência que ajuda pequenos negócios brasileiros com marca, presença digital, atendimento com IA e soluções sob medida. Quem grava é o próprio dono da BrandForge, falando para a câmera, sozinho.

Escreva um roteiro de 30 a 45 segundos (mais ou menos 80 a 120 palavras faladas) sobre o tema abaixo, para donos de pequenos negócios.

Regras:
- O primeiro bloco é o gancho FALADO: uma frase que prende nos 2 primeiros segundos (pergunta, contraste ou consequência concreta). Nada de "Olá, pessoal" ou "hoje eu vou falar".
- Português do Brasil falado, frases curtas, sem jargão técnico; se precisar de um termo, explique em poucas palavras.
- Mostre o que o tema muda na prática para um pequeno negócio (atendimento, vendas, tempo, custo).
- Não invente números, datas, nomes de empresas nem fatos que não estejam no tema ou na notícia. Se a notícia não disser, não afirme.
- O último bloco é a chamada para ação, simples (ex.: comentar uma palavra, salvar, seguir). Sem prometer resultado.
- "tela" é o texto que aparece na tela naquele bloco: poucas palavras, reforçando a ideia, sem repetir a fala inteira.
- Sem emojis no roteiro. A legenda do post pode ter no máximo 2 emojis.
${guidance ? `\nOrientação do autor para este roteiro: ${guidance}\n` : ""}
Tema: ${topic}
${trend ? `\nNotícia de origem:\nTítulo: ${trend.title}\n${trend.summary ? `Resumo: ${trend.summary}\n` : ""}Link: ${trend.link}\n` : ""}`;
}

/** Job `script_generate`: escreve (ou reescreve) o roteiro com o Claude. */
export async function generateScript(payload: Record<string, unknown>): Promise<string> {
  const id = Number(payload.scriptId);
  const script = db.select().from(scripts).where(eq(scripts.id, id)).get();
  if (!script) return `roteiro #${id} não existe mais`;
  const trend = script.trendId ? (db.select().from(trendItems).where(eq(trendItems.id, script.trendId)).get() ?? null) : null;

  db.update(scripts).set({ status: "gerando", error: null, updatedAt: new Date() }).where(eq(scripts.id, id)).run();
  try {
    const out = await askClaudeJson<GeneratedScript>({ schema: SCHEMA, prompt: buildPrompt(script.topic, script.guidance, trend) });
    const hashtags = out.hashtags.map((h) => `#${h.replace(/^#+/, "").replace(/\s+/g, "")}`).join(" ");
    db.update(scripts)
      .set({
        status: script.videoId ? "gravado" : "rascunho",
        title: out.title,
        hookText: out.hookText,
        beats: out.beats,
        cta: out.cta,
        caption: out.caption,
        hashtags,
        estimatedSec: Math.round(out.estimatedSec),
        updatedAt: new Date(),
      })
      .where(eq(scripts.id, id))
      .run();
    return `roteiro "${out.title}" (${out.beats.length} blocos, ~${Math.round(out.estimatedSec)} s)`;
  } catch (e) {
    const message = (e as Error).message;
    db.update(scripts).set({ status: "erro", error: message, updatedAt: new Date() }).where(eq(scripts.id, id)).run();
    throw e;
  }
}

/** Texto corrido do roteiro (o que a pessoa fala), usado como referência na edição do vídeo gravado. */
export function scriptSpeech(beats: ScriptBeat[] | null | undefined): string {
  return (beats ?? []).map((b) => b.fala.trim()).filter(Boolean).join("\n");
}
