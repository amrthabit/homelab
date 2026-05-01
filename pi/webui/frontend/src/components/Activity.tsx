import { For, Show, createMemo, type Component } from "solid-js";
import type { GigahubDevice } from "../types";

function fmtRelative(iso: string): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return iso;
  const dt = (Date.now() - t) / 1000;
  if (dt < 60) return `${Math.round(dt)}s ago`;
  if (dt < 3600) return `${Math.round(dt / 60)}m ago`;
  if (dt < 86400) return `${Math.round(dt / 3600)}h ago`;
  return `${Math.round(dt / 86400)}d ago`;
}

export const Activity: Component<{ devices: GigahubDevice[] }> = (props) => {
  const recent = createMemo(() => {
    const seen = props.devices.filter((d) => d.last_seen);
    return [...seen]
      .sort((a, b) => (a.last_seen < b.last_seen ? 1 : -1))
      .slice(0, 20);
  });

  return (
    <div class="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
        <table class="w-full">
          <thead class="bg-[#1c2128] text-xs uppercase tracking-wide text-[var(--color-muted)]">
            <tr>
              <th class="px-3 py-2 text-left">when</th>
              <th class="px-3 py-2 text-left">device</th>
              <th class="px-3 py-2 text-right">state</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--color-border)]">
            <Show when={recent().length > 0} fallback={
              <tr><td colspan="3" class="px-3 py-6 text-center text-[var(--color-muted)]">no activity</td></tr>
            }>
              <For each={recent()}>
                {(d) => (
                  <tr>
                    <td class="px-3 py-2 text-xs text-[var(--color-muted)] font-mono">{fmtRelative(d.last_seen)}</td>
                    <td class="px-3 py-2 truncate">{d.hostname} <span class="text-[var(--color-muted)] text-xs">({d.interface})</span></td>
                    <td class="px-3 py-2 text-right">
                      <span class={`text-xs font-mono ${d.active ? "text-[var(--color-up)]" : "text-[var(--color-muted)]"}`}>
                        {d.active ? "joined" : "left"}
                      </span>
                    </td>
                  </tr>
                )}
              </For>
            </Show>
          </tbody>
        </table>
      </div>
  );
};
