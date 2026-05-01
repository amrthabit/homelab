import type { Snapshot, HistoryPoint } from "./types";

const base = "/api";

export async function getSnapshot(): Promise<Snapshot> {
  const r = await fetch(`${base}/snapshot`);
  if (!r.ok) throw new Error(`snapshot: ${r.status}`);
  return r.json();
}

export async function getHistory(mac: string): Promise<HistoryPoint[]> {
  const r = await fetch(`${base}/history/${encodeURIComponent(mac)}`);
  if (!r.ok) throw new Error(`history: ${r.status}`);
  return r.json();
}

export async function toggleKey(key: string): Promise<void> {
  const r = await fetch(`${base}/toggle/${key}`, { method: "POST" });
  if (!r.ok) throw new Error(`toggle: ${r.status}`);
}

export async function toggleIotWan(mac: string): Promise<void> {
  const r = await fetch(`${base}/iot_wan/${encodeURIComponent(mac)}`, { method: "POST" });
  if (!r.ok) throw new Error(`iot_wan: ${r.status}`);
}

export async function toggleTrustedWan(mac: string): Promise<void> {
  const r = await fetch(`${base}/trusted_wan/${encodeURIComponent(mac)}`, { method: "POST" });
  if (!r.ok) throw new Error(`trusted_wan: ${r.status}`);
}
