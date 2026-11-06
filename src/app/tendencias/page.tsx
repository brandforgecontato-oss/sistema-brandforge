import { Badge, Card, PageHeader, buttonClass, ghostButtonClass, inputClass, timeAgo } from "@/components/ui";
import { TREND_STATUSES, type TrendStatus } from "@/db/schema";
import { addTrendSource, fetchTrendsNow, setTrendStatus, toggleTrendSource } from "@/features/trends/actions";
import { scriptFromTrend } from "@/features/scripts/actions";
import { scriptIdsByTrend } from "@/features/scripts/queries";
import { countTrendsByStatus, listTrendItems, listTrendSources } from "@/features/trends/queries";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<TrendStatus, string> = {
  novo: "Novos",
  salvo: "Salvos",
  ideia: "Ideias de conteúdo",
  descartado: "Descartados",
};

const ACTIONS: { to: TrendStatus; label: string }[] = [
  { to: "ideia", label: "Virar conteúdo" },
  { to: "salvo", label: "Salvar" },
  { to: "descartado", label: "Descartar" },
];

export default async function TendenciasPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { aba } = await searchParams;
  const tab: TrendStatus = TREND_STATUSES.includes(aba as TrendStatus) ? (aba as TrendStatus) : "novo";
  const items = listTrendItems(tab);
  const counts = countTrendsByStatus();
  const sources = listTrendSources();
  const scriptOf = scriptIdsByTrend();

  return (
    <>
      <PageHeader
        title="Tendências de IA e tech"
        subtitle="Notícias das fontes abaixo. O worker busca sozinho a cada 3 h; o botão busca agora."
        action={
          <form action={fetchTrendsNow}>
            <button className={buttonClass}>Buscar agora</button>
          </form>
        }
      />

      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        {TREND_STATUSES.map((s) => (
          <a key={s} href={`/tendencias?aba=${s}`} className={tab === s ? "font-semibold text-gold-deep" : "text-body hover:text-ink"}>
            {STATUS_LABELS[s]} <span className="text-body">({counts[s]})</span>
          </a>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-md border border-line bg-paper p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-body">
                <Badge>{item.sourceName}</Badge>
                <span>{timeAgo(item.publishedAt ?? item.createdAt)}</span>
              </div>
              <a href={item.link} target="_blank" rel="noreferrer" className="font-medium hover:text-gold-deep">
                {item.title}
              </a>
              {item.summary && <p className="mt-1 line-clamp-2 text-sm text-body">{item.summary}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {scriptOf.has(item.id) ? (
                  <a href={`/roteiros/${scriptOf.get(item.id)}`} className={ghostButtonClass}>
                    Ver roteiro →
                  </a>
                ) : (
                  <form action={scriptFromTrend}>
                    <input type="hidden" name="trendId" value={item.id} />
                    <button className={`${ghostButtonClass} border-gold text-gold-deep`}>Gerar roteiro</button>
                  </form>
                )}
                {ACTIONS.filter((a) => a.to !== item.status).map((a) => (
                  <form key={a.to} action={setTrendStatus}>
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="status" value={a.to} />
                    <button className={ghostButtonClass}>{a.label}</button>
                  </form>
                ))}
              </div>
            </li>
          ))}
          {items.length === 0 && (
            <li className="rounded-md border border-dashed border-line p-6 text-center text-sm text-body">
              Nada nesta aba. {tab === "novo" && "Clique em “Buscar agora”."}
            </li>
          )}
        </ul>

        <Card title="Fontes" className="h-fit">
          <ul className="space-y-2 text-sm">
            {sources.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-2">
                <div className={s.enabled ? "" : "opacity-50"}>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-body">
                    {s.lastError ? <span className="text-ember">erro: {s.lastError}</span> : `lida ${timeAgo(s.lastFetchedAt)}`}
                  </p>
                </div>
                <form action={toggleTrendSource}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="enabled" value={String(!s.enabled)} />
                  <button className={ghostButtonClass}>{s.enabled ? "Desligar" : "Ligar"}</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={addTrendSource} className="mt-4 space-y-2 border-t border-line pt-4">
            <input name="name" required placeholder="Nome da fonte" className={`${inputClass} w-full`} />
            <input name="url" required type="url" placeholder="URL do feed RSS" className={`${inputClass} w-full`} />
            <button className={buttonClass}>Adicionar fonte</button>
          </form>
        </Card>
      </div>
    </>
  );
}
