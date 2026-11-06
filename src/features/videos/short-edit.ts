import type { BrollItem, Removal } from "@/db/schema";
import type { Transcript, Word } from "./transcript";

/** Silêncio entre palavras acima disso vira corte. */
export const PAUSE_MS = 450;
/** Folga mantida antes/depois da fala em cada corte, para não comer a sílaba. */
const PAD_MS = 120;
/** Cortes menores que isso não valem a emenda. */
const MIN_CUT_MS = 200;

export type Span = { startMs: number; endMs: number };

/** Pausas: começo antes da primeira palavra, fim depois da última e silêncios longos entre palavras. */
export function detectPauses(t: Transcript): Removal[] {
  const words = t.words;
  if (!words.length) return [];
  const out: Removal[] = [];
  const push = (startMs: number, endMs: number) => {
    if (endMs - startMs >= MIN_CUT_MS) out.push({ startMs: Math.round(startMs), endMs: Math.round(endMs), kind: "pausa" });
  };
  push(0, words[0].startMs - PAD_MS);
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].startMs - words[i - 1].endMs;
    if (gap > PAUSE_MS) push(words[i - 1].endMs + PAD_MS, words[i].startMs - PAD_MS);
  }
  if (t.durationMs) push(words[words.length - 1].endMs + PAD_MS * 3, t.durationMs);
  return out;
}

/**
 * Converte um trecho em segundos (vindo do Claude) para um corte alinhado às palavras:
 * do início da primeira palavra do trecho até o início da palavra seguinte ao trecho.
 */
export function snapRetake(t: Transcript, startSec: number, endSec: number, reason: string): Removal | null {
  const start = startSec * 1000;
  const end = endSec * 1000;
  // `endSec` é o INÍCIO da última palavra a remover (é o que o prompt pede).
  const inside = t.words.filter((w) => w.startMs >= start - 150 && w.startMs <= end + 150);
  if (!inside.length) return null;
  const first = inside[0];
  const last = inside[inside.length - 1];
  const next = t.words.find((w) => w.startMs > last.startMs && !inside.includes(w));
  return {
    startMs: Math.max(0, Math.round(first.startMs - 60)),
    endMs: Math.round(next ? next.startMs - 60 : last.endMs + PAD_MS),
    kind: "repeticao",
    reason,
  };
}

