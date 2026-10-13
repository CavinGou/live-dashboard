import { getDashboardSettingsRow, upsertDashboardSettingsRow } from "../db";

export interface DashboardSettings {
  panelOpacity: number;
  overlayStrength: number;
  appBackgrounds: Record<string, string>;
}

export interface DashboardSettingsPayload extends DashboardSettings {
  updatedAt: string | null;
}

export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  panelOpacity: 0.54,
  overlayStrength: 1,
  appBackgrounds: {},
};

const MAX_APP_BACKGROUNDS = 60;
const MAX_APP_NAME_LENGTH = 120;
const MAX_URL_LENGTH = 2048;
const MAX_DATA_URI_LENGTH = 1_400_000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeAppBackground(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const url = value.trim();
  if (!url) return undefined;

  if (url.startsWith("data:image/")) {
    return url.length <= MAX_DATA_URI_LENGTH ? url : undefined;
  }

  if (url.length > MAX_URL_LENGTH) return undefined;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return undefined;
  } catch {
    return undefined;
  }

  return url;
}

export function sanitizeDashboardSettings(input: unknown): DashboardSettings {
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

  for (const [rawName, rawUrl] of Object.entries(rawAppBackgrounds)) {
    if (Object.keys(appBackgrounds).length >= MAX_APP_BACKGROUNDS) break;
    const name = typeof rawName === "string" ? rawName.trim().slice(0, MAX_APP_NAME_LENGTH) : "";
    if (!name) continue;
    const url = normalizeAppBackground(rawUrl);
    if (url) appBackgrounds[name] = url;
  }

  const panelOpacity =
    typeof record.panelOpacity === "number" && Number.isFinite(record.panelOpacity)
      ? clamp(record.panelOpacity, 0, 0.96)
      : DEFAULT_DASHBOARD_SETTINGS.panelOpacity;

  const overlayStrength =
    typeof record.overlayStrength === "number" && Number.isFinite(record.overlayStrength)
      ? clamp(record.overlayStrength, 0, 1.6)
      : DEFAULT_DASHBOARD_SETTINGS.overlayStrength;

  return { panelOpacity, overlayStrength, appBackgrounds };
}

export function getDashboardSettings(): DashboardSettingsPayload {
  const row = getDashboardSettingsRow.get() as { payload: string; updated_at: string } | undefined;
  if (!row) {
    return { ...DEFAULT_DASHBOARD_SETTINGS, appBackgrounds: {}, updatedAt: null };
  }

  try {
    const parsed = sanitizeDashboardSettings(JSON.parse(row.payload));
    return { ...parsed, updatedAt: row.updated_at };
  } catch {
    return { ...DEFAULT_DASHBOARD_SETTINGS, appBackgrounds: {}, updatedAt: row.updated_at };
  }
}

export function saveDashboardSettings(input: unknown): DashboardSettingsPayload {
  const sanitized = sanitizeDashboardSettings(input);
  const updatedAt = new Date().toISOString();
  upsertDashboardSettingsRow.run(JSON.stringify(sanitized), updatedAt);
  return { ...sanitized, updatedAt };
}
