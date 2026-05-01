import { createMemo, createSignal, Show, type Component } from "solid-js";

export type ChartPoint = { ts: number; value: number };

interface Props {
  data: ChartPoint[];
  height?: number;
  width?: number;
  color?: string;
  yMin?: number;
  yMax?: number;
  formatY?: (v: number) => string;
  filled?: boolean;
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  const now = Date.now();
  const dt = (now - d.getTime()) / 1000;
  if (dt < 60) return "just now";
  if (dt < 3600) return `${Math.round(dt / 60)}m ago`;
  if (dt < 86400) return `${Math.round(dt / 3600)}h ago`;
  return d.toISOString().slice(5, 16).replace("T", " ");
}

export const Chart: Component<Props> = (props) => {
  const w = () => props.width ?? 240;
  const h = () => props.height ?? 48;
  const stroke = () => props.color ?? "var(--color-accent)";
  const fmt = props.formatY ?? ((v) => String(Math.round(v)));

  const [hover, setHover] = createSignal<ChartPoint | null>(null);

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
    return { linePath, fillPath, last: ys[ys.length - 1], yMin, yMax, xMin, xMax, xRange, sx, sy };
  });

  const onMove = (e: MouseEvent) => {
    const c = computed();
    if (!c) return;
    const svg = e.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTs = c.xMin + ratio * c.xRange;
    let best: ChartPoint | null = null;
    let bestDist = Infinity;
    for (const p of props.data) {
      const d = Math.abs(p.ts - targetTs);
      if (d < bestDist) { bestDist = d; best = p; }
    }
    setHover(best);
  };

  const displayValue = () => hover()?.value ?? computed()?.last;
  const displayTs = () => hover()?.ts;

  return (
    <div class="w-full relative">
      <Show when={computed()} fallback={<div class="text-xs text-[var(--color-muted)] py-2">no data</div>}>
        {(c) => (
          <>
            <div class="flex justify-between items-baseline text-xs mb-1 min-h-[1em]">
              <span class="text-[var(--color-muted)] font-mono">
                {hover() ? formatTime(displayTs()!) : `${fmt(c().yMin)}-${fmt(c().yMax)}`}
              </span>
              <span class="font-mono font-semibold" style={{ color: stroke() }}>
                {displayValue() !== undefined ? fmt(displayValue()!) : "-"}
              </span>
            </div>
            <svg
              viewBox={`0 0 ${w()} ${h()}`}
              width="100%"
              height={h()}
              preserveAspectRatio="none"
              class="block cursor-crosshair"
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
            >
              <Show when={props.filled}>
                <path d={c().fillPath} fill={stroke()} fill-opacity="0.15" />
              </Show>
              <path d={c().linePath} fill="none" stroke={stroke()} stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
              <Show when={hover()}>
                {(hp) => (
                  <>
                    <line
                      x1={c().sx(hp().ts)}
                      x2={c().sx(hp().ts)}
                      y1={0}
                      y2={h()}
                      stroke="var(--color-muted)"
                      stroke-dasharray="2 2"
                      stroke-width="0.5"
                      vector-effect="non-scaling-stroke"
                    />
                    <circle
                      cx={c().sx(hp().ts)}
                      cy={c().sy(hp().value)}
                      r="2.5"
                      fill={stroke()}
                      stroke="var(--color-bg)"
                      stroke-width="1"
                      vector-effect="non-scaling-stroke"
                    />
                  </>
                )}
              </Show>
            </svg>
          </>
        )}
      </Show>
    </div>
  );
};

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

export function deltaPerSecond(points: ChartPoint[]): ChartPoint[] {
  if (points.length < 2) return [];
  const out: ChartPoint[] = [];
  for (let i = 1; i < points.length; i++) {
    const dt = points[i].ts - points[i - 1].ts;
    let dv = points[i].value - points[i - 1].value;
    if (dt <= 0 || dv < 0) continue;
    out.push({ ts: points[i].ts, value: dv / dt });
  }
  return out;
}
