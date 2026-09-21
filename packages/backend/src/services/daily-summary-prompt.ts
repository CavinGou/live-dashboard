export interface DailySummaryActivity {
  device_name: string;
  app_name: string;
  display_title: string;
  started_at: string;
}

interface ActivitySegment {
  deviceName: string;
  appName: string;
  titles: Set<string>;
  startMs: number;
  endMs: number;
  lastSeenMs: number;
  recordCount: number;
}

const GAP_THRESHOLD_MS = 2 * 60 * 1000;
const HEARTBEAT_ESTIMATE_MS = 60 * 1000;
const MAX_TIMELINE_SEGMENTS = 36;
const MAX_MAJOR_SEGMENTS = 8;
const MAJOR_SEGMENT_MINUTES = 5;
const MAX_TITLES_PER_SEGMENT = 3;

function parseTimestamp(value: string): number | null {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatClock(timestamp: number): string {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}小时${remainingMinutes}分钟` : `${hours}小时`;
}

function addTitle(segment: ActivitySegment, title: string): void {
  if (
    !title ||
    segment.titles.size >= MAX_TITLES_PER_SEGMENT ||
    segment.titles.has(title)
  ) {
    return;
  }
  segment.titles.add(title);
}

function createSegment(
  activity: DailySummaryActivity,
  startMs: number,
): ActivitySegment {
  const segment: ActivitySegment = {
    deviceName: activity.device_name,
    appName: activity.app_name,
    titles: new Set(),
    startMs,
    endMs: startMs + HEARTBEAT_ESTIMATE_MS,
    lastSeenMs: startMs,
    recordCount: 1,
  };
  addTitle(segment, activity.display_title?.trim().slice(0, 48) || "");
  return segment;
}

function buildActivitySegments(rows: DailySummaryActivity[]): ActivitySegment[] {
  const activities = rows
    .map((row) => ({ row, timestamp: parseTimestamp(row.started_at) }))
    .filter(
      (entry): entry is { row: DailySummaryActivity; timestamp: number } =>
        entry.timestamp !== null,
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  const segments: ActivitySegment[] = [];
  const currentByDevice = new Map<string, ActivitySegment>();

  for (const { row, timestamp } of activities) {
    const current = currentByDevice.get(row.device_name);
    const title = row.display_title?.trim().slice(0, 48) || "";

    if (!current) {
      const segment = createSegment(row, timestamp);
      currentByDevice.set(row.device_name, segment);
      segments.push(segment);
      continue;
    }

    const gapMs = timestamp - current.lastSeenMs;
    if (gapMs > GAP_THRESHOLD_MS) {
      current.endMs = current.lastSeenMs + HEARTBEAT_ESTIMATE_MS;
      const segment = createSegment(row, timestamp);
      currentByDevice.set(row.device_name, segment);
      segments.push(segment);
      continue;
    }

    if (current.appName !== row.app_name) {
      current.endMs = timestamp;
      const segment = createSegment(row, timestamp);
      currentByDevice.set(row.device_name, segment);
      segments.push(segment);
      continue;
    }

    current.lastSeenMs = timestamp;
    current.endMs = timestamp + HEARTBEAT_ESTIMATE_MS;
    current.recordCount++;
    addTitle(current, title);
  }

  return segments.sort((a, b) => a.startMs - b.startMs);
}

function sampleEvenly<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items;

  const sampled: T[] = [];
  const lastIndex = items.length - 1;
  for (let i = 0; i < limit; i++) {
    const index = Math.round((i * lastIndex) / (limit - 1));
    const item = items[index];
    if (item !== undefined) sampled.push(item);
  }
  return sampled;
}

function segmentDurationMinutes(segment: ActivitySegment): number {
  return Math.max(1, Math.round((segment.endMs - segment.startMs) / 60_000));
}

function formatSegmentLine(segment: ActivitySegment): string {
  const title = segment.titles.size > 0
    ? ` - ${Array.from(segment.titles).join(" / ")}`
    : "";
  return `  ${formatClock(segment.startMs)}~${formatClock(segment.endMs)} (${formatDuration(segmentDurationMinutes(segment))}) [${segment.deviceName}] ${segment.appName}${title}`;
}

export function buildDailySummaryUserPrompt(
  rows: DailySummaryActivity[],
  date: string,
  generatedAt: Date = new Date(),
): string {
  const segments = buildActivitySegments(rows);
  const currentTime = formatClock(generatedAt.getTime());
  const lines: string[] = [`日期: ${date}`, `当前时间: ${currentTime}`];

  if (segments.length > 0) {
    const first = segments[0]!;
    const lastEndMs = Math.max(...segments.map((segment) => segment.endMs));
    lines.push(`活动时段: ${formatClock(first.startMs)}~${formatClock(lastEndMs)}`);
  }

  const majorSegments = segments
    .filter((segment) => segmentDurationMinutes(segment) >= MAJOR_SEGMENT_MINUTES)
    .sort(
      (a, b) =>
        segmentDurationMinutes(b) - segmentDurationMinutes(a) ||
        a.startMs - b.startMs,
    )
    .slice(0, MAX_MAJOR_SEGMENTS);
  if (majorSegments.length > 0) {
    lines.push(`\n主要连续活动（按持续时间从长到短）:`);
    for (const segment of majorSegments) {
      lines.push(formatSegmentLine(segment));
    }
  }

  const sampled = segments.length > MAX_TIMELINE_SEGMENTS;
  lines.push(
    `\n活动时间线（每项为一个连续活动，格式为开始~结束，按时间顺序${sampled ? "，已等距抽样" : ""}）:`,
  );
  for (const segment of sampleEvenly(segments, MAX_TIMELINE_SEGMENTS)) {
    lines.push(formatSegmentLine(segment));
  }

  interface AppUsage {
    minutes: number;
    records: number;
    titles: Set<string>;
  }

  const byDevice = new Map<string, Map<string, AppUsage>>();
  for (const segment of segments) {
    let apps = byDevice.get(segment.deviceName);
    if (!apps) {
      apps = new Map();
      byDevice.set(segment.deviceName, apps);
    }

    let usage = apps.get(segment.appName);
    if (!usage) {
      usage = { minutes: 0, records: 0, titles: new Set() };
      apps.set(segment.appName, usage);
    }

    usage.minutes += segmentDurationMinutes(segment);
    usage.records += segment.recordCount;
    for (const title of segment.titles) usage.titles.add(title);
  }

  lines.push(`\n各应用使用统计（时间为根据活动记录估算）:`);
  for (const [deviceName, apps] of byDevice) {
    lines.push(`[${deviceName}]`);
    const sorted = Array.from(apps.entries()).sort(
      (a, b) => b[1].minutes - a[1].minutes,
    );
    for (const [appName, usage] of sorted.slice(0, 8)) {
      const titles = usage.titles.size > 0
        ? ` (${Array.from(usage.titles).slice(0, 3).join(", ")})`
        : "";
      lines.push(
        `  ${appName}: 约${formatDuration(usage.minutes)} (${usage.records}条记录)${titles}`,
      );
    }
  }

  return lines.join("\n");
}
