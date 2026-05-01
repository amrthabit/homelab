export type State = {
  vlan10_to_vlan30: boolean;
  vlan20_wan: boolean;
  iot_wan_macs: string[];
  trusted_wan_blocked_macs: string[];
};

export type ToggleResult = {
  ok: boolean;
  msg: string;
  state: State;
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

export type GigahubDevice = {
  mac: string;
  ip: string;
  hostname: string;
  interface: string;
  active: boolean;
  last_seen: string;
};

export type WifiRadio = {
  alias: string;
  band: string;
  channel: number;
  bandwidth: string;
  power_pct: number;
  max_bit_rate: number;
  status: string;
  enabled: boolean;
};

export type WifiSsid = {
  alias: string;
  ssid: string;
  bssid: string;
  enabled: boolean;
  band: string;
  client_count: number;
};

export type GigahubInfo = {
  devices: GigahubDevice[];
  radios: WifiRadio[];
  ssids: WifiSsid[];
  ts: number;
  error: string | null;
};

export type Snapshot = {
  state: State;
  stats: Stats;
  vlans: Vlan[];
  gigahub: GigahubInfo;
  interfaces: string;
  routes: string;
  firewall: string;
};
