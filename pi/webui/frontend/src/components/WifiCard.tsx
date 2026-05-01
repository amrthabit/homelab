import { For, type Component } from "solid-js";
import type { GigahubInfo } from "../types";

const bandLabel = (b: string) => b.replace("_", ".").replace("GHZ", " GHz").trim() || "—";

export const WifiCard: Component<{ info: GigahubInfo }> = (props) => (
  <section class="mb-8">
    <h2 class="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-2">Wi-Fi (Gigahub)</h2>
    <div class="space-y-3">

      {/* Radios */}
      <div class="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <For each={props.info.radios}>
          {(r) => (
            <div class={`rounded border p-3 ${r.status === "UP" ? "border-[var(--color-up)]" : "border-[var(--color-border)] opacity-50"}`}>
              <div class="flex items-baseline justify-between mb-1">
                <span class="font-mono font-semibold">{bandLabel(r.band)}</span>
                <span class="text-xs text-[var(--color-muted)]">{r.status}</span>
              </div>
              <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                <span class="text-[var(--color-muted)]">channel</span><span class="font-mono">{r.channel}</span>
                <span class="text-[var(--color-muted)]">width</span><span class="font-mono">{r.bandwidth}</span>
                <span class="text-[var(--color-muted)]">tx pwr</span><span class="font-mono">{r.power_pct}%</span>
                <span class="text-[var(--color-muted)]">max rate</span><span class="font-mono">{r.max_bit_rate} Mbps</span>
              </div>
            </div>
          )}
        </For>
      </div>

      {/* SSIDs */}
      <div class="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
        <table class="w-full">
          <thead class="bg-[#1c2128] text-xs uppercase tracking-wide text-[var(--color-muted)]">
            <tr>
              <th class="px-3 py-2 text-left">SSID</th>
              <th class="px-3 py-2 text-left hidden sm:table-cell">alias</th>
              <th class="px-3 py-2 text-left hidden sm:table-cell">BSSID</th>
              <th class="px-3 py-2 text-right">state</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--color-border)]">
            <For each={props.info.ssids}>
              {(s) => (
                <tr class={s.enabled ? "" : "opacity-50"}>
                  <td class="px-3 py-2 truncate">{s.ssid}</td>
                  <td class="px-3 py-2 font-mono text-xs text-[var(--color-muted)] hidden sm:table-cell">{s.alias}</td>
                  <td class="px-3 py-2 font-mono text-xs text-[var(--color-muted)] hidden sm:table-cell truncate">{s.bssid || "—"}</td>
                  <td class="px-3 py-2 text-right">
                    <span class={`inline-block px-2 py-0.5 rounded text-xs font-mono font-semibold ${
                      s.enabled
                        ? "bg-[#0f3a1c] text-[var(--color-up)]"
                        : "bg-[#3a1010] text-[var(--color-down)]"
                    }`}>
                      {s.enabled ? "ON" : "OFF"}
                    </span>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>

      {/* Access points + counts */}
      <div class="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <For each={props.info.aps}>
          {(a) => (
            <div class={`flex items-baseline justify-between gap-2 ${a.enabled ? "" : "opacity-50"}`}>
              <span class="font-mono">{a.alias}</span>
              <span class="font-mono text-[var(--color-muted)]">{a.client_count} clients</span>
            </div>
          )}
        </For>
      </div>

    </div>
  </section>
);
