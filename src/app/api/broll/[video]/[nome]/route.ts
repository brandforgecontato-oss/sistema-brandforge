import path from "node:path";

import { VIDEO_DIRS } from "@/lib/paths";
import { serveFile } from "@/lib/serve-file";

export const dynamic = "force-dynamic";

/** Prévia do B-roll baixado (pasta de trabalho do vídeo, subpasta broll). */
export async function GET(request: Request, { params }: { params: Promise<{ video: string; nome: string }> }) {
  const { video, nome } = await params;
  const id = Number(video);
  if (!Number.isInteger(id) || id <= 0) return new Response("vídeo inválido", { status: 404 });
  const file = path.join(VIDEO_DIRS.trabalho, String(id), "broll", path.basename(decodeURIComponent(nome)));
  return serveFile(request, file);
}
