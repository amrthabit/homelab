import { createMemo, Show, type Component } from "solid-js";

export type ChartPoint = { ts: number; value: number };

interface Props {
  data: ChartPoint[];
  height?: number;
  width?: number;
  /** Tailwind text-color class for the line stroke. */
  color?: string;
  /** Override y range. Otherwise derived from data. */
  yMin?: number;
  yMax?: number;
  /** Format the displayed current value. */
  formatY?: (v: number) => string;
  /** Show fill under the line. */
  filled?: boolean;
}

export const Chart: Component<Props> = (props) => {
  const w = () => props.width ?? 240;
  const h = () => props.height ?? 48;
  const stroke = () => props.color ?? "var(--color-accent)";
  const fmt = props.formatY ?? ((v) => String(Math.round(v)));

  const computed = createMemo(() => {
    const data = props.data;
    if (!data.length) return null;

    const xs = data.map((p) => p.ts);
    const ys = data.map((p) => p.value);
    const xMin = xs[0];
    const xMax = xs[xs.length - 1];
    const yMin = props.yMin ?? Math.min(...ys);
    const yMax = props.yMax ?? Math.max(...ys);
    const yRange = Math.max(yMax - yMin, 1e-9);
    const xRange = Math.max(xMax - xMin, 1);

    const sx = (t: number) => ((t - xMin) / xRange) * (w() - 2) + 1;
    const sy = (v: number) => h() - 1 - ((v - yMin) / yRange) * (h() - 2);

    const linePath = data
      .map((p, i) => `${i ? "L" : "M"}${sx(p.ts).toFixed(1)},${sy(p.value).toFixed(1)}`)
      .join(" ");

    const fillPath = data.length > 1
      ? `M${sx(xs[0]).toFixed(1)},${h()} ` +
        data.map((p) => `L${sx(p.ts).toFixed(1)},${sy(p.value).toFixed(1)}`).join(" ") +
        ` L${sx(xs[xs.length - 1]).toFixed(1)},${h()} Z`
      : "";

    const last = ys[ys.length - 1];

    return { linePath, fillPath, last, yMin, yMax, samples: data.length };
  });

  return (
    <div class="w-full">
      <Show
        when={computed()}
        fallback={
          <div class="text-xs text-[var(--color-muted)] py-2">no data</div>
        }
      >
        {(c) => (
          <>
            <div class="flex justify-between items-baseline text-xs mb-1">
              <span class="text-[var(--color-muted)] font-mono">
                {fmt(c().yMin)}-{fmt(c().yMax)}
              </span>
              <span class="font-mono font-semibold" style={{ color: stroke() }}>
                {fmt(c().last)}
              </span>
            </div>
            <svg
              viewBox={`0 0 ${w()} ${h()}`}
              width="100%"
              height={h()}
              preserveAspectRatio="none"
              class="block"
            >
              <Show when={props.filled}>
                <path d={c().fillPath} fill={stroke()} fill-opacity="0.15" />
              </Show>
              <path d={c().linePath} fill="none" stroke={stroke()} stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
            </svg>
          </>
        )}
      </Show>
    </div>
  );
};

/** Bucket points by `bucketSec`, keeping the max value in each bucket. */
export function aggregateMax(points: ChartPoint[], bucketSec: number): ChartPoint[] {
  if (!points.length) return [];
  const buckets = new Map<number, number>();
  for (const p of points) {
    const k = Math.floor(p.ts / bucketSec) * bucketSec;
    const cur = buckets.get(k);
    if (cur === undefined || p.value > cur) buckets.set(k, p.value);
  }
  return [...buckets.entries()].sort(([a], [b]) => a - b).map(([ts, value]) => ({ ts, value }));
}

/** Compute delta-per-second from cumulative byte counters. */
export function deltaPerSecond(points: ChartPoint[]): ChartPoint[] {
  if (points.length < 2) return [];
  const out: ChartPoint[] = [];
  for (let i = 1; i < points.length; i++) {
    const dt = points[i].ts - points[i - 1].ts;
    let dv = points[i].value - points[i - 1].value;
    // Counter resets (router reboot, AP reassoc) → skip
    if (dt <= 0 || dv < 0) continue;
    out.push({ ts: points[i].ts, value: dv / dt });
  }
  return out;
}
