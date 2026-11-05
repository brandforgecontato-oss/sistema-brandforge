"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { buttonClass, inputClass } from "@/components/ui";

type Progress = { name: string; pct: number; index: number; total: number };

/** Envia um arquivo com XHR (o fetch não informa o progresso do envio). Resolve com o id do vídeo criado. */
function send(file: File, query: URLSearchParams, onPct: (pct: number) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/videos/enviar?${query}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onPct(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body: { id?: number; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status === 200 && body.id) resolve(body.id);
      else reject(new Error(body.error ?? `erro ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("a conexão caiu durante o envio"));
    xhr.send(file);
  });
}

export function VideoUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"curto" | "longo">("curto");
  const [guidance, setGuidance] = useState("");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => f.size > 0);
    if (!files.length || progress) return;
    setError(null);
    const ids: number[] = [];
    try {
      for (const [index, file] of files.entries()) {
        setProgress({ name: file.name, pct: 0, index, total: files.length });
        const query = new URLSearchParams({ nome: file.name, kind });
        if (guidance.trim()) query.set("orientacao", guidance.trim());
        ids.push(await send(file, query, (pct) => setProgress((p) => (p ? { ...p, pct } : p))));
      }
    } catch (e) {
      setError(`${files[ids.length]?.name}: ${(e as Error).message}`);
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
    if (ids.length === 1 && files.length === 1) router.push(`/videos/${ids[0]}`);
    else router.refresh();
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files);
        }}
        className={`rounded-md border-2 border-dashed p-5 text-center text-sm transition-colors ${
          dragging ? "border-gold-deep bg-cream" : "border-line"
        }`}
      >
        {progress ? (
          <div className="space-y-2">
            <p className="truncate text-body">
              Enviando {progress.total > 1 ? `${progress.index + 1}/${progress.total}: ` : ""}
              <strong className="text-ink">{progress.name}</strong> · {progress.pct}%
            </p>
            <div className="h-2 overflow-hidden rounded bg-line">
              <div className="h-full bg-gold-deep transition-[width]" style={{ width: `${progress.pct}%` }} />
            </div>
          </div>
        ) : (
          <>
            <p className="mb-2 text-body">Arraste o vídeo para cá ou</p>
            <button type="button" className={buttonClass} onClick={() => inputRef.current?.click()}>
              Escolher arquivo
            </button>
            <p className="mt-2 text-xs text-body">MP4, MOV, MKV, WEBM ou AVI · pode enviar vários de uma vez</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="video/*,.mkv,.mov"
          multiple
          className="hidden"
          onChange={(e) => upload(e.target.files)}
        />
      </div>

      <input
        value={guidance}
        onChange={(e) => setGuidance(e.target.value)}
        placeholder="Orientação opcional: ex. “gancho mais provocativo”"
        className={`${inputClass} w-full`}
        disabled={!!progress}
      />
      <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-body" disabled={!!progress}>
        <legend className="sr-only">Tipo de edição</legend>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={kind === "curto"} onChange={() => setKind("curto")} /> Vídeo curto: editar inteiro
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={kind === "longo"} onChange={() => setKind("longo")} /> Vídeo longo: escolher cortes
        </label>
      </fieldset>
      {error && <p className="rounded-md bg-ember-soft px-3 py-2 text-xs text-ember">{error}</p>}
    </div>
  );
}
