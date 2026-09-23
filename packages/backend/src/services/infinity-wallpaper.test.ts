import { describe, expect, test } from "bun:test";

import {
  getInfinityListPage,
  getInfinityRotationMs,
  parseInfinityWallpapers,
} from "./infinity-wallpaper";

describe("parseInfinityWallpapers", () => {
  test("builds a 3840px WebP URL from the raw image", () => {
    expect(
      parseInfinityWallpapers({
        data: {
          list: [{
            imgId: "17031",
            source: "Unsplash",
            src: {
              rawSrc: "https://infinitypro-img.infinitynewtab.com/findaphoto/bigLink/17031.jpg",
            },
          }],
        },
      }),
    ).toEqual([{
      url: "https://infinitypro-img.infinitynewtab.com/findaphoto/bigLink/17031.jpg?imageView2/2/w/3840/format/webp/interlace/1",
      title: "Infinity 壁纸 #17031",
      copyright: "图源：Unsplash",
    }]);
  });

  test("skips malformed and untrusted image URLs", () => {
    expect(
      parseInfinityWallpapers({
        data: {
          list: [
            null,
            {},
            {
              imgId: "bad",
              src: { rawSrc: "https://example.com/image.jpg" },
            },
          ],
        },
      }),
    ).toEqual([]);
    expect(parseInfinityWallpapers(null)).toEqual([]);
    expect(parseInfinityWallpapers({ data: { list: "invalid" } })).toEqual([]);
  });
});

describe("wallpaper rotation", () => {
  test("uses a 30 minute default and accepts a configured interval", () => {
    expect(getInfinityRotationMs("")).toBe(30 * 60 * 1000);
    expect(getInfinityRotationMs("5")).toBe(5 * 60 * 1000);
    expect(getInfinityRotationMs("0")).toBe(60 * 1000);
    expect(getInfinityRotationMs("9999")).toBe(24 * 60 * 60 * 1000);
  });

  test("selects a stable valid page for each time bucket", () => {
    const first = getInfinityListPage(123456);
    expect(first).toBe(getInfinityListPage(123456));
    expect(first).toBeGreaterThanOrEqual(1);
    expect(first).toBeLessThanOrEqual(1_000);
  });
});
