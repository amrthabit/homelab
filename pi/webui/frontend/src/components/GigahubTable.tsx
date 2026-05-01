import { For, Show, createMemo, createSignal, type Component } from "solid-js";
import { Cable, Wifi as WifiIcon } from "lucide-solid";
import type { GigahubInfo } from "../types";

export const GigahubTable: Component<{ info: GigahubInfo }> = (props) => {
  const [filter, setFilter] = createSignal<"all" | "active" | "wifi" | "wired">("active");

  const devices = createMemo(() => {
    const f = filter();
    let list = props.info.devices;
    if (f === "active") list = list.filter((d) => d.active);
    if (f === "wifi") list = list.filter((d) => d.interface === "WiFi" && d.active);
    if (f === "wired") list = list.filter((d) => d.interface === "Ethernet" && d.active);
    return [...list].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      const usageA = (a.wifi?.bytes_tx || 0) + (a.wifi?.bytes_rx || 0);
      const usageB = (b.wifi?.bytes_tx || 0) + (b.wifi?.bytes_rx || 0);
      if (usageA !== usageB) return usageB - usageA;
      return (a.hostname || "").localeCompare(b.hostname || "");
    });
  });

  const lastUpdate = () => props.info.ts ? new Date(props.info.ts * 1000).toLocaleTimeString() : "-";

  return (
    <div>
      <div class="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <span class="text-xs text-[var(--color-muted)]">{devices().length} of {props.info.devices.length} shown</span>
        <div class="flex gap-1 text-xs">
          <FilterButton current={filter()} value="active" onClick={() => setFilter("active")}>active</FilterButton>
          <FilterButton current={filter()} value="wifi" onClick={() => setFilter("wifi")}>wifi</FilterButton>
          <FilterButton current={filter()} value="wired" onClick={() => setFilter("wired")}>wired</FilterButton>
          <FilterButton current={filter()} value="all" onClick={() => setFilter("all")}>all</FilterButton>
        </div>
      </div>

      <Show when={props.info.error}>
        <div class="border border-[var(--color-down)] bg-[#2d1010] text-[var(--color-down)] rounded-md px-3 py-2 text-xs mb-2">
          Gigahub error: {props.info.error}
        </div>
      </Show>

      <div class="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
        <table class="w-full table-fixed">
          <colgroup>
            <col />
            <col class="w-0 sm:w-32" />
            <col class="w-0 sm:w-36" />
            <col class="w-0 sm:w-20" />
            <col class="w-0 sm:w-32" />
            <col class="w-20" />
          </colgroup>
          <thead class="bg-[#1c2128] text-xs uppercase tracking-wide text-[var(--color-muted)]">
            <tr>
              <th class="px-3 py-2 text-left">hostname</th>
              <th class="px-3 py-2 text-left hidden sm:table-cell">IP</th>
              <th class="px-3 py-2 text-left hidden sm:table-cell">MAC</th>
              <th class="px-3 py-2 text-right hidden sm:table-cell">signal</th>
              <th class="px-3 py-2 text-right hidden sm:table-cell">data tx/rx</th>
              <th class="px-3 py-2 text-right">link</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--color-border)]">
            <Show when={devices().length > 0} fallback={
              <tr><td colspan="6" class="px-3 py-6 text-center text-[var(--color-muted)]">no devices</td></tr>
            }>
              <For each={devices()}>
                {(d) => (
                  <tr class={d.active ? "" : "opacity-50"}>
                    <td class="px-3 py-2 truncate">{d.hostname}</td>
                    <td class="px-3 py-2 font-mono text-sm hidden sm:table-cell truncate">{d.ip || "-"}</td>
                    <td class="px-3 py-2 font-mono text-xs text-[var(--color-muted)] hidden sm:table-cell truncate">{d.mac}</td>
                    <td class="px-3 py-2 text-right font-mono text-xs hidden sm:table-cell">
                      {d.wifi ? <SignalCell dbm={d.wifi.signal_dbm} /> : <span class="text-[var(--color-muted)]">-</span>}
                    </td>
                    <td class="px-3 py-2 text-right font-mono text-xs text-[var(--color-muted)] hidden sm:table-cell">
                      {d.wifi && (d.wifi.bytes_tx + d.wifi.bytes_rx > 0)
                        ? `${formatBytes(d.wifi.bytes_tx)} / ${formatBytes(d.wifi.bytes_rx)}`
                        : "-"}
                    </td>
                    <td class="px-3 py-2 text-right text-xs">
                      <span class={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono ${
                        d.interface === "WiFi"
                          ? "bg-[#1c3a4a] text-[#79c0ff]"
                          : "bg-[#1c3a1c] text-[#7ee787]"
                      }`}>
                        {d.interface === "WiFi" ? <WifiIcon size={12} /> : <Cable size={12} />}
                        {d.interface === "WiFi" ? "wifi" : "eth"}
                      </span>
                    </td>
                  </tr>
                )}
              </For>
            </Show>
          </tbody>
        </table>
      </div>
      <div class="text-[10px] text-[var(--color-muted)] mt-1 text-right">last refresh: {lastUpdate()}</div>
    </div>
  );
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

const SignalCell: Component<{ dbm: number }> = (p) => {
  const colour = () => {
    if (p.dbm === 0) return "text-[var(--color-muted)]";
    if (p.dbm >= -55) return "text-[var(--color-up)]";
    if (p.dbm >= -70) return "text-[var(--color-warn)]";
    if (p.dbm >= -80) return "text-[var(--color-low)]";
    return "text-[var(--color-down)]";
  };
  return <span class={colour()}>{p.dbm === 0 ? "-" : `${p.dbm} dBm`}</span>;
};

const FilterButton: Component<{ current: string; value: string; onClick: () => void; children: any }> = (p) => (
  <button
    onClick={p.onClick}
    class={`px-2 py-0.5 rounded border font-mono ${
      p.current === p.value
        ? "border-[var(--color-accent)] text-[var(--color-accent)]"
        : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"
    }`}
  >
    {p.children}
  </button>
);
