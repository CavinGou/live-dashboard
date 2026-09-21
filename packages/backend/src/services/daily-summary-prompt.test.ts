import { describe, expect, test } from "bun:test";

import { buildDailySummaryUserPrompt } from "./daily-summary-prompt";

function localIso(
  hour: number,
  minute: number,
  second = 0,
): string {
  return new Date(2026, 6, 11, hour, minute, second).toISOString();
}

function localIsoAtMinute(minuteOfDay: number): string {
  return new Date(
    new Date(2026, 6, 11, 0, 0).getTime() + minuteOfDay * 60_000,
  ).toISOString();
}

function activitySession(
  deviceName: string,
  appName: string,
  displayTitle: string,
  startMinute: number,
  endMinute: number,
): Array<{
  device_name: string;
  app_name: string;
  display_title: string;
  started_at: string;
}> {
  const rows = [];
  for (let minute = startMinute; minute < endMinute; minute += 2) {
    rows.push({
      device_name: deviceName,
      app_name: appName,
      display_title: displayTitle,
      started_at: localIsoAtMinute(minute),
    });
  }
  rows.push({
    device_name: deviceName,
    app_name: appName,
    display_title: displayTitle,
    started_at: localIsoAtMinute(endMinute),
  });
  return rows;
}

describe("buildDailySummaryUserPrompt", () => {
  test("labels every continuous activity with an explicit time range", () => {
    const prompt = buildDailySummaryUserPrompt(
      [
        {
          device_name: "Work Mac",
          app_name: "VSCode",
          display_title: "project-a",
          started_at: localIso(9, 0),
        },
        {
          device_name: "Work Mac",
          app_name: "VSCode",
          display_title: "project-b",
          started_at: localIso(9, 1),
        },
        {
          device_name: "Work Mac",
          app_name: "VSCode",
          display_title: "project-b",
          started_at: localIso(9, 3),
        },
        {
          device_name: "Work Mac",
          app_name: "Chrome",
          display_title: "docs",
          started_at: localIso(9, 5),
        },
        {
          device_name: "Work Mac",
          app_name: "Chrome",
          display_title: "docs",
          started_at: localIso(9, 6),
        },
        {
          device_name: "Work Mac",
          app_name: "VSCode",
          display_title: "project-a",
          started_at: localIso(9, 30),
        },
      ],
      "2026-07-11",
      new Date(2026, 6, 11, 10, 0),
    );

    expect(prompt).toContain("活动时段: 09:00~09:31");
    expect(prompt).toContain(
      "09:00~09:05 (5分钟) [Work Mac] VSCode - project-a / project-b",
    );
    expect(prompt).toContain(
      "09:05~09:07 (2分钟) [Work Mac] Chrome - docs",
    );
    expect(prompt).toContain(
      "09:30~09:31 (1分钟) [Work Mac] VSCode - project-a",
    );
    expect(prompt).toContain("主要连续活动（按持续时间从长到短）:");
    expect(prompt).toContain(
      "09:00~09:05 (5分钟) [Work Mac] VSCode - project-a / project-b",
    );
    expect(prompt).toContain("VSCode: 约6分钟");
  });

  test("surfaces the longest continuous activities before sampled noise", () => {
    const prompt = buildDailySummaryUserPrompt(
      [
        ...activitySession("DESKTOP", "ChatGPT", "", 2 * 60 + 6, 10 * 60 + 27),
        ...activitySession("DESKTOP", "ALCOM", "ALCOM", 10 * 60 + 53, 13 * 60 + 33),
        ...activitySession("LAPTOP", "Chrome", "驰笙", 0, 9 * 60 + 18),
      ],
      "2026-09-21",
      new Date(2026, 8, 21, 16, 40),
    );

    const majorSection = prompt.split("主要连续活动")[1]?.split("活动时间线")[0];
    expect(majorSection).toContain(
      "[LAPTOP] Chrome - 驰笙",
    );
    expect(majorSection!.indexOf("[LAPTOP] Chrome")).toBeLessThan(
      majorSection!.indexOf("[DESKTOP] ChatGPT"),
    );
    expect(majorSection).toContain(
      "[DESKTOP] ALCOM - ALCOM",
    );
  });

  test("keeps device timelines independent when apps change", () => {
    const prompt = buildDailySummaryUserPrompt(
      [
        {
          device_name: "Mac",
          app_name: "Safari",
          display_title: "",
          started_at: localIso(20, 0),
        },
        {
          device_name: "Phone",
          app_name: "Bilibili",
          display_title: "video",
          started_at: localIso(20, 1),
        },
        {
          device_name: "Mac",
          app_name: "Safari",
          display_title: "",
          started_at: localIso(20, 2),
        },
      ],
      "2026-07-11",
      new Date(2026, 6, 11, 20, 5),
    );

    expect(prompt).toContain(
      "20:00~20:03 (3分钟) [Mac] Safari",
    );
    expect(prompt).toContain(
      "20:01~20:02 (1分钟) [Phone] Bilibili - video",
    );
  });
});
