import { For, Show, createSignal, createResource, type Component } from "solid-js";
import type { Device, Vlan, State } from "../types";
import { Sparkline, HourlyBars } from "./Sparkline";
import { MiniToggle } from "./Toggle";
import { getHistory, toggleIotWan, toggleTrustedWan } from "../api";

// Module-level expansion state — persists across SSE-driven re-renders
const [openMacs, setOpenMacs] = createSignal<Set<string>>(new Set());

function toggleOpen(mac: string) {
  setOpenMacs((prev) => {
    const next = new Set(prev);
    next.has(mac) ? next.delete(mac) : next.add(mac);
    return next;
  });
}

const DeviceRow: Component<{
  device: Device;
  vlan: Vlan;
  state: State;
}> = (props) => {
  const open = () => openMacs().has(props.device.mac);
  const [history] = createResource(open, async (isOpen) => {
    if (!isOpen) return [];
    return getHistory(props.device.mac);
  });

  const stored = () => props.state.iot_wan_macs.includes(props.device.mac);
  const blocked = () => props.state.trusted_wan_blocked_macs.includes(props.device.mac);
  const effectiveOn = () => props.vlan.kind === "iot" ? props.state.vlan20_wan || stored() : !blocked();

  const handleToggleWan = async () => {
    if (props.vlan.kind === "iot") await toggleIotWan(props.device.mac);
    else if (props.vlan.kind === "trusted") await toggleTrustedWan(props.device.mac);
    // SSE pushes the updated snapshot — no manual refetch needed
  };

  return (
    <>
      <tr
        class="cursor-pointer transition hover:bg-[#1c2128] data-[open=true]:bg-[#1c2128]"
        attr:data-open={open() ? "true" : "false"}
        onClick={() => toggleOpen(props.device.mac)}
      >
        <td class="px-3 py-2 truncate">{props.device.hostname}</td>
        <td class="px-3 py-2 font-mono text-sm hidden sm:table-cell">{props.device.ip}</td>
        <td class="px-3 py-2 font-mono text-xs text-[var(--color-muted)] hidden sm:table-cell">{props.device.mac}</td>
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
      <Show when={open()}>
        <tr class="bg-[var(--color-bg)]">
          <td colspan="5" class="px-3 py-3 align-top max-w-0">
            <div class="space-y-3 min-w-0">
              <div class="sm:hidden grid gap-2 pb-3 border-b border-[var(--color-border)]">
                <Field label="IP" value={props.device.ip} mono />
                <Field label="MAC" value={props.device.mac} mono />
                <Field label="48h">
                  <Sparkline data={props.device.spark} />
                </Field>
              </div>
              <div class="overflow-x-auto whitespace-nowrap -mx-3 px-3 max-w-full">
                <Show when={!history.loading} fallback={<div class="text-xs text-[var(--color-muted)]">loading…</div>}>
                  <Show when={(history() ?? []).length > 0}>
                    <HourlyBars buckets={(history() ?? []).map((p) => ({ pct: p.pct, ts: p.ts }))} />
                  </Show>
                </Show>
              </div>
            </div>
          </td>
        </tr>
      </Show>
    </>
  );
};

const Field: Component<{ label: string; value?: string; mono?: boolean; children?: any }> = (props) => (
  <div class="flex items-center gap-3">
    <span class="text-xs uppercase tracking-wide text-[var(--color-muted)] min-w-[2.5rem]">{props.label}</span>
    {props.children ? props.children : <span class={`flex-1 break-all ${props.mono ? "font-mono text-sm" : ""}`}>{props.value}</span>}
  </div>
);

export const DeviceTable: Component<{ vlan: Vlan; state: State }> = (props) => (
  <section class="mb-8">
    <h2 class="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-2">{props.vlan.name}</h2>
    <div class="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
      <table class="w-full table-fixed">
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
  </section>
);
