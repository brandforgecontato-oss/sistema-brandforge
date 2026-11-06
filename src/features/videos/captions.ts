import type { Word } from "./transcript";

/** Cores ASS são &HAABBGGRR. Dourado BrandForge #d4af69 e tinta #17140f. */
const GOLD = "&H0069AFD4";
const INK = "&H000F1417";
const WHITE = "&H00FFFFFF";

const MAX_WORDS = 3;
const MAX_CHARS = 22;
const HOOK_MS = 4000;

function assTime(ms: number): string {
  const cs = Math.max(0, Math.round(ms / 10));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

function escapeAss(text: string): string {
  return text.replace(/\\/g, "").replace(/[{}]/g, "").replace(/\n/g, " ");
}

/** Agrupa palavras em blocos curtos (estilo Reels), quebrando em pontuação. */
function chunkWords(words: Word[]): Word[][] {
  const chunks: Word[][] = [];
  let current: Word[] = [];
  for (const word of words) {
    const length = current.map((w) => w.text).join(" ").length + word.text.length + 1;
    if (current.length && (current.length >= MAX_WORDS || length > MAX_CHARS)) {
      chunks.push(current);
      current = [];
    }
    current.push(word);
    if (/[.!?,;:]$/.test(word.text)) {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/**
 * Gera a legenda .ass de um corte: gancho no topo nos primeiros segundos e legenda
 * palavra a palavra embaixo, com a palavra falada destacada em dourado.
 * `words` devem estar com tempos relativos ao início do corte.
 * `midRanges`: trechos em que a tela está dividida (B-roll em cima); a legenda sobe para a divisão.
 */
export function buildAss(words: Word[], hook: string, clipMs: number, midRanges: { startMs: number; endMs: number }[] = []): string {
  const styleAt = (ms: number) => (midRanges.some((r) => ms >= r.startMs && ms < r.endMs) ? "LegendaMeio" : "Legenda");
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Legenda,Arial,84,${WHITE},${WHITE},${INK},&H80000000,-1,0,0,0,100,100,0,0,1,7,0,2,80,80,460,1
Style: LegendaMeio,Arial,76,${WHITE},${WHITE},${INK},&H80000000,-1,0,0,0,100,100,0,0,1,7,0,2,80,80,910,1
Style: Gancho,Arial,70,${INK},${INK},${GOLD},${GOLD},-1,0,0,0,100,100,0,0,3,22,0,8,90,90,230,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines: string[] = [];
  if (hook.trim()) {
    lines.push(`Dialogue: 1,${assTime(0)},${assTime(Math.min(HOOK_MS, clipMs))},Gancho,,0,0,0,,${escapeAss(hook.trim())}`);
  }

  const chunks = chunkWords(words);
  chunks.forEach((chunk, ci) => {
    const nextStart = chunks[ci + 1]?.[0].startMs;
    const chunkEnd = chunk[chunk.length - 1].endMs;
    // Mantém o bloco na tela até o próximo se a pausa for curta, para a legenda não piscar.
    const holdUntil = nextStart !== undefined && nextStart - chunkEnd < 600 ? nextStart : chunkEnd + 300;

    chunk.forEach((word, wi) => {
      const start = word.startMs;
      const end = wi < chunk.length - 1 ? chunk[wi + 1].startMs : holdUntil;
      if (end <= start) return;
      const text = chunk
        .map((w, i) => {
          const t = escapeAss(w.text.toUpperCase());
          return i === wi ? `{\\c${GOLD}&}${t}{\\c${WHITE}&}` : t;
        })
        .join(" ");
      lines.push(`Dialogue: 0,${assTime(Math.max(0, start))},${assTime(Math.min(clipMs, end))},${styleAt(start)},,0,0,0,,${text}`);
    });
  });

  return header + lines.join("\n") + "\n";
}
