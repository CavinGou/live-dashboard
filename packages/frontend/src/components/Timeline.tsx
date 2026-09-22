import { useEffect, useMemo, useState } from "react";
import type { TimelineSegment } from "@/lib/api";

const PALETTE = [
  "#d4788a", "#7aab8a", "#c4a060", "#8a8ec0", "#6ab8b8",
  "#b88870", "#789a78", "#b0906a", "#a080a0", "#7ab0a0",
];

const LANE_HEIGHT = 52;
const AXIS_HEIGHT = 24;
const MERGE_GAP_MS = 2 * 60 * 1000;
const MINUTES_PER_DAY = 24 * 60;

export type ActivityViewMode = "timeline" | "usage";

interface Lane {
  activities: Array<{
    aggregateOffset: number;
    segment: TimelineSegment;
  }>;
  appName: string;
  totalMinutes: number;
}

interface ActiveBar {
  appName: string;
  color: string;
  laneIndex: number;
  left: number;
  segment: TimelineSegment;
  width: number;
}

interface Props {
  segments: TimelineSegment[];
  currentAppByDevice: Record<string, string>;
  isToday: boolean;
  mode: ActivityViewMode;
}

function formatDuration(minutes: number): string {
  const roundedMinutes = Math.max(0, Math.round(minutes));
  if (roundedMinutes < 1) return "<1分钟";
  if (roundedMinutes < 60) return `${roundedMinutes}分钟`;
  const hours = Math.floor(roundedMinutes / 60);
  const remainingMinutes = roundedMinutes % 60;
  return remainingMinutes > 0
    ? `${hours}小时${remainingMinutes}分钟`
    : `${hours}小时`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "--:--";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function minsSinceMidnight(iso: string): number {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return 0;
  return d.getHours() * 60 + d.getMinutes();
}

function segmentDurationMinutes(segment: TimelineSegment): number {
  return Number.isFinite(segment.duration_seconds)
    ? segment.duration_seconds! / 60
    : segment.duration_minutes;
}

function segmentEndMs(segment: TimelineSegment): number {
  const startedAt = new Date(segment.started_at).getTime();
  const endedAt = segment.ended_at
    ? new Date(segment.ended_at).getTime()
    : startedAt + segmentDurationMinutes(segment) * 60_000;
  return Number.isFinite(endedAt) ? endedAt : startedAt;
}

function mergeSegments(segments: TimelineSegment[]): TimelineSegment[] {
  if (segments.length === 0) return [];

  const merged: TimelineSegment[] = [];
  let current = segments[0]!;

  for (let i = 1; i < segments.length; i++) {
    const next = segments[i]!;
    const nextStartedAt = new Date(next.started_at).getTime();
    const gapMs = nextStartedAt - segmentEndMs(current);
    const isContinuous =
      Number.isFinite(gapMs) && gapMs >= 0 && gapMs <= MERGE_GAP_MS;

    if (next.app_name === current.app_name && isContinuous) {
      const durationSeconds =
        segmentDurationMinutes(current) * 60 +
        segmentDurationMinutes(next) * 60;
      current = {
        ...current,
        ended_at: next.ended_at,
        display_title: next.display_title || current.display_title,
        duration_minutes: durationSeconds / 60,
        duration_seconds: durationSeconds,
      };
      continue;
    }

    merged.push(current);
    current = next;
  }

  merged.push(current);
  return merged;
}

function buildLanes(
  segments: TimelineSegment[],
  currentApp: string | undefined,
): Lane[] {
  const laneMap = new Map<string, TimelineSegment[]>();
  for (const segment of mergeSegments(segments)) {
    const existing = laneMap.get(segment.app_name);
    if (existing) {
      existing.push(segment);
    } else {
      laneMap.set(segment.app_name, [segment]);
    }
  }

  return Array.from(laneMap.entries())
    .map(([appName, appSegments]) => {
      let aggregateOffset = 0;
      let totalMinutes = 0;
      const activities = appSegments.map((segment) => {
        const activity = { aggregateOffset, segment };
        const durationMinutes = segmentDurationMinutes(segment);
        aggregateOffset += durationMinutes;
        totalMinutes += durationMinutes;
        return activity;
      });
      return { appName, activities, totalMinutes };
    })
    .sort((a, b) => {
      if (a.appName === currentApp) return -1;
      if (b.appName === currentApp) return 1;
      return b.totalMinutes - a.totalMinutes ||
        a.appName.localeCompare(b.appName, "zh-CN");
    });
}

function getColor(appName: string, colorMap: Map<string, string>): string {
  const existing = colorMap.get(appName);
  if (existing) return existing;
  const color = PALETTE[colorMap.size % PALETTE.length]!;
  colorMap.set(appName, color);
  return color;
}

function currentMinute(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function NowIndicator({
  height,
  isToday,
}: {
  height: number;
  isToday: boolean;
}) {
  const [nowMinute, setNowMinute] = useState<number | null>(null);

  useEffect(() => {
    setNowMinute(currentMinute());
    const timer = window.setInterval(() => setNowMinute(currentMinute()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!isToday || nowMinute === null) return null;

  return (
    <div
      className="gantt-now"
      style={{
        left: `${(nowMinute / MINUTES_PER_DAY) * 100}%`,
        top: AXIS_HEIGHT,
        height: Math.max(0, height - AXIS_HEIGHT),
      }}
      aria-hidden="true"
    />
  );
}

function DeviceTimeline({
  currentApp,
  deviceName,
  isToday,
  mode,
  segments,
}: {
  currentApp: string | undefined;
  deviceName: string;
  isToday: boolean;
  mode: ActivityViewMode;
  segments: TimelineSegment[];
}) {
  const [hoveredBar, setHoveredBar] = useState<ActiveBar | null>(null);
  const [selectedBar, setSelectedBar] = useState<ActiveBar | null>(null);

  const colorMap = useMemo(() => new Map<string, string>(), []);
  const lanes = useMemo(
    () => buildLanes(segments, currentApp),
    [segments, currentApp],
  );
  const totalHeight = AXIS_HEIGHT + lanes.length * LANE_HEIGHT;
  const hourTicks = useMemo(
    () => Array.from({ length: 25 }, (_, hour) => hour * 60),
    [],
  );

  useEffect(() => {
    setHoveredBar(null);
    setSelectedBar(null);
  }, [segments]);

  const activeBar = hoveredBar ?? selectedBar;
  const tooltipLeft = activeBar
    ? Math.min(Math.max(activeBar.left + activeBar.width / 2, 6), 94)
    : 0;

  return (
    <section className="gantt-device">
      <div className="gantt-device-header">
        <p className="gantt-device-name">{deviceName}</p>
      </div>

      <div className="gantt-chart" style={{ height: totalHeight }}>
        <div className="gantt-labels">
          <div className="gantt-label-spacer" style={{ height: AXIS_HEIGHT }} />
          {lanes.map((lane) => {
            const isCurrent = lane.appName === currentApp;
            return (
              <div
                key={lane.appName}
                className="gantt-label"
                style={{ height: LANE_HEIGHT }}
              >
                {isCurrent && <span className="gantt-label-now">当前</span>}
                <span className="gantt-label-name" title={lane.appName}>
                  {lane.appName}
                </span>
                <span className="gantt-label-dur">
                  {formatDuration(lane.totalMinutes)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="gantt-scroll">
          <div
            className="gantt-timeline"
            style={{ height: totalHeight }}
          >
            <div className="gantt-axis" style={{ height: AXIS_HEIGHT }}>
              {Array.from({ length: 24 }, (_, hour) => (
                <span
                  key={hour}
                  className="gantt-axis-label"
                  style={{
                    left: `${(hour / 24) * 100}%`,
                    opacity: mode === "timeline" ? 1 : 0,
                  }}
                >
                  {String(hour).padStart(2, "0")}:00
                </span>
              ))}
              <span
                className="gantt-axis-mode-label"
                style={{ opacity: mode === "usage" ? 1 : 0 }}
              >
                累计使用
              </span>
            </div>

            {hourTicks.map((minute) => {
              const isMajor = minute % 60 === 0;
              return (
                <div
                  key={minute}
                  className="gantt-grid-line"
                  style={{
                    left: `${(minute / MINUTES_PER_DAY) * 100}%`,
                    top: AXIS_HEIGHT,
                    height: Math.max(0, totalHeight - AXIS_HEIGHT),
                    opacity: mode === "timeline"
                      ? isMajor ? 0.22 : 0.07
                      : 0,
                  }}
                />
              );
            })}

            {lanes.map((lane, laneIndex) => {
              const color = getColor(lane.appName, colorMap);
              const isCurrent = lane.appName === currentApp;
              const laneTop = AXIS_HEIGHT + laneIndex * LANE_HEIGHT;

              return (
                <div
                  key={lane.appName}
                  className="gantt-lane"
                  style={{
                    top: laneTop,
                    width: "100%",
                    height: LANE_HEIGHT,
                  }}
                >
                  <div
                    className="gantt-lane-bg"
                    style={{ backgroundColor: isCurrent ? `${color}0a` : undefined }}
                  />
                  <div
                    className="gantt-bar-layer"
                    style={{ opacity: isCurrent ? 0.85 : 0.52 }}
                  >
                    {lane.activities.map(
                      ({ aggregateOffset, segment }, segmentIndex) => {
                      const startMinute = minsSinceMidnight(segment.started_at);
                      const durationMinutes = segmentDurationMinutes(segment);
                      const rawWidth =
                        (durationMinutes / MINUTES_PER_DAY) * 100;
                      const width = mode === "usage"
                        ? rawWidth + 0.08
                        : rawWidth;
                      const positionMinute = mode === "timeline"
                        ? startMinute
                        : aggregateOffset;
                      const left = (positionMinute / MINUTES_PER_DAY) * 100;
                      const bar: ActiveBar = {
                        appName: lane.appName,
                        color,
                        laneIndex,
                        left,
                        segment,
                        width,
                      };
                      const isSelected =
                        selectedBar?.segment.started_at === segment.started_at &&
                        selectedBar.appName === lane.appName;
                      const label = `${lane.appName}，${formatTime(segment.started_at)}到${segment.ended_at ? formatTime(segment.ended_at) : "现在"}，${formatDuration(durationMinutes)}`;

                      return (
                        <button
                          key={`${segment.started_at}-${segmentIndex}`}
                          type="button"
                          className={`gantt-bar${isSelected ? " gantt-bar-selected" : ""}`}
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            backgroundColor: color,
                            boxShadow: isCurrent ? `0 0 0 1px ${color}` : undefined,
                          }}
                          aria-label={label}
                          onMouseEnter={() => setHoveredBar(bar)}
                          onMouseLeave={() => setHoveredBar(null)}
                          onFocus={() => setHoveredBar(bar)}
                          onBlur={() => setHoveredBar(null)}
                          onClick={() => {
                            setSelectedBar((current) =>
                              current?.segment.started_at === segment.started_at &&
                              current.appName === lane.appName
                                ? null
                                : bar,
                            );
                          }}
                        />
                      );
                      },
                    )}
                  </div>
                </div>
              );
            })}

            <NowIndicator
              height={totalHeight}
              isToday={isToday && mode === "timeline"}
            />

            {activeBar && (
              <div
                className="gantt-tooltip-card"
                style={{
                  left: `${tooltipLeft}%`,
                  top: AXIS_HEIGHT + activeBar.laneIndex * LANE_HEIGHT + 7,
                }}
                role="tooltip"
              >
                <strong>
                  {activeBar.appName}
                  {activeBar.segment.display_title
                    ? ` · ${activeBar.segment.display_title}`
                    : ""}
                </strong>
                <span>
                  {formatTime(activeBar.segment.started_at)} →{" "}
                  {activeBar.segment.ended_at
                    ? formatTime(activeBar.segment.ended_at)
                    : "现在"}
                  {" · "}
                  {formatDuration(segmentDurationMinutes(activeBar.segment))}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Timeline({
  segments,
  currentAppByDevice,
  isToday,
  mode,
}: Props) {
  const byDevice = useMemo(() => {
    const devices = new Map<string, { name: string; segments: TimelineSegment[] }>();
    for (const segment of segments) {
      const existing = devices.get(segment.device_id);
      if (existing) {
        existing.segments.push(segment);
      } else {
        devices.set(segment.device_id, {
          name: segment.device_name,
          segments: [segment],
        });
      }
    }
    return devices;
  }, [segments]);

  if (segments.length === 0) {
    return (
      <div className="text-center py-16" style={{ color: "var(--ink-muted)" }}>
        <p className="text-2xl opacity-40 mb-3">( ^-ω-^ )</p>
        <p className="text-sm">今天还没有活动记录</p>
      </div>
    );
  }

  return (
    <div className="gantt">
      {Array.from(byDevice.entries()).map(([deviceId, device]) => (
        <DeviceTimeline
          key={deviceId}
          currentApp={currentAppByDevice[deviceId]}
          deviceName={device.name}
          isToday={isToday}
          mode={mode}
          segments={device.segments}
        />
      ))}
    </div>
  );
}
