import { For, Show, createSignal, type Component } from "solid-js";
import type { SparkData } from "../types";

const colorOf = (p: number | null) => {
  if (p === null) return "bg-[var(--color-border)]";
  if (p === 100) return "bg-[var(--color-up)]";
  if (p >= 50) return "bg-[var(--color-warn)]";
  if (p > 0) return "bg-[var(--color-low)]";
  return "bg-[var(--color-down)]";
};

export const Sparkline: Component<{ data: SparkData; class?: string; height?: string }> = (props) => {
  const [hover, setHover] = createSignal<number | null>(null);
  const total = props.data.buckets.length;
  return (
    <div class="relative inline-block">
      <Show when={hover() !== null}>
        <div class="absolute -top-6 left-0 text-[10px] font-mono bg-[var(--color-card)] border border-[var(--color-border)] rounded px-1.5 py-0.5 whitespace-nowrap">
          {total - 1 - hover()!}h ago: {props.data.buckets[hover()!] === null ? "no data" : `${props.data.buckets[hover()!]}%`}
        </div>
      </Show>
      <span
        class={`inline-flex items-stretch ${props.class ?? ""}`}
        style={{ height: props.height ?? "22px" }}
        title={`avg ${props.data.avg ?? "—"}%, ${props.data.samples} samples`}
        onMouseLeave={() => setHover(null)}
      >
        <For each={props.data.buckets}>
          {(p, i) => (
            <i
              class={`inline-block w-px h-full ${colorOf(p)} ${hover() === i() ? "outline outline-1 outline-[var(--color-text)]" : ""}`}
              onMouseEnter={() => setHover(i())}
            />
          )}
        </For>
      </span>
    </div>
  );
};

export const HourlyBars: Component<{ buckets: { pct: number | null; ts: number }[] }> = (props) => {
  const [hover, setHover] = createSignal<number | null>(null);
  return (
    <div class="relative inline-block">
      <Show when={hover() !== null}>
        <div class="absolute -top-6 left-0 text-[10px] font-mono bg-[var(--color-card)] border border-[var(--color-border)] rounded px-1.5 py-0.5 whitespace-nowrap z-10">
          {new Date(props.buckets[hover()!].ts * 1000).toISOString().slice(0, 13)}:00Z — {props.buckets[hover()!].pct === null ? "no data" : `${props.buckets[hover()!].pct}%`}
        </div>
      </Show>
      <span
        class="inline-flex items-stretch h-7"
        onMouseLeave={() => setHover(null)}
      >
        <For each={props.buckets}>
          {(b, i) => (
            <i
              class={`inline-block w-px h-full ${colorOf(b.pct)} ${hover() === i() ? "outline outline-1 outline-[var(--color-text)]" : ""}`}
              onMouseEnter={() => setHover(i())}
            />
          )}
        </For>
      </span>
    </div>
  );
};
