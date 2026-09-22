const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

export interface DeviceState {
  device_id: string;
  device_name: string;
  platform: string;
  app_id: string;
  app_name: string;
  display_title?: string;
  last_seen_at: string;
  is_online: number;
  extra?: {
    battery_percent?: number;
    battery_charging?: boolean;
    app_icon?: string;
    music?: {
      title?: string;
      artist?: string;
      app?: string;
      cover?: string;
    };
  };
}

export interface ActivityRecord {
  id: number;
  device_id: string;
  device_name: string;
  platform: string;
  app_id: string;
  app_name: string;
  display_title?: string;
  started_at: string;
}

export interface TimelineSegment {
  app_name: string;
  app_id: string;
  display_title?: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number;
  duration_seconds?: number;
  device_id: string;
  device_name: string;
}

export interface CurrentResponse {
  devices: DeviceState[];
  recent_activities: ActivityRecord[];
  server_time: string;
  viewer_count: number;
}

export interface TimelineResponse {
  date: string;
  segments: TimelineSegment[];
  summary: Record<string, Record<string, number>>;
}

export interface SiteConfig {
  displayName: string;
  siteTitle: string;
  siteDescription: string;
  siteFavicon: string;
}

export interface DashboardRequestOptions {
  baseUrl?: string;
  dashboardId?: string;
}

export interface BackgroundResponse {
  source: "activity" | "bing" | "fallback";
  url: string | null;
  device_id: string;
  app_id: string;
  app_name: string;
  display_title: string;
  title: string;
  copyright: string;
}

export interface CurrentEventPayload {
  version: number;
  reason: string;
  updated_at: string;
}

export async function fetchCurrent(signal?: AbortSignal, _options?: DashboardRequestOptions): Promise<CurrentResponse> {
  const res = await fetch(`${API_BASE}/api/current`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchTimeline(date: string, signal?: AbortSignal, _options?: DashboardRequestOptions): Promise<TimelineResponse> {
  const tz = new Date().getTimezoneOffset(); // e.g. -480 for UTC+8
  const url = `${API_BASE}/api/timeline?date=${encodeURIComponent(date)}&tz=${tz}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchConfig(signal?: AbortSignal): Promise<SiteConfig> {
  const res = await fetch(`${API_BASE}/api/config`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchBackground(
  deviceId: string,
  signal?: AbortSignal,
): Promise<BackgroundResponse> {
  const url = `${API_BASE}/api/background?device_id=${encodeURIComponent(deviceId)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function subscribeCurrentEvents(
  onChange: (event: CurrentEventPayload) => void,
  onConnectionChange?: (connected: boolean) => void,
): () => void {
  if (typeof EventSource === "undefined") {
    onConnectionChange?.(false);
    return () => {};
  }

  const source = new EventSource(`${API_BASE}/api/events`);
  let disconnectTimer: number | undefined;

  const markConnected = () => {
    if (disconnectTimer !== undefined) {
      window.clearTimeout(disconnectTimer);
      disconnectTimer = undefined;
    }
    onConnectionChange?.(true);
  };

  const markDisconnected = () => {
    if (disconnectTimer !== undefined) {
      window.clearTimeout(disconnectTimer);
    }
    disconnectTimer = window.setTimeout(() => {
      if (source.readyState !== EventSource.OPEN) {
        onConnectionChange?.(false);
      }
    }, 1_500);
  };

  const handleCurrent = (event: MessageEvent<string>) => {
    markConnected();
    try {
      onChange(JSON.parse(event.data) as CurrentEventPayload);
    } catch {
      // Ignore malformed event payloads and keep the stream alive.
    }
  };

  source.addEventListener("current", handleCurrent as EventListener);
  source.addEventListener("ready", markConnected);
  source.addEventListener("open", markConnected);
  source.addEventListener("error", markDisconnected);

  return () => {
    if (disconnectTimer !== undefined) {
      window.clearTimeout(disconnectTimer);
    }
    source.close();
  };
}
