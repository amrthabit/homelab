import { createResource, type Component } from "solid-js";
import { Chart } from "./Chart";
import { getMetric } from "../api";

const fetchMetric = (key: string) => () => getMetric(key, 24);

export const SystemCharts: Component = () => {
  const [load] = createResource(fetchMetric("system.load_pct"));
  const [mem] = createResource(fetchMetric("system.mem_used_pct"));
  const [temp] = createResource(fetchMetric("system.temp"));

  return (
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div class="rounded border border-[var(--color-border)] bg-[var(--color-card)] p-3">
        <div class="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-1">load (1m)</div>
        <Chart
          data={load()?.points ?? []}
          color="var(--color-accent)"
          yMin={0}
          yMax={100}
          formatY={(v) => `${v.toFixed(0)}%`}
          filled
        />
      </div>
      <div class="rounded border border-[var(--color-border)] bg-[var(--color-card)] p-3">
        <div class="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-1">memory %</div>
        <Chart
          data={mem()?.points ?? []}
          color="var(--color-warn)"
          yMin={0}
          yMax={100}
          formatY={(v) => `${v.toFixed(0)}%`}
          filled
        />
      </div>
      <div class="rounded border border-[var(--color-border)] bg-[var(--color-card)] p-3">
        <div class="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-1">CPU temp</div>
        <Chart
          data={temp()?.points ?? []}
          color="var(--color-low)"
          formatY={(v) => `${v.toFixed(1)}°C`}
          filled
        />
      </div>
    </div>
  );
};
