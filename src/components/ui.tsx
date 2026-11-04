import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-body">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ title, children, className = "" }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-line bg-paper p-5 ${className}`}>
      {title && <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gold-deep">{title}</h2>}
      {children}
    </section>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "bad" | "gold" }) {
  const tones = {
    neutral: "bg-cream text-body",
    good: "bg-moss-soft text-moss",
    bad: "bg-ember-soft text-ember",
    gold: "bg-gold/25 text-gold-deep",
  };
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export const buttonClass =
  "rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-cream transition-colors hover:bg-gold-deep disabled:opacity-50";
export const ghostButtonClass =
  "rounded-md border border-line px-2 py-1 text-xs text-body transition-colors hover:border-gold hover:text-ink";
export const inputClass =
  "rounded-md border border-line bg-paper px-3 py-1.5 text-sm outline-none focus:border-gold-deep";

const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

export function timeAgo(date: Date | null | undefined): string {
  if (!date) return "—";
  const diffMin = Math.round((date.getTime() - Date.now()) / 60_000);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffH = Math.round(diffMin / 60);
  if (Math.abs(diffH) < 48) return rtf.format(diffH, "hour");
  return rtf.format(Math.round(diffH / 24), "day");
}

export function formatDate(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
