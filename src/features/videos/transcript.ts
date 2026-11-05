export type Word = { startMs: number; endMs: number; text: string };
export type Segment = { startMs: number; endMs: number; text: string };
export type Transcript = { language: string; durationMs: number; segments: Segment[]; words: Word[] };

type WhisperToken = { text: string; offsets: { from: number; to: number } };
type WhisperJson = {
  result?: { language?: string };
  transcription: { offsets: { from: number; to: number }; text: string; tokens?: WhisperToken[] }[];
};

/**
 * Converte a saída `-ojf` do whisper-cli no formato do painel.
 * Os tokens são pedaços de palavra (" Ol", "á"); um espaço no início marca palavra nova,
 * e pontuação sem espaço gruda na palavra anterior. Tokens especiais ("[_BEG_]", "[_TT_…]") são ignorados.
 */
export function parseWhisperJson(raw: WhisperJson, durationMs: number): Transcript {
  const segments: Segment[] = [];
  const words: Word[] = [];

  for (const seg of raw.transcription) {
    const text = seg.text.trim();
    if (!text) continue;
    segments.push({ startMs: seg.offsets.from, endMs: seg.offsets.to, text });

    let current: Word | null = null;
    for (const token of seg.tokens ?? []) {
      if (token.text.startsWith("[_") || token.text.startsWith("<|")) continue;
      const startsWord = /^\s/.test(token.text) || current === null;
      const piece = token.text.trim();
      if (!piece) continue;
      if (startsWord) {
        if (current) words.push(current);
        current = { startMs: token.offsets.from, endMs: token.offsets.to, text: piece };
      } else if (current) {
        current.text += piece;
        current.endMs = Math.max(current.endMs, token.offsets.to);
      }
    }
    if (current) words.push(current);
  }

  return { language: raw.result?.language ?? "pt", durationMs, segments, words };
}

export function formatTimestamp(ms: number): string {
  const total = Math.max(0, Math.round(ms / 100)) / 10;
  const m = Math.floor(total / 60);
  const s = (total % 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}

/** Texto com marcação de tempo por segmento — é o que o Claude lê para escolher os cortes. */
export function transcriptForPrompt(t: Transcript): string {
  return t.segments.map((s) => `[${(s.startMs / 1000).toFixed(1)}–${(s.endMs / 1000).toFixed(1)}] ${s.text}`).join("\n");
}

/** Ajusta início/fim para não cortar palavra no meio, com uma pequena folga. */
export function snapToWords(t: Transcript, startMs: number, endMs: number): { startMs: number; endMs: number } {
  const first = t.words.find((w) => w.endMs > startMs);
  const lastCandidates = t.words.filter((w) => w.startMs < endMs);
  const last = lastCandidates[lastCandidates.length - 1];
  const s = Math.max(0, (first?.startMs ?? startMs) - 150);
  const e = Math.min(t.durationMs || Number.MAX_SAFE_INTEGER, (last?.endMs ?? endMs) + 300);
  return { startMs: s, endMs: Math.max(e, s + 1000) };
}
