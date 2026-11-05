import type { ReactNode } from "react";

/**
 * Markdown mínimo para as respostas dos agentes: títulos, listas, blocos de código, **negrito** e `código`.
 * Monta elementos React (nunca HTML cru), então nada do texto do agente vira script na página.
 */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return (
        <code key={i} className="rounded bg-cream px-1 text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    return part;
  });
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const code: string[] = [];
      while (++i < lines.length && !lines[i].startsWith("```")) code.push(lines[i]);
      blocks.push(
        <pre key={i} className="overflow-x-auto rounded bg-cream p-2 text-xs">
          {code.join("\n")}
        </pre>,
      );
      continue;
    }
    const heading = line.match(/^#{1,4}\s+(.*)/);
    if (heading) {
      blocks.push(
        <p key={i} className="mt-3 font-semibold">
          {inline(heading[1])}
        </p>,
      );
      continue;
    }
    const item = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)/);
    if (item) {
      const depth = Math.min(3, Math.floor(item[1].length / 2));
      blocks.push(
        <p key={i} className="flex gap-2" style={{ paddingLeft: `${depth * 1.25}rem` }}>
          <span className="shrink-0 text-gold-deep">{/\d/.test(item[2]) ? item[2] : "•"}</span>
          <span>{inline(item[3])}</span>
        </p>,
      );
      continue;
    }
    blocks.push(line.trim() ? <p key={i}>{inline(line)}</p> : <div key={i} className="h-2" />);
  }
  return <div className="space-y-1 break-words text-sm leading-relaxed">{blocks}</div>;
}
