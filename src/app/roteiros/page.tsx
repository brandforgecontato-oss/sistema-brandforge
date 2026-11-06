import { AutoRefresh } from "@/components/auto-refresh";
import { Badge, Card, PageHeader, buttonClass, inputClass, timeAgo } from "@/components/ui";
import { createScript } from "@/features/scripts/actions";
import { SCRIPT_STATUS } from "@/features/scripts/labels";
import { hasActiveScriptJobs, listScripts } from "@/features/scripts/queries";

export const dynamic = "force-dynamic";

export default async function RoteirosPage() {
  const list = listScripts();
  const active = hasActiveScriptJobs();

  return (
    <>
      <PageHeader
        title="Roteiros"
        subtitle="Tema ou tendência → o Claude escreve um roteiro de 30–45 s → você grava com o teleprompter → envia em Vídeos ligado ao roteiro."
      />
      <AutoRefresh active={active} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <ul className="space-y-2">
          {list.map((s) => {
            const st = SCRIPT_STATUS[s.status];
            return (
              <li key={s.id}>
                <a href={`/roteiros/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-paper p-4 hover:border-gold">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.title ?? s.topic}</span>
                    <span className="text-xs text-body">
                      {s.hookText ? `“${s.hookText}”` : s.topic} · {timeAgo(s.createdAt)}
                      {s.estimatedSec ? ` · ~${s.estimatedSec} s` : ""}
                    </span>
                  </span>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </a>
              </li>
            );
          })}
          {list.length === 0 && (
            <li className="rounded-md border border-dashed border-line p-6 text-center text-sm text-body">
              Nenhum roteiro ainda. Escreva um tema ao lado ou, em <a href="/tendencias" className="text-gold-deep underline">Tendências</a>, clique em
              “Gerar roteiro” numa notícia.
            </li>
          )}
        </ul>

        <Card title="Novo roteiro" className="h-fit">
          <form action={createScript} className="space-y-2">
            <textarea
              name="topic"
              required
              rows={3}
              placeholder="Tema. Ex.: por que responder o cliente no WhatsApp em 5 minutos vende mais"
              className={`${inputClass} w-full`}
            />
            <input name="guidance" placeholder="Orientação opcional: tom, público, CTA…" className={`${inputClass} w-full`} />
            <button className={buttonClass}>Escrever com o Claude</button>
          </form>
        </Card>
      </div>
    </>
  );
}
