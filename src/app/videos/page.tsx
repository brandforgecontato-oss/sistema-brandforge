import { Badge, Card, PageHeader, timeAgo } from "@/components/ui";
import { VIDEO_DIRS } from "@/lib/paths";
import { checkVideoTools, listVideos } from "@/features/videos/tools";

export const dynamic = "force-dynamic";

const FOLDER_LABELS: Record<keyof typeof VIDEO_DIRS, string> = {
  entrada: "Entrada — coloque aqui os vídeos brutos",
  trabalho: "Trabalho — arquivos temporários do pipeline",
  saida: "Saída — vídeos prontos",
};

export default async function VideosPage() {
  const tools = await checkVideoTools();
  const missing = tools.filter((t) => !t.version).length;
  const folders = (Object.keys(VIDEO_DIRS) as (keyof typeof VIDEO_DIRS)[]).map((key) => ({
    key,
    path: VIDEO_DIRS[key],
    files: listVideos(key),
  }));

  return (
    <>
      <PageHeader
        title="Vídeos"
        subtitle="Fase 2: baixar → transcrever → Claude escolhe os cortes → renderizar. Por enquanto, as pastas e as ferramentas."
      />

      <Card title="Ferramentas do pipeline" className="mb-6">
        <ul className="divide-y divide-line text-sm">
          {tools.map((t) => (
            <li key={t.name} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <strong>{t.name}</strong> <span className="text-body">— {t.purpose}</span>
              </span>
              {t.version ? <Badge tone="good">{t.version}</Badge> : <Badge tone="bad">não instalado</Badge>}
            </li>
          ))}
        </ul>
        {missing > 0 && (
          <p className="mt-3 text-xs text-body">
            Faltam {missing} ferramenta(s). Peça ao Claude: “instalar as ferramentas de vídeo do painel”.
          </p>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {folders.map((f) => (
          <Card key={f.key} title={FOLDER_LABELS[f.key]}>
            <p className="mb-3 break-all font-mono text-xs text-body">{f.path}</p>
            <ul className="space-y-1 text-sm">
              {f.files.map((file) => (
                <li key={file.name} className="flex justify-between gap-2">
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0 text-xs text-body">
                    {file.sizeMb.toFixed(0)} MB · {timeAgo(file.modifiedAt)}
                  </span>
                </li>
              ))}
              {f.files.length === 0 && <li className="text-xs text-body">Vazia.</li>}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
