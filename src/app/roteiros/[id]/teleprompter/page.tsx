import { notFound } from "next/navigation";

import { Teleprompter } from "@/components/teleprompter";
import { getScript } from "@/features/scripts/queries";

export const dynamic = "force-dynamic";

export default async function TeleprompterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const script = getScript(Number(id));
  if (!script?.beats?.length) notFound();
  return <Teleprompter lines={script.beats.map((b) => b.fala)} backHref={`/roteiros/${script.id}`} />;
}
