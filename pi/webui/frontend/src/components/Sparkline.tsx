import { For, type Component } from "solid-js";
import type { SparkData } from "../types";

const colorOf = (p: number | null) => {
  if (p === null) return "bg-[var(--color-border)]";
  if (p === 100) return "bg-[var(--color-up)]";
  if (p >= 50) return "bg-[var(--color-warn)]";
  if (p > 0) return "bg-[var(--color-low)]";
  return "bg-[var(--color-down)]";
};

export const Sparkline: Component<{ data: SparkData; class?: string; height?: string }> = (props) => (
  <span
    class={`inline-flex items-stretch ${props.class ?? ""}`}
    style={{ height: props.height ?? "22px" }}
    title={`avg ${props.data.avg ?? "—"}%, ${props.data.samples} samples`}
  >
    <For each={props.data.buckets}>
      {(p) => <i class={`inline-block w-px h-full ${colorOf(p)}`} />}
    </For>
  </span>
);

export const HourlyBars: Component<{ buckets: { pct: number | null; ts: number }[] }> = (props) => (
  <span class="inline-flex items-stretch h-7">
    <For each={props.buckets}>
      {(b) => (
        <i
          class={`inline-block w-px h-full ${colorOf(b.pct)}`}
          title={`${new Date(b.ts * 1000).toISOString().slice(0, 13)}:00Z — ${b.pct === null ? "no data" : b.pct + "%"}`}
        />
      )}
    </For>
  </span>
);
