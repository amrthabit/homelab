export type State = {
  vlan10_to_vlan30: boolean;
  vlan20_wan: boolean;
  iot_wan_macs: string[];
  trusted_wan_blocked_macs: string[];
};

export type Stats = {
  uptime: string;
  load: string;
  mem_used_pct: number;
  mem_total_gb: number;
  temp: string;
};

export type SparkData = {
  buckets: (number | null)[];
  avg: number | null;
  samples: number;
};

export type Device = {
  hostname: string;
  ip: string;
  mac: string;
  spark: SparkData;
};

export type Vlan = {
  name: string;
  kind: "iot" | "trusted" | "mgmt";
  devices: Device[];
};

export type HistoryPoint = {
  h: number;
  pct: number | null;
  ts: number;
};

export type Snapshot = {
  state: State;
  stats: Stats;
  vlans: Vlan[];
  interfaces: string;
  routes: string;
  firewall: string;
};
