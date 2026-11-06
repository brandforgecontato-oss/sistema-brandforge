import { notFound } from "next/navigation";

import { AutoRefresh } from "@/components/auto-refresh";
import { CopyButton } from "@/components/copy-button";
import { Badge, Card, PageHeader, buttonClass, ghostButtonClass, inputClass } from "@/components/ui";
import { deleteScript, regenerateScript, saveScript } from "@/features/scripts/actions";
import { SCRIPT_STATUS } from "@/features/scripts/labels";
import { getScript, hasActiveScriptJobs } from "@/features/scripts/queries";

export const dynamic = "force-dynamic";

export default async function RoteiroPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const script = getScript(Number(id));
  if (!script) notFound();
  const st = SCRIPT_STATUS[script.status];
  const beats = script.beats ?? [];
  const words = beats.reduce((n, b) => n + b.fala.split(/\s+/).filter(Boolean).length, 0);
  const postText = [script.caption, script.hashtags].filter(Boolean).join("\n\n");
  const seconds = script.estimatedSec ?? Math.round(words / 2.6);

  return (
    <>
      <a href="/roteiros" className="mb-4 text-sm text-gold-deep hover:underline">
        ← Roteiros
      </a>
      <PageHeader
        title={script.title ?? script.topic}
        subtitle={`${words ? `${words} palavras · ~${seconds} s falando` : "Escrevendo…"}${script.trend ? ` · a partir de “${script.trend.title}”` : ""}`}
        action={<Badge tone={st.tone}>{st.label}</Badge>}
      />
      <AutoRefresh active={hasActiveScriptJobs()} />

      {script.status === "erro" && <p className="mb-6 rounded-md bg-ember-soft p-4 text-sm text-ember">{script.error}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {beats.length > 0 && (
            <form action={saveScript} className="space-y-4">
              <input type="hidden" name="id" value={script.id} />
              <Card title="Roteiro">
                <div className="mb-4 grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-body">
                    Nome
                    <input name="title" defaultValue={script.title ?? ""} className={`${inputClass} mt-1 w-full`} />
                  </label>
                  <label className="text-xs text-body">
                    Gancho na tela (primeiros segundos)
                    <input name="hookText" defaultValue={script.hookText ?? ""} className={`${inputClass} mt-1 w-full`} />
                  </label>
                </div>
                <ol className="space-y-3">
                  {beats.map((b, i) => (
                    <li key={i} className="grid gap-2 sm:grid-cols-[3.5rem_1fr_12rem]">
                      <span className="pt-2 font-mono text-xs text-gold-deep">{i === 0 ? "gancho" : i === beats.length - 1 ? "CTA" : i + 1}</span>
                      <textarea name={`fala_${i}`} defaultValue={b.fala} rows={2} className={`${inputClass} w-full`} aria-label="Fala" />
                      <input name={`tela_${i}`} defaultValue={b.tela} placeholder="texto na tela" className={`${inputClass} w-full text-xs`} aria-label="Texto na tela" />
                    </li>
                  ))}
                  <li className="grid gap-2 sm:grid-cols-[3.5rem_1fr_12rem]">
                    <span className="pt-2 font-mono text-xs text-body">+</span>
                    <textarea name="fala_nova" rows={1} placeholder="Novo bloco no final (opcional)" className={`${inputClass} w-full`} />
                    <input name="tela_nova" placeholder="texto na tela" className={`${inputClass} w-full text-xs`} />
                  </li>
                </ol>
                <p className="mt-2 text-xs text-body">Para apagar um bloco, deixe a fala vazia e salve.</p>
              </Card>

              <Card title="Post">
                <label className="block text-xs text-body">
                  Legenda
                  <textarea name="caption" defaultValue={script.caption ?? ""} rows={4} className={`${inputClass} mt-1 w-full`} />
                </label>
                <label className="mt-2 block text-xs text-body">
                  Hashtags
                  <input name="hashtags" defaultValue={script.hashtags ?? ""} className={`${inputClass} mt-1 w-full`} />
                </label>
              </Card>

              <button className={buttonClass}>Salvar alterações</button>
            </form>
          )}
          {beats.length === 0 && script.status === "gerando" && (
            <Card>
              <p className="text-sm text-body">O Claude está escrevendo. Leva uns 20 segundos; a página se atualiza sozinha.</p>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {beats.length > 0 && (
            <Card title="Gravar">
              <div className="flex flex-col gap-2">
                <a href={`/roteiros/${script.id}/teleprompter`} className={`${buttonClass} text-center`}>
                  Abrir teleprompter
                </a>
                {script.video ? (
                  <a href={`/videos/${script.video.id}`} className={`${ghostButtonClass} text-center`}>
                    Ver o vídeo gravado →
                  </a>
                ) : (
                  <a href={`/videos?roteiro=${script.id}`} className={`${ghostButtonClass} text-center`}>
                    Já gravei: enviar o vídeo →
                  </a>
                )}
                {postText && <CopyButton text={postText} label="Copiar legenda + hashtags" />}
              </div>
            </Card>
          )}

          <Card title="Reescrever">
            <form action={regenerateScript} className="space-y-2">
              <input type="hidden" name="id" value={script.id} />
              <textarea
                name="guidance"
                defaultValue={script.guidance ?? ""}
                rows={3}
                placeholder="Ex.: mais curto, tom mais polêmico, CTA para comentar “IA”…"
                className={`${inputClass} w-full`}
              />
              <button className={buttonClass} disabled={script.status === "gerando"}>
                Reescrever com o Claude
              </button>
              <p className="text-xs text-body">Substitui o texto atual, inclusive suas edições.</p>
            </form>
          </Card>

          {script.trend && (
            <Card title="Notícia de origem">
              <a href={script.trend.link} target="_blank" rel="noreferrer" className="text-sm font-medium hover:text-gold-deep">
                {script.trend.title}
              </a>
            </Card>
          )}

          <details className="text-xs text-body">
            <summary className="cursor-pointer">Excluir roteiro</summary>
            <form action={deleteScript} className="mt-2">
              <input type="hidden" name="id" value={script.id} />
              <button className="rounded-md bg-ember px-3 py-1.5 text-xs font-medium text-cream">Excluir de vez</button>
            </form>
          </details>
        </div>
      </div>
    </>
  );
}
