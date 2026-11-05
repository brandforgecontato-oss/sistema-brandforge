import { runTool } from "@/lib/tools";
import { type Transcript, transcriptForPrompt } from "./transcript";

export type ProposedClip = { title: string; hook: string; reason: string; start: number; end: number };

const SCHEMA = {
  type: "object",
  properties: {
    clips: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Nome interno curto do corte" },
          hook: { type: "string", description: "Texto de tela dos primeiros segundos, até 8 palavras" },
          reason: { type: "string", description: "Por que esse trecho funciona como Reels" },
          start: { type: "number", description: "Início em segundos" },
          end: { type: "number", description: "Fim em segundos" },
        },
        required: ["title", "hook", "reason", "start", "end"],
      },
    },
  },
  required: ["clips"],
};

function buildPrompt(title: string, t: Transcript, guidance: string | null): string {
  return `Você é editor de vídeos curtos da BrandForge, uma agência de marca. Abaixo está a transcrição, com tempos em segundos, do vídeo "${title}" (${Math.round(t.durationMs / 1000)} s).

Escolha de 1 a 4 trechos que funcionem sozinhos como Reels/Shorts de 20 a 60 segundos:
- o trecho começa numa frase que prende a atenção (nada de "então", "bom", "como eu disse");
- termina numa conclusão, não no meio de uma ideia;
- não invente nada que não esteja na fala; use os tempos da transcrição;
- "hook" é o texto que aparece na tela nos primeiros segundos: até 8 palavras, em português, direto, sem emojis e sem prometer algo que o trecho não entrega.
${guidance ? `\nOrientação do usuário para este vídeo: ${guidance}\n` : ""}
Se o vídeo inteiro tiver menos de 60 s, devolva um único trecho com o vídeo todo.

Transcrição:
${transcriptForPrompt(t)}`;
}

type ClaudeResult = { is_error?: boolean; subtype?: string; result?: string; structured_output?: { clips?: ProposedClip[] } };

/**
 * Pede os cortes ao Claude Code em modo não interativo (usa a assinatura já logada na máquina).
 * Sem ferramentas, sem MCP, sem configurações de projeto e sem gravar sessão — só texto entra e JSON sai.
 */
export async function planClips(opts: {
  title: string;
  transcript: Transcript;
  guidance: string | null;
  workDir: string;
}): Promise<ProposedClip[]> {
  const { stdout } = await runTool(
    "claude",
    [
      "-p",
      "--output-format",
      "json",
      "--model",
      process.env.CLAUDE_MODEL ?? "sonnet",
      "--no-session-persistence",
      "--tools",
      "",
      "--strict-mcp-config",
      "--setting-sources",
      "",
      "--json-schema",
      JSON.stringify(SCHEMA),
    ],
    { cwd: opts.workDir, timeoutMs: 5 * 60_000, input: buildPrompt(opts.title, opts.transcript, opts.guidance) },
  );

  const parsed = JSON.parse(stdout) as ClaudeResult;
  if (parsed.is_error) throw new Error(`Claude respondeu com erro (${parsed.subtype}): ${parsed.result ?? ""}`.slice(0, 500));
  const clips = parsed.structured_output?.clips;
  if (!clips?.length) throw new Error("Claude não devolveu nenhum corte.");

  const maxSec = opts.transcript.durationMs / 1000;
  return clips
    .map((c) => ({ ...c, start: Math.max(0, c.start), end: Math.min(maxSec || c.end, c.end) }))
    .filter((c) => c.end - c.start >= 3);
}
