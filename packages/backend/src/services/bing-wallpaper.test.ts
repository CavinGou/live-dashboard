import { describe, expect, test } from "bun:test";

import { parseBingWallpaper } from "./bing-wallpaper";

describe("parseBingWallpaper", () => {
  test("uses Bing's urlbase to request the UHD image", () => {
    expect(
      parseBingWallpaper({
        images: [{
          url: "/th?id=OHR.Example_ZH-CN123_1920x1080.jpg&pid=hp",
          urlbase: "/th?id=OHR.Example_ZH-CN123",
          title: "今日壁纸",
          copyright: "Example photographer",
        }],
      }),
    ).toEqual({
      url: "https://www.bing.com/th?id=OHR.Example_ZH-CN123_UHD.jpg&rf=LaDigue_UHD.jpg",
      title: "今日壁纸",
      copyright: "Example photographer",
    });
  });

  test("upgrades a 1080p image URL when urlbase is missing", () => {
    expect(
      parseBingWallpaper({
        images: [{
          url: "/th?id=OHR.Example_ZH-CN123_1920x1080.jpg&rf=LaDigue_1920x1080.jpg&pid=hp",
        }],
      }),
    ).toEqual({
      url: "https://www.bing.com/th?id=OHR.Example_ZH-CN123_UHD.jpg&rf=LaDigue_UHD.jpg&pid=hp",
      title: "",
      copyright: "",
    });
  });

  test("rejects empty payloads", () => {
    expect(parseBingWallpaper(null)).toBeNull();
    expect(parseBingWallpaper({ images: [] })).toBeNull();
    expect(parseBingWallpaper({ images: [{}] })).toBeNull();
  });
});
