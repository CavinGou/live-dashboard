import { describe, expect, test } from "bun:test";

import { parseBingWallpaper } from "./bing-wallpaper";

describe("parseBingWallpaper", () => {
  test("resolves Bing's relative image URL", () => {
    expect(
      parseBingWallpaper({
        images: [{
          url: "/th?id=OHR.Example_ZH-CN123_1920x1080.jpg&pid=hp",
          title: "今日壁纸",
          copyright: "Example photographer",
        }],
      }),
    ).toEqual({
      url: "https://www.bing.com/th?id=OHR.Example_ZH-CN123_1920x1080.jpg&pid=hp",
      title: "今日壁纸",
      copyright: "Example photographer",
    });
  });

  test("rejects empty payloads", () => {
    expect(parseBingWallpaper(null)).toBeNull();
    expect(parseBingWallpaper({ images: [] })).toBeNull();
    expect(parseBingWallpaper({ images: [{}] })).toBeNull();
  });
});
