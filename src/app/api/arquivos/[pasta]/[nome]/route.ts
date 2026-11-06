import path from "node:path";

import { VIDEO_DIRS } from "@/lib/paths";
import { serveFile } from "@/lib/serve-file";

export const dynamic = "force-dynamic";

/** Serve vídeos das pastas de entrada/saída para o player, com suporte a Range (avançar/voltar). */
export async function GET(request: Request, { params }: { params: Promise<{ pasta: string; nome: string }> }) {
  const { pasta, nome } = await params;
  if (pasta !== "entrada" && pasta !== "saida") return new Response("pasta inválida", { status: 404 });
  const file = path.join(VIDEO_DIRS[pasta], path.basename(decodeURIComponent(nome)));
  return serveFile(request, file, { download: new URL(request.url).searchParams.has("baixar") });
}
