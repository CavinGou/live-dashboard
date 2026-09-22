import { describe, expect, test } from "bun:test";

import {
  matchCustomBackground,
  type CustomBackgroundEntry,
} from "./custom-mappings";

describe("matchCustomBackground", () => {
  const entries: CustomBackgroundEntry[] = [
    { appId: "Code.exe", title: "MediaCrawlerPro", url: "https://example.com/code.jpg" },
    { appName: "ChatGPT", url: "https://example.com/chatgpt.jpg" },
  ];

  test("matches app id and title together", () => {
    expect(
      matchCustomBackground(entries, {
        appId: "Code.exe",
        appName: "VS Code",
        displayTitle: "config.py - MediaCrawlerPro",
      })?.url,
    ).toBe("https://example.com/code.jpg");
  });

  test("matches display app name case-insensitively", () => {
    expect(
      matchCustomBackground(entries, {
        appId: "ChatGPT.exe",
        appName: "chatgpt",
      })?.url,
    ).toBe("https://example.com/chatgpt.jpg");
  });

  test("returns undefined when nothing matches", () => {
    expect(
      matchCustomBackground(entries, {
        appId: "chrome.exe",
        appName: "Chrome",
        displayTitle: "Google",
      }),
    ).toBeUndefined();
  });
});
