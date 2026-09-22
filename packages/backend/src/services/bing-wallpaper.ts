export interface BingWallpaper {
  url: string;
  title: string;
  copyright: string;
}

const CACHE_TTL_MS = 30 * 60 * 1000;
let cached: { value: BingWallpaper | null; fetchedAt: number } | null = null;

export function parseBingWallpaper(payload: unknown): BingWallpaper | null {
  if (!payload || typeof payload !== "object") return null;
  const images = (payload as { images?: unknown }).images;
  if (!Array.isArray(images) || images.length === 0) return null;
  const image = images[0];
  if (!image || typeof image !== "object") return null;
  const record = image as Record<string, unknown>;
  const rawUrl = typeof record.url === "string" ? record.url.trim() : "";
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl, "https://www.bing.com").toString();
    return {
      url,
      title: typeof record.title === "string" ? record.title : "",
      copyright: typeof record.copyright === "string" ? record.copyright : "",
    };
  } catch {
    return null;
  }
}

export async function getBingDailyWallpaper(): Promise<BingWallpaper | null> {
  const now = Date.now();
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.value;
  }

  try {
    const market = process.env.BING_MARKET?.trim() || "zh-CN";
    const endpoint = new URL("https://www.bing.com/HPImageArchive.aspx");
    endpoint.searchParams.set("format", "js");
    endpoint.searchParams.set("idx", "0");
    endpoint.searchParams.set("n", "1");
    endpoint.searchParams.set("mkt", market);

    const response = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) {
      throw new Error(`Bing returned ${response.status}`);
    }

    const value = parseBingWallpaper(await response.json());
    cached = { value, fetchedAt: now };
    return value;
  } catch (error) {
    console.warn("[background] Bing wallpaper unavailable:", error);
    cached = { value: null, fetchedAt: now };
    return null;
  }
}
