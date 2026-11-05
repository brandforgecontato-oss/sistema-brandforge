import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { VIDEO_DIRS } from "@/lib/paths";

export const dynamic = "force-dynamic";

/** Serve vídeos das pastas de entrada/saída para o player, com suporte a Range (avançar/voltar). */
export async function GET(request: Request, { params }: { params: Promise<{ pasta: string; nome: string }> }) {
  const { pasta, nome } = await params;
  if (pasta !== "entrada" && pasta !== "saida") return new Response("pasta inválida", { status: 404 });

  const fileName = path.basename(decodeURIComponent(nome));
  const file = path.join(VIDEO_DIRS[pasta], fileName);
  if (!existsSync(file)) return new Response("não encontrado", { status: 404 });

  const size = statSync(file).size;
  const headers: Record<string, string> = { "Content-Type": "video/mp4", "Accept-Ranges": "bytes" };
  if (new URL(request.url).searchParams.has("baixar")) {
    headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`;
  }

  const range = request.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }

  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "Content-Length": String(size) } });
}
