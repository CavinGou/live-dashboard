export interface InfinityWallpaper {
  url: string;
  title: string;
  copyright: string;
}

export interface InfinityWallpaperRotation {
  wallpaper: InfinityWallpaper | null;
  refreshAfterMs: number;
}

const DEFAULT_ROTATION_MINUTES = 30;
const MIN_ROTATION_MINUTES = 1;
const MAX_ROTATION_MINUTES = 24 * 60;
const MAX_LIST_PAGE = 1_000;
const IMAGE_WIDTH = 3_840;
const API_URL = "https://api.inftab.com/v2/get_wallpaper_list";

let cached: {
  bucket: number;
  rotationMs: number;
  value: InfinityWallpaper | null;
} | null = null;
let pending: {
  bucket: number;
  rotationMs: number;
  promise: Promise<InfinityWallpaper | null>;
} | null = null;

export function getInfinityRotationMs(
  rawValue = process.env.WALLPAPER_ROTATION_MINUTES,
): number {
  const parsed = Number.parseInt(rawValue || "", 10);
  const minutes = Number.isFinite(parsed)
    ? Math.min(MAX_ROTATION_MINUTES, Math.max(MIN_ROTATION_MINUTES, parsed))
    : DEFAULT_ROTATION_MINUTES;
  return minutes * 60 * 1000;
}

function hashBucket(bucket: number, salt: number): number {
  let value = (bucket ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

export function getInfinityListPage(bucket: number): number {
  return (hashBucket(bucket, 0x9e3779b9) % MAX_LIST_PAGE) + 1;
}

function buildImageUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.trim());
    if (
      url.protocol !== "https:"
      || (url.hostname !== "infinitynewtab.com"
        && !url.hostname.endsWith(".infinitynewtab.com"))
    ) {
      return null;
    }
    url.search = `imageView2/2/w/${IMAGE_WIDTH}/format/webp/interlace/1`;
    return url.toString();
  } catch {
    return null;
  }
}

export function parseInfinityWallpapers(payload: unknown): InfinityWallpaper[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") return [];
  const list = (data as { list?: unknown }).list;
  if (!Array.isArray(list)) return [];

  return list.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const src = record.src;
    if (!src || typeof src !== "object") return [];
    const rawSrc = (src as Record<string, unknown>).rawSrc;
    if (typeof rawSrc !== "string") return [];

    const url = buildImageUrl(rawSrc);
    if (!url) return [];

    const imgId = typeof record.imgId === "string" ? record.imgId.trim() : "";
    const source = typeof record.source === "string" ? record.source.trim() : "";
    return [{
      url,
      title: imgId ? `Infinity 壁纸 #${imgId}` : "Infinity 壁纸",
      copyright: source ? `图源：${source}` : "",
    }];
  });
}

async function fetchInfinityPage(page: number): Promise<InfinityWallpaper[]> {
  const endpoint = new URL(API_URL);
  endpoint.searchParams.set("client", "pc");
  endpoint.searchParams.set("page", String(page));

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
      Origin: "https://inftab.com",
      Referer: "https://inftab.com/",
    },
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) {
    throw new Error(`Infinity returned ${response.status}`);
  }

  return parseInfinityWallpapers(await response.json());
}

async function loadInfinityWallpaper(bucket: number): Promise<InfinityWallpaper | null> {
  try {
    const page = getInfinityListPage(bucket);
    let wallpapers = await fetchInfinityPage(page);

    if (wallpapers.length === 0 && page !== 1) {
      wallpapers = await fetchInfinityPage(1);
    }
    if (wallpapers.length === 0) return null;

    const index = hashBucket(bucket, 0x85ebca6b) % wallpapers.length;
    return wallpapers[index] ?? null;
  } catch (error) {
    console.warn("[background] Infinity wallpaper unavailable:", error);
    return null;
  }
}

export async function getInfinityWallpaperRotation(
  now = Date.now(),
): Promise<InfinityWallpaperRotation> {
  const rotationMs = getInfinityRotationMs();
  const bucket = Math.floor(now / rotationMs);
  const refreshAfterMs = rotationMs - (now % rotationMs);

  if (cached && cached.bucket === bucket && cached.rotationMs === rotationMs) {
    return { wallpaper: cached.value, refreshAfterMs };
  }

  if (pending && pending.bucket === bucket && pending.rotationMs === rotationMs) {
    return { wallpaper: await pending.promise, refreshAfterMs };
  }

  const promise = loadInfinityWallpaper(bucket);
  pending = { bucket, rotationMs, promise };
  const wallpaper = await promise;
  cached = { bucket, rotationMs, value: wallpaper };
  if (pending.bucket === bucket && pending.rotationMs === rotationMs) {
    pending = null;
  }

  return { wallpaper, refreshAfterMs };
}
