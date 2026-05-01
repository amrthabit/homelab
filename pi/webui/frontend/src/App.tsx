import { createSignal, onCleanup, onMount, For, Show, type Component } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { Activity as ActivityIcon, AlertTriangle, Cpu, Network, Router, Settings, Wifi } from "lucide-solid";
import type { Snapshot } from "./types";
import { getSnapshot, subscribeSnapshot, toggleKey } from "./api";
import { ToggleCard } from "./components/Toggle";
import { DeviceTable } from "./components/DeviceTable";
import { GigahubTable } from "./components/GigahubTable";
import { WifiCard } from "./components/WifiCard";
import { Activity } from "./components/Activity";
import { Section } from "./components/Section";
import { SystemCharts } from "./components/SystemCharts";

const EMPTY_SNAPSHOT: Snapshot = {
  state: { vlan10_to_vlan30: false, vlan20_wan: false, iot_wan_macs: [], trusted_wan_blocked_macs: [] },
  stats: { uptime: "", load: "", mem_used_pct: 0, mem_total_gb: 0, temp: "" },
  vlans: [],
  gigahub: { devices: [], radios: [], ssids: [], ts: 0, error: null },
  interfaces: "",
  routes: "",
  firewall: "",
};

const App: Component = () => {
  const [snap, setSnap] = createStore<Snapshot>(EMPTY_SNAPSHOT);
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const update = (next: Snapshot) => {
    setSnap(reconcile(next, { merge: true }));
    setLoaded(true);
    setError(null);
  };

  onMount(() => {
    getSnapshot().then(update).catch((e) => setError(String(e)));
    const close = subscribeSnapshot(update);
    onCleanup(() => close());
  });

  const handleToggle = async (key: string) => {
    try {
      const res = await toggleKey(key);
      setSnap("state", reconcile(res.state));
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <main class="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <Show when={error()}>
        <div class="border border-[var(--color-down)] bg-[#2d1010] text-[var(--color-down)] rounded-md px-4 py-2 text-sm flex items-center gap-2">
          <AlertTriangle size={16} />
          {error()}
        </div>
      </Show>

      <Show when={loaded()} fallback={<div class="text-[var(--color-muted)]">loading...</div>}>
        <Show when={snap.state.vlan20_wan}>
          <div class="border border-[var(--color-low)] bg-[#2d2010] text-[var(--color-low)] rounded-md px-4 py-3 text-sm flex items-start gap-2">
            <AlertTriangle size={16} class="mt-0.5 shrink-0" />
            <span>Blanket VLAN 20 WAN is ON — all IoT devices reach the internet regardless of per-device toggle. Per-device states are preserved; turn blanket OFF to apply them.</span>
          </div>
        </Show>

        <Section
          title="system"
          icon={<Cpu size={14} />}
          right={<span class="text-xs text-[var(--color-muted)] font-mono">{snap.stats.uptime}</span>}
        >
          <SystemCharts />
        </Section>

        <Section title="toggles" icon={<Settings size={14} />}>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ToggleCard
              label="VLAN 10 -> VLAN 30"
              desc="laptop access to trusted services (HA, Proxmox)"
              on={snap.state.vlan10_to_vlan30}
              onClick={() => handleToggle("vlan10_to_vlan30")}
            />
            <ToggleCard
              label="VLAN 20 internet (blanket)"
              desc="forces WAN ON for all IoT — overrides per-device list"
              on={snap.state.vlan20_wan}
              onClick={() => handleToggle("vlan20_wan")}
            />
          </div>
        </Section>

        <For each={snap.vlans}>
          {(vlan) => (
            <Section title={vlan.name} icon={<Network size={14} />}>
              <DeviceTable vlan={vlan} state={snap.state} />
            </Section>
          )}
        </For>

        <Section title="Wi-Fi (Gigahub)" icon={<Wifi size={14} />} defaultOpen={false}>
          <WifiCard info={snap.gigahub} />
        </Section>

        <Section title="recent device activity" icon={<ActivityIcon size={14} />} defaultOpen={false}>
          <Activity devices={snap.gigahub.devices} />
        </Section>

        <Section
          title="Gigahub devices"
          icon={<Router size={14} />}
          defaultOpen={false}
        >
          <GigahubTable info={snap.gigahub} />
        </Section>

        <Section title="debug" icon={<Settings size={14} />} defaultOpen={false}>
          <div class="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-4 space-y-4">
            <Pre title="interfaces" body={snap.interfaces} />
            <Pre title="routes" body={snap.routes} />
            <Pre title="firewall" body={snap.firewall} />
          </div>
        </Section>
      </Show>
    </main>
  );
};

const Stat: Component<{ k: string; v: string | number }> = (p) => (
  <div class="flex flex-col gap-0.5">
    <span class="text-xs uppercase tracking-wide text-[var(--color-muted)]">{p.k}</span>
    <span class="font-mono">{p.v}</span>
  </div>
);

const Pre: Component<{ title: string; body: string }> = (p) => (
  <div>
    <div class="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-1">{p.title}</div>
    <pre class="bg-[var(--color-bg)] border border-[var(--color-border)] rounded p-3 overflow-x-auto text-xs leading-tight">{p.body}</pre>
  </div>
);

export default App;
