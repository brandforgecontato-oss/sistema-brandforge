import { AutoRefresh } from "@/components/auto-refresh";
import { Badge, Card, PageHeader, buttonClass, inputClass, timeAgo } from "@/components/ui";
import { VIDEO_DIRS } from "@/lib/paths";
import { addVideoFromUrl, importFile } from "@/features/videos/actions";
import { VIDEO_STATUS, formatDuration } from "@/features/videos/labels";
import { hasActiveVideoJobs, listUnregisteredFiles, listVideosWithClips } from "@/features/videos/queries";
import { checkVideoTools } from "@/features/videos/tools";

export const dynamic = "force-dynamic";

/** Tipo de edição: o padrão é o vídeo curto gravado por você, editado inteiro. */
function KindChoice() {
  return (
    <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-body">
      <legend className="sr-only">Tipo de edição</legend>
      <label className="flex items-center gap-1.5">
        <input type="radio" name="kind" value="curto" defaultChecked /> Vídeo curto: editar inteiro
      </label>
      <label className="flex items-center gap-1.5">
        <input type="radio" name="kind" value="longo" /> Vídeo longo: escolher cortes
      </label>
    </fieldset>
  );
}

export default async function VideosPage() {
  const [tools, list, files] = await Promise.all([checkVideoTools(), listVideosWithClips(), listUnregisteredFiles()]);
  const missing = tools.filter((t) => !t.version);
  const active = hasActiveVideoJobs();

  return (
    <>
      <PageHeader
        title="Vídeos"
        subtitle="Vídeo curto: a gravação inteira sai editada (sem pausas nem regravações, com legenda e gancho). Vídeo longo: o Claude propõe cortes. Você sempre revisa antes de renderizar."
      />
      <AutoRefresh active={active} />

      {missing.length > 0 && (
        <p className="mb-6 rounded-md bg-ember-soft px-4 py-2 text-sm text-ember">
          Falta: {missing.map((t) => t.name).join(", ")}. O pipeline não roda sem isso.
        </p>
      )}

      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <Card title="Baixar por link">
          <form action={addVideoFromUrl} className="space-y-2">
            <input name="url" type="url" required placeholder="https://www.youtube.com/watch?v=…" className={`${inputClass} w-full`} />
            <input name="guidance" placeholder="Orientação opcional: ex. “foque nas dicas práticas”" className={`${inputClass} w-full`} />
            <KindChoice />
            <button className={buttonClass}>Baixar e processar</button>
          </form>
          <p className="mt-2 text-xs text-body">YouTube, Instagram, TikTok e outros. Use só vídeos que você tem direito de usar.</p>
        </Card>

        <Card title="Arquivos na pasta de entrada">
          <p className="mb-3 break-all font-mono text-xs text-body">{VIDEO_DIRS.entrada}</p>
          <ul className="space-y-2">
            {files.map((f) => (
              <li key={f.name}>
                <form action={importFile} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="fileName" value={f.name} />
                  <span className="basis-full">
                    <KindChoice />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm" title={f.name}>
                    {f.name} <span className="text-xs text-body">· {f.sizeMb.toFixed(0)} MB</span>
                  </span>
                  <button className={buttonClass}>Processar</button>
                </form>
              </li>
            ))}
            {files.length === 0 && (
              <li className="text-sm text-body">Nenhum arquivo novo. Copie vídeos para a pasta acima e recarregue a página.</li>
            )}
          </ul>
        </Card>
      </div>

      <h2 className="mb-3 font-display text-xl font-semibold">Vídeos no pipeline</h2>
      <ul className="mb-8 space-y-2">
        {list.map((v) => {
          const ready = v.clips.filter((c) => c.status === "pronto").length;
          const proposed = v.clips.filter((c) => c.status === "proposto").length;
          return (
            <li key={v.id}>
              <a href={`/videos/${v.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-paper p-4 hover:border-gold">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{v.title}</span>
                  <span className="text-xs text-body">
                    {formatDuration(v.durationMs)} · adicionado {timeAgo(v.createdAt)}
                    {v.error && <span className="text-ember"> · {v.error.slice(0, 120)}</span>}
                  </span>
                </span>
                <span className="flex gap-1.5">
                  {proposed > 0 && <Badge>{proposed} proposto(s)</Badge>}
                  {ready > 0 && <Badge tone="good">{ready} pronto(s)</Badge>}
                  <Badge tone={VIDEO_STATUS[v.status].tone}>{VIDEO_STATUS[v.status].label}</Badge>
                </span>
              </a>
            </li>
          );
        })}
        {list.length === 0 && <li className="text-sm text-body">Nenhum vídeo ainda.</li>}
      </ul>

      <Card title="Ferramentas">
        <ul className="divide-y divide-line text-sm">
          {tools.map((t) => (
            <li key={t.name} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <strong>{t.name}</strong> <span className="text-body">— {t.purpose}</span>
              </span>
              {t.version ? <Badge tone="good">{t.version}</Badge> : <Badge tone="bad">não encontrado</Badge>}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
