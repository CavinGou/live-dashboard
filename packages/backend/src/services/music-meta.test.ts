import { describe, expect, test } from "bun:test";

import { normalizeImageData, normalizeMusicCover } from "./music-meta";

describe("normalizeImageData", () => {
  test("accepts raster data URIs with a custom size limit", () => {
    expect(normalizeImageData("data:image/png;base64,AAAA", 32)).toBe(
      "data:image/png;base64,AAAA",
    );
    expect(normalizeImageData("data:image/png;base64,AAAA", 8)).toBeUndefined();
  });
});

describe("normalizeMusicCover", () => {
  test("accepts and trims HTTP(S) image URLs", () => {
    expect(normalizeMusicCover(" https://example.com/cover.jpg ")).toBe(
      "https://example.com/cover.jpg"
    );
    expect(normalizeMusicCover("http://example.com/cover.png")).toBe(
      "http://example.com/cover.png"
    );
  });

  test("accepts safe raster image data URIs", () => {
    const cover = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    expect(normalizeMusicCover(cover)).toBe(cover);
  });

  test("rejects non-HTTP values", () => {
    expect(normalizeMusicCover("javascript:alert(1)")).toBeUndefined();
    expect(normalizeMusicCover("data:image/svg+xml;base64,AAAA")).toBeUndefined();
    expect(normalizeMusicCover("data:text/plain;base64,AAAA")).toBeUndefined();
    expect(normalizeMusicCover("/covers/local.png")).toBeUndefined();
  });

  test("rejects empty and oversized values", () => {
    expect(normalizeMusicCover("   ")).toBeUndefined();
    expect(normalizeMusicCover(`https://example.com/${"a".repeat(2048)}`)).toBeUndefined();
  });
});
