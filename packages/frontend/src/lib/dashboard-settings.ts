export interface DashboardSettings {
  panelOpacity: number;
  overlayStrength: number;
  chartOpacity: number;
  appBackgrounds: Record<string, string>;
}

export interface DashboardSettingsResponse extends DashboardSettings {
  updatedAt: string | null;
  writable: boolean;
}

export const DEFAULT_SETTINGS: DashboardSettings = {
  panelOpacity: 0.54,
  overlayStrength: 1,
  chartOpacity: 1,
  appBackgrounds: {},
};

const CACHE_KEY = "live-dashboard-settings-cache";
const OWNER_TOKEN_KEY = "live-dashboard-owner-token";
const OVERLAY_BASE = { top: 0.48, bottom: 0.66, side: 0.3 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function normalizeSettings(input: unknown): DashboardSettings {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  const appBackgrounds: Record<string, string> = {};
  const rawAppBackgrounds =
    record.appBackgrounds &&
    typeof record.appBackgrounds === "object" &&
    !Array.isArray(record.appBackgrounds)
      ? (record.appBackgrounds as Record<string, unknown>)
      : {};

  for (const [app, url] of Object.entries(rawAppBackgrounds)) {
    if (typeof url === "string" && url.trim()) appBackgrounds[app] = url;
  }

  return {
    panelOpacity:
      typeof record.panelOpacity === "number" && Number.isFinite(record.panelOpacity)
        ? clamp(record.panelOpacity, 0, 0.96)
        : DEFAULT_SETTINGS.panelOpacity,
    overlayStrength:
      typeof record.overlayStrength === "number" && Number.isFinite(record.overlayStrength)
        ? clamp(record.overlayStrength, 0, 1.6)
        : DEFAULT_SETTINGS.overlayStrength,
    chartOpacity:
      typeof record.chartOpacity === "number" && Number.isFinite(record.chartOpacity)
        ? clamp(record.chartOpacity, 0.05, 1)
        : DEFAULT_SETTINGS.chartOpacity,
    appBackgrounds,
  };
}

export function readCachedSettings(): DashboardSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? normalizeSettings(JSON.parse(raw)) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function cacheSettings(settings: DashboardSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(settings));
  } catch {
    // Best-effort cache; the server value stays authoritative.
  }
}

export function readOwnerToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(OWNER_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeOwnerToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(OWNER_TOKEN_KEY, token);
    else window.localStorage.removeItem(OWNER_TOKEN_KEY);
  } catch {
    // Token stays in memory for this session only.
  }
}

export function applySettings(settings: DashboardSettings): void {
  if (typeof document === "undefined") return;
  const style = document.documentElement.style;
  style.setProperty("--panel-alpha", String(round(settings.panelOpacity)));
  style.setProperty("--chart-alpha", String(round(settings.chartOpacity)));
  style.setProperty("--overlay-top", String(round(OVERLAY_BASE.top * settings.overlayStrength)));
  style.setProperty("--overlay-bottom", String(round(OVERLAY_BASE.bottom * settings.overlayStrength)));
  style.setProperty("--overlay-side", String(round(OVERLAY_BASE.side * settings.overlayStrength)));
}

const CHEAT_SEQUENCE = [
  "arrowup",
  "arrowup",
  "arrowdown",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "arrowleft",
  "arrowright",
  "b",
  "a",
];

export function nextCheatProgress(
  progress: string[],
  key: string,
): { progress: string[]; matched: boolean } {
  if (key === CHEAT_SEQUENCE[progress.length]) {
    const next = [...progress, key];
    if (next.length === CHEAT_SEQUENCE.length) return { progress: [], matched: true };
    return { progress: next, matched: false };
  }
  return { progress: key === CHEAT_SEQUENCE[0] ? [key] : [], matched: false };
}
