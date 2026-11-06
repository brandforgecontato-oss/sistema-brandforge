"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Teleprompter de tela cheia: rola o texto sozinho.
 * Espaço = começar/pausar · ↑/↓ = velocidade · +/- = tamanho da letra · Home = voltar ao início.
 */
export function Teleprompter({ lines, backHref }: { lines: string[]; backHref: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(40); // pixels por segundo
  const [size, setSize] = useState(44);
  const [mirror, setMirror] = useState(false);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = 0;
    // O navegador arredonda scrollTop: em velocidade baixa (< 1 px por quadro) somar direto nunca sai do lugar.
    let pos = boxRef.current?.scrollTop ?? 0;
    const step = (now: number) => {
      const box = boxRef.current;
      if (box) {
        if (Math.abs(box.scrollTop - pos) > 2) pos = box.scrollTop; // a pessoa rolou à mão
        pos += (speed * (now - last)) / 1000;
        box.scrollTop = pos;
        if (box.scrollTop + box.clientHeight >= box.scrollHeight - 1) setPlaying(false);
      }
      last = now;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSpeed((s) => Math.min(200, s + 5));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSpeed((s) => Math.max(5, s - 5));
      } else if (e.key === "+" || e.key === "=") setSize((s) => Math.min(96, s + 4));
      else if (e.key === "-") setSize((s) => Math.max(24, s - 4));
      else if (e.key === "Home") boxRef.current?.scrollTo({ top: 0 });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const control = "rounded-md border border-cream/20 px-3 py-1.5 text-sm text-cream hover:border-gold";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink text-cream">
      <div className="flex flex-wrap items-center gap-2 border-b border-cream/10 px-4 py-3 text-sm">
        <a href={backHref} className="mr-2 text-gold hover:underline">
          ← Voltar
        </a>
        <button className={`${control} min-w-24 bg-gold-deep`} onClick={() => setPlaying((p) => !p)}>
          {playing ? "Pausar" : "Começar"}
        </button>
        <button className={control} onClick={() => boxRef.current?.scrollTo({ top: 0 })}>
          Do início
        </button>
        <label className="flex items-center gap-2 text-cream/70">
          Velocidade
          <input type="range" min={5} max={200} step={5} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-28 accent-[var(--color-gold)]" />
        </label>
        <label className="flex items-center gap-2 text-cream/70">
          Letra
          <input type="range" min={24} max={96} step={4} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-24 accent-[var(--color-gold)]" />
        </label>
        <label className="flex items-center gap-1.5 text-cream/70">
          <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> Espelhar
        </label>
        <span className="ml-auto hidden text-xs text-cream/40 md:inline">Espaço: começar/pausar · ↑↓ velocidade · +/− letra</span>
      </div>

      <div ref={boxRef} className="relative flex-1 overflow-y-auto" onClick={() => setPlaying((p) => !p)}>
        {/* Linha-guia: leia o que estiver na altura dela. */}
        <div className="pointer-events-none fixed inset-x-0 top-[38%] z-10 border-t-2 border-gold/40" />
        <div
          className="mx-auto max-w-4xl px-6 pb-[70vh] pt-[35vh] font-semibold leading-snug"
          style={{ fontSize: size, transform: mirror ? "scaleX(-1)" : undefined }}
        >
          {lines.map((line, i) => (
            <p key={i} className="mb-[1.2em]">
              {line}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
