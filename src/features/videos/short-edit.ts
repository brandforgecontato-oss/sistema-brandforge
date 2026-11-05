import type { Removal } from "@/db/schema";
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
