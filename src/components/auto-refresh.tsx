"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Recarrega os dados da página enquanto o worker estiver processando algo. */
export function AutoRefresh({ active, everyMs = 4000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(id);
  }, [active, everyMs, router]);
  return active ? (
    <p className="mb-4 flex items-center gap-2 text-xs text-body">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-gold" /> Processando — a página se atualiza sozinha.
    </p>
  ) : null;
}
