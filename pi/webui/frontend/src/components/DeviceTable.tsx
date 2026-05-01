import { For, Show, createSignal, createResource, type Component } from "solid-js";
import type { Device, Vlan, State } from "../types";
import { Sparkline, HourlyBars } from "./Sparkline";
import { MiniToggle } from "./Toggle";
import { Chart, deltaPerSecond } from "./Chart";
import { getHistory, getMetric, toggleIotWan, toggleTrustedWan } from "../api";

function formatRate(bytesPerSec: number): string {
  const bps = bytesPerSec * 8;
  if (bps < 1000) return `${bps.toFixed(0)} bps`;
  if (bps < 1_000_000) return `${(bps / 1000).toFixed(1)} kbps`;
  if (bps < 1_000_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;
}

// Module-level expansion state — persists across SSE-driven re-renders + localStorage
const STORAGE_KEY = "homelab.openMacs";

function loadOpenMacs(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

const [openMacs, setOpenMacs] = createSignal<Set<string>>(loadOpenMacs());

function toggleOpen(mac: string) {
  setOpenMacs((prev) => {
    const next = new Set(prev);
    next.has(mac) ? next.delete(mac) : next.add(mac);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    } catch {}
    return next;
  });
}

const Field: Component<{ label: string; value?: string; mono?: boolean; children?: any }> = (p) => (
  <div class="flex flex-col gap-0.5 min-w-0">
    <span class="text-xs uppercase tracking-wide text-[var(--color-muted)]">{p.label}</span>
    {p.children ? p.children : <span class={`truncate ${p.mono ? "font-mono text-sm" : ""}`}>{p.value}</span>}
  </div>
);

const LegendDot: Component<{ color: string; label: string }> = (p) => (
  <span class="inline-flex items-center gap-1.5">
    <i class={`inline-block w-2.5 h-2.5 rounded-sm`} style={{ background: `var(--color-${p.color})` }} />
    <span>{p.label}</span>
  </span>
);

const DeviceRow: Component<{
  device: Device;
  vlan: Vlan;
  state: State;
}> = (props) => {
  const open = () => openMacs().has(props.device.mac);
  const [history] = createResource(open, async (isOpen) => (isOpen ? getHistory(props.device.mac) : []));
  const [tx] = createResource(open, async (isOpen) => (isOpen && props.device.wifi ? getMetric(`wifi.tx.${props.device.mac}`, 24) : null));
  const [rx] = createResource(open, async (isOpen) => (isOpen && props.device.wifi ? getMetric(`wifi.rx.${props.device.mac}`, 24) : null));
  const [signal] = createResource(open, async (isOpen) => (isOpen && props.device.wifi ? getMetric(`wifi.signal.${props.device.mac}`, 24) : null));

  const stored = () => props.state.iot_wan_macs.includes(props.device.mac);
  const blocked = () => props.state.trusted_wan_blocked_macs.includes(props.device.mac);
  const effectiveOn = () => props.vlan.kind === "iot" ? props.state.vlan20_wan || stored() : !blocked();

  const handleToggleWan = async () => {
    if (props.vlan.kind === "iot") await toggleIotWan(props.device.mac);
    else if (props.vlan.kind === "trusted") await toggleTrustedWan(props.device.mac);
  };

  return (
    <>
      <tr
        class="cursor-pointer transition hover:bg-[#1c2128] data-[open=true]:bg-[#1c2128]"
        attr:data-open={open() ? "true" : "false"}
        onClick={() => toggleOpen(props.device.mac)}
      >
        <td class="px-3 py-2 truncate">{props.device.hostname}</td>
        <td class="px-3 py-2 font-mono text-sm hidden sm:table-cell truncate">{props.device.ip}</td>
        <td class="px-3 py-2 font-mono text-xs text-[var(--color-muted)] hidden sm:table-cell truncate">{props.device.mac}</td>
        <td class="px-3 py-2 hidden sm:table-cell">
          <Sparkline data={props.device.spark} />
        </td>
        <td class="px-3 py-2 text-right">
          <Show when={props.vlan.kind !== "mgmt"}>
            <MiniToggle
              on={effectiveOn()}
              forced={props.vlan.kind === "iot" && props.state.vlan20_wan}
              onClick={handleToggleWan}
              title={props.vlan.kind === "iot" && props.state.vlan20_wan ? `forced ON by blanket; stored: ${stored() ? "ON" : "OFF"}` : undefined}
            />
          </Show>
        </td>
      </tr>
      <tr class="bg-[var(--color-bg)]">
        <td colspan="5" class="p-0 max-w-0">
          <div class={`grid transition-[grid-template-rows] duration-200 ease-out ${open() ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
            <div class="overflow-hidden">
              <div class="px-4 py-4 space-y-4 min-w-0">
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Field label="hostname" value={props.device.hostname} />
                  <Field label="IP" value={props.device.ip} mono />
                  <Field label="MAC" value={props.device.mac} mono />
                  <Field label="48h avg" value={props.device.spark.avg !== null ? `${props.device.spark.avg}%` : "—"} />
                </div>

                <div>
                  <div class="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-1">last 48 hours</div>
                  <Sparkline data={props.device.spark} />
                </div>

                <Show when={props.device.wifi}>
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div class="rounded border border-[var(--color-border)] p-2">
                      <div class="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-1">throughput tx (24h)</div>
                      <Chart
                        data={deltaPerSecond(tx()?.points ?? [])}
                        color="var(--color-up)"
                        formatY={formatRate}
                        filled
                      />
                    </div>
                    <div class="rounded border border-[var(--color-border)] p-2">
                      <div class="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-1">throughput rx (24h)</div>
                      <Chart
                        data={deltaPerSecond(rx()?.points ?? [])}
                        color="var(--color-warn)"
                        formatY={formatRate}
                        filled
                      />
                    </div>
                    <div class="rounded border border-[var(--color-border)] p-2">
                      <div class="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-1">signal (24h)</div>
                      <Chart
                        data={signal()?.points ?? []}
                        color="var(--color-accent)"
                        formatY={(v) => `${v.toFixed(0)} dBm`}
                      />
                    </div>
                  </div>
                </Show>

                <div>
                  <div class="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-1">uptime · last 30 days · 1px = 1 hour</div>
                  <div class="overflow-x-auto whitespace-nowrap max-w-full">
                    <Show
                      when={!history.loading}
                      fallback={<div class="text-xs text-[var(--color-muted)]">loading…</div>}
                    >
                      <Show when={(history() ?? []).length > 0}>
                        <HourlyBars buckets={(history() ?? []).map((p) => ({ pct: p.pct, ts: p.ts }))} />
                      </Show>
                    </Show>
                  </div>
                </div>

                <div class="flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--color-muted)] pt-1 border-t border-[var(--color-border)]">
                  <LegendDot color="up" label="100%" />
                  <LegendDot color="warn" label="50–99%" />
                  <LegendDot color="low" label="1–49%" />
                  <LegendDot color="down" label="0%" />
                  <LegendDot color="border" label="no data" />
                </div>
              </div>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
};

export const DeviceTable: Component<{ vlan: Vlan; state: State }> = (props) => (
  <div>
    <div class="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
      <table class="w-full table-fixed">
        <colgroup>
          <col />
          <col class="w-0 sm:w-auto" />
          <col class="w-0 sm:w-auto" />
          <col class="w-0 sm:w-auto" />
          <col class="w-20" />
        </colgroup>
        <thead class="bg-[#1c2128] text-xs uppercase tracking-wide text-[var(--color-muted)]">
          <tr>
            <th class="px-3 py-2 text-left">hostname</th>
            <th class="px-3 py-2 text-left hidden sm:table-cell">IP</th>
            <th class="px-3 py-2 text-left hidden sm:table-cell">MAC</th>
            <th class="px-3 py-2 text-left hidden sm:table-cell">48h</th>
            <th class="px-3 py-2 text-right">{props.vlan.kind !== "mgmt" ? "WAN" : ""}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--color-border)]">
          <Show when={props.vlan.devices.length > 0} fallback={
            <tr><td colspan="5" class="px-3 py-6 text-center text-[var(--color-muted)]">no devices</td></tr>
          }>
            <For each={props.vlan.devices}>
              {(d) => <DeviceRow device={d} vlan={props.vlan} state={props.state} />}
            </For>
          </Show>
        </tbody>
      </table>
    </div>
  </div>
);
