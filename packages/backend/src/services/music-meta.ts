const MAX_MUSIC_COVER_URL_LENGTH = 2048;
const MAX_MUSIC_COVER_DATA_LENGTH = 256 * 1024;
const IMAGE_DATA_URI_PATTERN =
  /^data:image\/(?:jpe?g|png|webp|gif|avif);base64,[a-z0-9+/]+={0,2}$/i;

export function normalizeMusicCover(rawCover: unknown): string | undefined {
  if (typeof rawCover !== "string") return undefined;

  const cover = rawCover.trim();
  if (!cover) return undefined;

  if (cover.startsWith("data:")) {
    if (cover.length > MAX_MUSIC_COVER_DATA_LENGTH) return undefined;
    return IMAGE_DATA_URI_PATTERN.test(cover) ? cover : undefined;
  }

  if (cover.length > MAX_MUSIC_COVER_URL_LENGTH) return undefined;

  try {
    const url = new URL(cover);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
  } catch {
    return undefined;
  }

  return cover;
}
