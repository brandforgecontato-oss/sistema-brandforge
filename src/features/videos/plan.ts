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

// ---------- Vídeo curto: editar a gravação inteira ----------

export type ShortEditPlan = { title: string; hook: string; retakes: { start: number; end: number; reason: string }[] };

const SHORT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Nome interno curto do vídeo" },
    hook: { type: "string", description: "Texto de tela dos primeiros segundos, até 8 palavras" },
    retakes: {
      type: "array",
      description: "Trechos a remover porque o próprio falante errou e repetiu; vazio se não houver",
      items: {
        type: "object",
        properties: {
          start: { type: "number", description: "Tempo de início (s) da primeira palavra a remover" },
          end: { type: "number", description: "Tempo de início (s) da última palavra a remover" },
          reason: { type: "string", description: "Explicação curta, ex.: 'primeira tentativa da frase, regravada logo depois'" },
        },
        required: ["start", "end", "reason"],
      },
    },
  },
  required: ["title", "hook", "retakes"],
};

function buildShortPrompt(title: string, words: string, guidance: string | null): string {
  return `Você é editor de vídeos curtos da BrandForge, uma agência de marca. A pessoa gravou sozinha um vídeo curto ("${title}") para Reels/TikTok. Abaixo está a fala, palavra a palavra, cada uma com o tempo de início em segundos (formato tempo:palavra).

Tarefas:
1. "retakes": encontre os trechos que a própria pessoa descartou ao gravar. Por exemplo: uma frase começada e repetida logo depois, "não, pera", "de novo", "vou repetir", uma palavra errada e corrigida na hora. Remova a tentativa que falhou, junto com a fala de correção ("não, pera, de novo"), e mantenha a última versão completa. Na dúvida, NÃO marque: cortar fala boa é pior que deixar uma repetição. Não marque pausas ou silêncios, que já são tratados à parte. Use os tempos exatos das palavras.
2. "hook": texto que aparece na tela nos primeiros segundos, com até 8 palavras, em português, direto, sem emojis e sem prometer o que o vídeo não entrega.
3. "title": nome interno curto do vídeo.
${guidance ? `\nOrientação do usuário para este vídeo: ${guidance}\n` : ""}
Fala:
${words}`;
}

/** Pede ao Claude as regravações a cortar e o gancho de um vídeo curto. */
export async function planShortEdit(opts: { title: string; words: string; guidance: string | null; workDir: string }): Promise<ShortEditPlan> {
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
      JSON.stringify(SHORT_SCHEMA),
    ],
    { cwd: opts.workDir, timeoutMs: 5 * 60_000, input: buildShortPrompt(opts.title, opts.words, opts.guidance) },
  );
  const parsed = JSON.parse(stdout) as { is_error?: boolean; subtype?: string; result?: string; structured_output?: ShortEditPlan };
  if (parsed.is_error) throw new Error(`Claude respondeu com erro (${parsed.subtype}): ${parsed.result ?? ""}`.slice(0, 500));
  if (!parsed.structured_output) throw new Error("Claude não devolveu a análise do vídeo.");
  return parsed.structured_output;
}
