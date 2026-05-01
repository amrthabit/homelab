import { createResource, type Component } from "solid-js";
import { Chart, aggregateMax } from "./Chart";
import { getMetric } from "../api";

const fetchMetric = (key: string) => () => getMetric(key, 24);
const BUCKET_SEC = 300; // 5-minute buckets

export const SystemCharts: Component = () => {
  const [load] = createResource(fetchMetric("system.load_pct"));
  const [mem] = createResource(fetchMetric("system.mem_used_pct"));
  const [temp] = createResource(fetchMetric("system.temp"));

  return (
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div class="rounded border border-[var(--color-border)] bg-[var(--color-card)] p-3">
        <div class="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-1">load · max per 5m</div>
        <Chart
          data={aggregateMax(load()?.points ?? [], BUCKET_SEC)}
          color="var(--color-accent)"
          yMin={0}
          yMax={100}
          formatY={(v) => `${v.toFixed(0)}%`}
          filled
        />
      </div>
      <div class="rounded border border-[var(--color-border)] bg-[var(--color-card)] p-3">
        <div class="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-1">memory · max per 5m</div>
        <Chart
          data={aggregateMax(mem()?.points ?? [], BUCKET_SEC)}
          color="var(--color-warn)"
          yMin={0}
          yMax={100}
          formatY={(v) => `${v.toFixed(0)}%`}
          filled
        />
      </div>
      <div class="rounded border border-[var(--color-border)] bg-[var(--color-card)] p-3">
        <div class="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-1">CPU temp · max per 5m</div>
        <Chart
          data={aggregateMax(temp()?.points ?? [], BUCKET_SEC)}
          color="var(--color-low)"
          formatY={(v) => `${v.toFixed(1)}°C`}
          filled
        />
      </div>
    </div>
  );
};