/** Junta cortes que se sobrepõem; a repetição (com motivo) prevalece sobre a pausa. */
export function mergeRemovals(list: Removal[]): Removal[] {
  const sorted = [...list].sort((a, b) => a.startMs - b.startMs);
  const out: Removal[] = [];
  for (const r of sorted) {
    const prev = out[out.length - 1];
    if (prev && r.startMs <= prev.endMs) {
      prev.endMs = Math.max(prev.endMs, r.endMs);
      if (r.kind === "repeticao") {
        prev.kind = "repeticao";
        prev.reason = r.reason ?? prev.reason;
      }
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

/** Trechos que ficam no vídeo final: [start, end] menos os cortes ativos. */
export function keptSpans(startMs: number, endMs: number, removals: Removal[] | null | undefined): Span[] {
  const active = mergeRemovals((removals ?? []).filter((r) => !r.keep));
  const spans: Span[] = [];
  let cursor = startMs;
  for (const r of active) {
    if (r.endMs <= cursor || r.startMs >= endMs) continue;
    if (r.startMs > cursor) spans.push({ startMs: cursor, endMs: Math.min(r.startMs, endMs) });
    cursor = Math.max(cursor, r.endMs);
  }
  if (cursor < endMs) spans.push({ startMs: cursor, endMs });
  return spans.filter((s) => s.endMs - s.startMs >= 80);
}

export function totalMs(spans: Span[]): number {
  return spans.reduce((sum, s) => sum + s.endMs - s.startMs, 0);
}

/** Palavras com tempo no vídeo final (já emendado): as que caem em trechos cortados somem. */
export function remapWords(words: Word[], spans: Span[]): Word[] {
  const out: Word[] = [];
  let offset = 0;
  for (const span of spans) {
    for (const w of words) {
      const mid = (w.startMs + w.endMs) / 2;
      if (mid < span.startMs || mid >= span.endMs) continue;
      out.push({
        text: w.text,
        startMs: offset + Math.max(0, w.startMs - span.startMs),
        endMs: offset + Math.min(span.endMs, w.endMs) - span.startMs,
      });
    }
    offset += span.endMs - span.startMs;
  }
  return out;
}

/**
 * Transcrição com o tempo de início (s) de cada palavra, uma frase por linha —
 * para o Claude marcar regravações com precisão de palavra.
 */
export function wordsForPrompt(t: Transcript): string {
  const lines: string[] = [];
  let line: string[] = [];
  for (const w of t.words) {
    line.push(`${(w.startMs / 1000).toFixed(2)}:${w.text}`);
    if (line.length >= 12 || /[.!?]$/.test(w.text)) {
      lines.push(line.join(" "));
      line = [];
    }
  }
  if (line.length) lines.push(line.join(" "));
  const last = t.words[t.words.length - 1];
  return lines.join("\n") + (last ? `\n(fim da fala: ${(last.endMs / 1000).toFixed(2)})` : "");
}

// ---------- Silêncios medidos no áudio (mais confiáveis que os tempos do whisper) ----------

/** Lê a saída do filtro silencedetect do FFmpeg ("silence_start: 1.2" … "silence_end: 2.5"). */
export function parseSilences(stderr: string, durationMs: number): Span[] {
  const spans: Span[] = [];
  let start: number | null = null;
  for (const m of stderr.matchAll(/silence_(start|end): (-?[\d.]+)/g)) {
    const ms = Math.max(0, Math.round(Number(m[2]) * 1000));
    if (m[1] === "start") start = ms;
    else if (start !== null) {
      spans.push({ startMs: start, endMs: ms });
      start = null;
    }
  }
  if (start !== null) spans.push({ startMs: start, endMs: durationMs }); // silêncio até o fim
  return spans;
}

/** Pausas = silêncios reais longos, deixando uma folga de fala antes e depois. */
export function pausesFromSilences(silences: Span[], durationMs: number): Removal[] {
  const out: Removal[] = [];
  for (const s of silences) {
    if (s.endMs - s.startMs < PAUSE_MS) continue;
    const startMs = s.startMs <= 50 ? 0 : s.startMs + PAD_MS;
    const endMs = s.endMs >= durationMs - 50 ? durationMs : s.endMs - PAD_MS;
    if (endMs - startMs >= MIN_CUT_MS) out.push({ startMs, endMs, kind: "pausa" });
  }
  return out;
}

/**
 * Move as bordas de uma regravação para dentro do silêncio real mais próximo,
 * para nunca cortar o começo ou o fim de uma palavra que fica.
 */
export function snapToSilences(r: Removal, silences: Span[], durationMs: number): Removal {
  const near = (ms: number, reach: number) =>
    silences
      .filter((s) => s.startMs - reach <= ms && ms <= s.endMs + reach)
      .sort((a, b) => Math.abs((a.startMs + a.endMs) / 2 - ms) - Math.abs((b.startMs + b.endMs) / 2 - ms))[0];
  const before = near(r.startMs, 500);
  const after = near(r.endMs, 700);
  return {
    ...r,
    startMs: before ? (before.startMs <= 50 ? 0 : before.startMs + PAD_MS) : r.startMs,
    endMs: after ? (after.endMs >= durationMs - 50 ? durationMs : after.endMs - PAD_MS) : r.endMs,
  };
}

// ---------- B-roll ----------

const BROLL_MIN_MS = 1800;
const BROLL_MAX_MS = 4500;
/** Os primeiros segundos ficam com o rosto e o gancho. */
export const BROLL_NOT_BEFORE_MS = 3500;

/** Converte os trechos do Claude (s, início da primeira e da última palavra) em itens com tempo real das palavras. */
export function brollFromPlan(t: Transcript, plan: { start: number; end: number; query: string; topic: string }[]): BrollItem[] {
  const out: BrollItem[] = [];
  for (const p of plan) {
    const inside = t.words.filter((w) => w.startMs >= p.start * 1000 - 150 && w.startMs <= p.end * 1000 + 150);
    if (!inside.length || !p.query.trim()) continue;
    const startMs = inside[0].startMs;
    let endMs = inside[inside.length - 1].endMs;
    if (endMs - startMs < BROLL_MIN_MS) endMs = startMs + BROLL_MIN_MS;
    if (endMs - startMs > BROLL_MAX_MS) endMs = startMs + BROLL_MAX_MS;
    if (out.length && startMs < out[out.length - 1].endMs) continue; // não sobrepõe
    out.push({ startMs, endMs, query: p.query.trim(), topic: p.topic.trim() });
  }
  return out;
}

/** Tempo da gravação original → tempo no vídeo editado (um ponto dentro de um corte vai para a emenda). */
export function toFinalMs(ms: number, spans: Span[]): number {
  let offset = 0;
  for (const s of spans) {
    if (ms < s.startMs) return offset;
    if (ms <= s.endMs) return offset + ms - s.startMs;
    offset += s.endMs - s.startMs;
  }
  return offset;
}

/** Janelas do B-roll no vídeo editado; descarta as que ficaram curtas demais depois dos cortes. */
export function brollWindows(items: BrollItem[], spans: Span[]): { item: BrollItem; startMs: number; endMs: number }[] {
  const out: { item: BrollItem; startMs: number; endMs: number }[] = [];
  for (const item of items) {
    if (item.keep === false || !item.file) continue;
    const startMs = Math.max(BROLL_NOT_BEFORE_MS, toFinalMs(item.startMs, spans));
    const endMs = toFinalMs(item.endMs, spans);
    if (endMs - startMs < 1000) continue;
    if (out.length && startMs < out[out.length - 1].endMs) continue;
    out.push({ item, startMs, endMs });
  }
  return out;
}

// ---------- Silêncio pelo volume médio (funciona com ruído de fundo) ----------

/** Tamanho da janela de medição de volume (ms). */
export const LEVEL_WINDOW_MS = 50;

/**
 * Silêncios a partir do volume médio (RMS, dB) de cada janela de 50 ms.
 * O `silencedetect` do FFmpeg olha amostra por amostra e, com chiado de microfone, nunca acha silêncio;
 * aqui o limite se adapta à gravação: um pouco acima do ruído de fundo (10º percentil) e
 * sempre bem abaixo da fala (70º percentil).
 */
export function silencesFromLevels(levelsDb: number[], durationMs: number): { spans: Span[]; noiseDb: number; thresholdDb: number | null } {
  const v = levelsDb.map((x) => (Number.isFinite(x) ? x : -120));
  if (!v.length) return { spans: [], noiseDb: -120, thresholdDb: null };
  const sorted = [...v].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.floor(p * (sorted.length - 1))];
  const noise = q(0.1);
  const speech = q(0.7);
  if (speech - noise < 6) return { spans: [], noiseDb: noise, thresholdDb: null }; // não dá para separar fala de fundo
  const threshold = Math.min(Math.max(noise + Math.max(4, 0.3 * (speech - noise)), -50), speech - 6);
  // Mediana de 3 janelas: um estalo isolado não quebra uma pausa, nem uma sílaba fraca vira silêncio.
  const smooth = v.map((_, i) => [v[i - 1] ?? v[i], v[i], v[i + 1] ?? v[i]].sort((a, b) => a - b)[1]);
  const spans: Span[] = [];
  let start: number | null = null;
  smooth.forEach((db, i) => {
    if (db < threshold) {
      if (start === null) start = i;
    } else if (start !== null) {
      spans.push({ startMs: start * LEVEL_WINDOW_MS, endMs: i * LEVEL_WINDOW_MS });
      start = null;
    }
  });
  if (start !== null) spans.push({ startMs: start * LEVEL_WINDOW_MS, endMs: durationMs });
  return { spans: spans.filter((s) => s.endMs - s.startMs >= 200), noiseDb: noise, thresholdDb: threshold };
}

/** Lê o arquivo do filtro `ametadata=print` com lavfi.astats.Overall.RMS_level. */
export function parseLevels(text: string): number[] {
  return [...text.matchAll(/RMS_level=(\S+)/g)].map((m) => Number(m[1]));
}

/**
 * O whisper costuma marcar a fala antes do som (no começo do vídeo, às vezes mais de 1 s antes).
 * Cada trecho de fala fica entre dois silêncios reais. Se as palavras desse trecho "começam" ainda
 * dentro do silêncio, o trecho inteiro é esticado/encaixado entre o fim do silêncio e o próximo
 * silêncio, mantendo ordem e proporção. Assim a legenda acompanha o som e nenhuma palavra cai num corte.
 */
export function alignWordsToSilences(words: Word[], silences: Span[]): Word[] {
  const out = words.map((w) => ({ ...w }));
  const sil = [...silences].sort((a, b) => a.startMs - b.startMs);
  sil.forEach((s, si) => {
    const regionEnd = sil[si + 1]?.startMs ?? Number.POSITIVE_INFINITY;
    const idx = out.map((w, i) => (w.startMs >= s.startMs && w.startMs < regionEnd ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return;
    const first = out[idx[0]].startMs;
    if (first >= s.endMs) return; // já começa depois do silêncio: o tempo do whisper está bom
    const lastEnd = Math.max(...idx.map((i) => out[i].endMs));
    const minSpan = 80 * idx.length;
    const dstEnd = Number.isFinite(regionEnd) ? regionEnd : Math.max(lastEnd, s.endMs + minSpan);
    const srcEnd = Math.max(lastEnd, Number.isFinite(regionEnd) ? regionEnd : lastEnd);
    if (dstEnd - s.endMs < minSpan || srcEnd <= first) return; // não cabe: deixa como está
    const map = (t: number) => Math.round(s.endMs + ((t - first) * (dstEnd - s.endMs)) / (srcEnd - first));
    for (const i of idx) {
      out[i].startMs = map(out[i].startMs);
      out[i].endMs = Math.min(dstEnd, Math.max(out[i].startMs + 60, map(out[i].endMs)));
    }
  });
  return out;
}
