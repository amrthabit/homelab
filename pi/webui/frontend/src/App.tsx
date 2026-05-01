import { createSignal, onCleanup, onMount, For, Show, type Component } from "solid-js";
import type { Snapshot } from "./types";
import { getSnapshot, subscribeSnapshot, toggleKey } from "./api";
import { ToggleCard } from "./components/Toggle";
import { DeviceTable } from "./components/DeviceTable";

const App: Component = () => {
  const [snap, setSnap] = createSignal<Snapshot | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  onMount(() => {
    // Initial load via fetch (so we render fast even before SSE is up)
    getSnapshot().then(setSnap).catch((e) => setError(String(e)));
    // Then live updates via SSE
    const close = subscribeSnapshot((s) => {
      setSnap(s);
      setError(null);
    });
    onCleanup(() => close());
  });

  const handleToggle = async (key: string) => {
    try {
      const res = await toggleKey(key);
      // SSE will follow up; but optimistic update so UI is snappy
      setSnap((s) => (s ? { ...s, state: res.state } : s));
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <main class="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <Show when={error()}>
        <div class="border border-[var(--color-down)] bg-[#2d1010] text-[var(--color-down)] rounded-md px-4 py-2 text-sm">
          {error()}
        </div>
      </Show>

      <Show when={snap()} fallback={<div class="text-[var(--color-muted)]">loading…</div>}>
        {(snap) => (
          <>
            <Show when={snap().state.vlan20_wan}>
              <div class="border border-[var(--color-low)] bg-[#2d2010] text-[var(--color-low)] rounded-md px-4 py-3 text-sm">
                ⚠ Blanket VLAN 20 WAN is ON — all IoT devices reach the internet regardless of per-device toggle. Per-device states are preserved; turn blanket OFF to apply them.
              </div>
            </Show>

            <section>
              <h2 class="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-2">system</h2>
              <div class="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Stat k="uptime" v={snap().stats.uptime} />
                <Stat k="load" v={snap().stats.load} />
                <Stat k="memory" v={`${snap().stats.mem_used_pct}% / ${snap().stats.mem_total_gb} GiB`} />
                <Stat k="temp" v={snap().stats.temp} />
              </div>
            </section>

            <section>
              <h2 class="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-2">toggles</h2>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ToggleCard
                  label="VLAN 10 → VLAN 30"
                  desc="laptop access to trusted services (HA, Proxmox)"
                  on={snap().state.vlan10_to_vlan30}
                  onClick={() => handleToggle("vlan10_to_vlan30")}
                />
                <ToggleCard
                  label="VLAN 20 internet (blanket)"
                  desc="forces WAN ON for all IoT — overrides per-device list"
                  on={snap().state.vlan20_wan}
                  onClick={() => handleToggle("vlan20_wan")}
                />
              </div>
            </section>

            <For each={snap().vlans}>
              {(vlan) => <DeviceTable vlan={vlan} state={snap().state} />}
            </For>

            <details class="rounded-md border border-[var(--color-border)] bg-[var(--color-card)]">
              <summary class="px-4 py-3 cursor-pointer text-xs uppercase tracking-wide text-[var(--color-muted)]">debug</summary>
              <div class="p-4 space-y-4">
                <Pre title="interfaces" body={snap().interfaces} />
                <Pre title="routes" body={snap().routes} />
                <Pre title="firewall" body={snap().firewall} />
              </div>
            </details>
          </>
        )}
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
