import { inputClass } from "@/components/ui";
import { AGENT_MODES, type AgentMode } from "@/db/schema";
import { MODE_INFO, MODELS } from "@/features/agents/labels";

/** Campos comuns a "novo pedido" e "continuar conversa": modo, modelo e o texto do pedido. */
export function AgentFields({
  defaultMode = "planejar",
  defaultModel = "sonnet",
  placeholder,
}: {
  defaultMode?: AgentMode;
  defaultModel?: string;
  placeholder: string;
}) {
  return (
    <>
      <textarea name="prompt" required rows={5} placeholder={placeholder} className={`${inputClass} w-full`} />
      <fieldset className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <legend className="sr-only">Modo</legend>
        {AGENT_MODES.map((mode) => (
          <label key={mode} className="flex items-start gap-2">
            <input type="radio" name="mode" value={mode} defaultChecked={mode === defaultMode} className="mt-1" />
            <span>
              <strong>{MODE_INFO[mode].label}</strong>
              <span className="block text-xs text-body">{MODE_INFO[mode].hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <select name="model" defaultValue={defaultModel} className={inputClass} aria-label="Modelo">
        {MODELS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
    </>
  );
}
