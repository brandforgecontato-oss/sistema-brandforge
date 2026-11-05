import { notFound } from "next/navigation";

import { AutoRefresh } from "@/components/auto-refresh";
import { Badge, Card, PageHeader, buttonClass, ghostButtonClass, inputClass } from "@/components/ui";
import { discardClip, renderClipAction, replanVideo, retryVideo, updateClip } from "@/features/videos/actions";
import { CLIP_STATUS, VIDEO_STATUS, formatDuration } from "@/features/videos/labels";
import { loadTranscript } from "@/features/videos/pipeline";
import { hasActiveVideoJobs, getVideoWithClips } from "@/features/videos/queries";
import { keptSpans, totalMs } from "@/features/videos/short-edit";
import { formatTimestamp } from "@/features/videos/transcript";

export const dynamic = "force-dynamic";

const fileUrl = (pasta: "entrada" | "saida", nome: string) => `/api/arquivos/${pasta}/${encodeURIComponent(nome)}`;

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = getVideoWithClips(Number(id));
  if (!video) notFound();

  const transcript = await loadTranscript(video.id);
  const active = hasActiveVideoJobs();
  const visibleClips = video.clips.filter((c) => c.status !== "descartado");
  const status = VIDEO_STATUS[video.status];
  const short = video.kind === "curto";

  return (
    <>
      <a href="/videos" className="mb-4 text-sm text-gold-deep hover:underline">
        ← Vídeos
      </a>
      <PageHeader
        title={video.title}
        subtitle={`${short ? "Vídeo curto · edição inteira" : "Vídeo longo · cortes"} · ${formatDuration(video.durationMs)}${video.sourceUrl ? ` · ${video.sourceUrl}` : ""}`}
        action={<Badge tone={status.tone}>{status.label}</Badge>}
      />
      <AutoRefresh active={active} />

      {video.status === "erro" && (
        <div className="mb-6 rounded-md bg-ember-soft p-4 text-sm text-ember">
          <p className="mb-2 whitespace-pre-wrap break-words">{video.error}</p>
          <form action={retryVideo}>
            <input type="hidden" name="id" value={video.id} />
            <button className={buttonClass}>Tentar de novo</button>
          </form>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {visibleClips.length === 0 && (
            <Card>
              <p className="text-sm text-body">
                {video.status === "revisar" ? "Nada proposto." : short ? "A edição aparece aqui quando o Claude terminar." : "Os cortes aparecem aqui quando o Claude terminar."}
              </p>
            </Card>
          )}

          {visibleClips.map((clip) => {
            const cs = CLIP_STATUS[clip.status];
            const finalMs = short ? totalMs(keptSpans(clip.startMs, clip.endMs, clip.removals)) : clip.endMs - clip.startMs;
            const activeCuts = (clip.removals ?? []).filter((r) => !r.keep).length;
            return (
              <Card
                key={clip.id}
                title={
                  <span className="flex items-center justify-between gap-2 normal-case tracking-normal">
                    <span className="font-display text-lg font-semibold text-ink">{clip.title}</span>
                    <Badge tone={cs.tone}>{cs.label}</Badge>
                  </span>
                }
              >
                <div className="flex flex-col gap-4 sm:flex-row">
                  {clip.status === "pronto" && clip.outputFile && (
                    <video
                      src={fileUrl("saida", clip.outputFile)}
                      controls
                      preload="metadata"
                      className="aspect-[9/16] w-full max-w-[220px] shrink-0 rounded-md bg-ink"
                    />
                  )}
                  <div className="min-w-0 flex-1 space-y-3 text-sm">
                    <p className="text-body">
                      {short ? (
                        <>
                          Vídeo final: <strong className="text-ink">{Math.round(finalMs / 1000)} s</strong> (gravação de{" "}
                          {Math.round((clip.endMs - clip.startMs) / 1000)} s, {activeCuts} corte(s) automático(s))
                        </>
                      ) : (
                        <>
                          {formatTimestamp(clip.startMs)} → {formatTimestamp(clip.endMs)} · {Math.round(finalMs / 1000)} s
                        </>
                      )}
                    </p>
                    {clip.reason && <p className="text-body">{clip.reason}</p>}
                    {clip.error && <p className="break-words text-xs text-ember">{clip.error}</p>}

                    <form action={updateClip} className="space-y-2 rounded-md bg-cream p-3">
                      <input type="hidden" name="id" value={clip.id} />
                      {short && (clip.removals?.length ?? 0) > 0 && (
                        <fieldset className="space-y-1">
                          <input type="hidden" name="removalsForm" value="1" />
                          <legend className="mb-1 text-xs text-body">
                            Cortes automáticos. Desmarque para manter o trecho no vídeo.
                          </legend>
                          <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
                            {clip.removals!.map((r, i) => (
                              <li key={i}>
                                <label className="flex items-start gap-2 text-xs">
                                  <input type="checkbox" name={`cut_${i}`} defaultChecked={!r.keep} className="mt-0.5" />
                                  <span className="font-mono text-gold-deep">
                                    {formatTimestamp(r.startMs)}–{formatTimestamp(r.endMs)}
                                  </span>
                                  <span className={r.kind === "repeticao" ? "text-ink" : "text-body"}>
                                    {r.kind === "repeticao" ? `regravação: ${r.reason ?? ""}` : "pausa"} ·{" "}
                                    {((r.endMs - r.startMs) / 1000).toFixed(1)} s
                                  </span>
                                </label>
                              </li>
                            ))}
                          </ul>
                        </fieldset>
                      )}
                      <label className="block text-xs text-body">
                        Gancho (texto no topo, primeiros 4 s)
                        <input name="hook" defaultValue={clip.hook} className={`${inputClass} mt-1 w-full`} />
                      </label>
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="text-xs text-body">
                          Início (s)
                          <input name="start" defaultValue={(clip.startMs / 1000).toFixed(1)} inputMode="decimal" className={`${inputClass} mt-1 block w-24`} />
                        </label>
                        <label className="text-xs text-body">
                          Fim (s)
                          <input name="end" defaultValue={(clip.endMs / 1000).toFixed(1)} inputMode="decimal" className={`${inputClass} mt-1 block w-24`} />
                        </label>
                      </div>
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="text-xs text-body">
                          Enquadramento
                          <select name="framing" defaultValue={clip.framing} className={`${inputClass} mt-1 block`}>
                            <option value="desfocado">Vídeo inteiro + fundo desfocado</option>
                            <option value="preencher">Preencher a tela (recorta as laterais)</option>
                          </select>
                        </label>
                        <label className="text-xs text-body">
                          Posição do recorte: esquerda ↔ direita
                          <input
                            type="range"
                            name="cropX"
                            min={0}
                            max={100}
                            step={5}
                            defaultValue={clip.cropX}
                            className="mt-2 block w-48 accent-[var(--color-gold-deep)]"
                          />
                        </label>
                        <button className={ghostButtonClass}>Salvar ajustes</button>
                      </div>
                    </form>

                    <div className="flex flex-wrap gap-2">
                      {clip.status !== "na_fila" && clip.status !== "renderizando" && (
                        <form action={renderClipAction}>
                          <input type="hidden" name="id" value={clip.id} />
                          <button className={buttonClass}>{clip.status === "pronto" ? "Renderizar de novo" : "Aprovar e renderizar"}</button>
                        </form>
                      )}
                      {clip.status === "pronto" && clip.outputFile && (
                        <a href={`${fileUrl("saida", clip.outputFile)}?baixar`} className={ghostButtonClass}>
                          Baixar MP4
                        </a>
                      )}
                      {clip.status === "proposto" && (
                        <form action={discardClip}>
                          <input type="hidden" name="id" value={clip.id} />
                          <button className={ghostButtonClass}>Descartar</button>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="space-y-4">
          {video.fileName && (
            <Card title="Original">
              <video src={fileUrl("entrada", video.fileName)} controls preload="metadata" className="w-full rounded-md bg-ink" />
            </Card>
          )}

          {transcript && (
            <Card title={short ? "Refazer a análise" : "Pedir outros cortes"}>
              <form action={replanVideo} className="space-y-2">
                <input type="hidden" name="id" value={video.id} />
                <textarea
                  name="guidance"
                  defaultValue={video.guidance ?? ""}
                  rows={3}
                  placeholder={short ? "Ex.: gancho mais provocativo; não corte a parte do “olha só”…" : "Ex.: cortes mais curtos, só a parte das dicas, tom mais polêmico…"}
                  className={`${inputClass} w-full`}
                />
                <button className={buttonClass} disabled={active}>
                  {short ? "Analisar de novo com o Claude" : "Replanejar com o Claude"}
                </button>
              </form>
            </Card>
          )}

          {transcript && (
            <Card title={`Transcrição (${transcript.words.length} palavras)`}>
              <div className="max-h-96 space-y-1 overflow-y-auto text-xs">
                {transcript.segments.map((s, i) => (
                  <p key={i}>
                    <span className="font-mono text-gold-deep">{formatTimestamp(s.startMs)}</span> {s.text}
                  </p>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
