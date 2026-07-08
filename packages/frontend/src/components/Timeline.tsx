import { useRef, useEffect, useState, useCallback } from "react";
import type { TimelineSegment } from "@/lib/api";

const PALETTE = [
  "#d4788a", "#7aab8a", "#c4a060", "#8a8ec0", "#6ab8b8",
  "#b88870", "#789a78", "#b0906a", "#a080a0", "#7ab0a0",
];

function getColor(appName: string, colorMap: Map<string, string>): string {
  const existing = colorMap.get(appName);
  if (existing) return existing;
  const color = PALETTE[colorMap.size % PALETTE.length]!;
  colorMap.set(appName, color);
  return color;
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function formatTime(isoStr: string): string {
  return isoStr.slice(11, 16);
}

/** Merge consecutive segments with the same app_name */
function mergeSegments(segs: TimelineSegment[]): TimelineSegment[] {
  if (segs.length === 0) return [];
  const merged: TimelineSegment[] = [];
  let cur = segs[0]!;
  for (let i = 1; i < segs.length; i++) {
    const next = segs[i]!;
    if (next.app_name === cur.app_name) {
      cur = { ...cur, ended_at: next.ended_at, duration_minutes: cur.duration_minutes + next.duration_minutes };
    } else {
      merged.push(cur);
      cur = next;
    }
  }
  merged.push(cur);
  return merged;
}

/** Minutes since 00:00 */
function minsSinceMidnight(isoStr: string): number {
  const d = new Date(isoStr);
  return d.getHours() * 60 + d.getMinutes();
}

/** Generate tick marks at adaptive intervals based on zoom */
function genTicks(pxPerMin: number): { min: number; major: boolean }[] {
  const ticks: { min: number; major: boolean }[] = [];
  // Decide tick interval: aim for ~1 tick per 60px
  const rawInterval = Math.max(1, Math.round(60 / pxPerMin));
  // Snap to nice intervals: 1, 2, 5, 10, 15, 30, 60
  const nice = [1, 2, 5, 10, 15, 30, 60];
  let interval = nice.find((n) => n >= rawInterval) ?? 60;
  if (pxPerMin >= 48) interval = 5;  // very zoomed → 5min
  else if (pxPerMin >= 24) interval = 10; // zoomed → 10min
  else if (pxPerMin >= 12) interval = 15; // default → 15min
  else if (pxPerMin >= 6) interval = 30;  // zoomed out → 30min
  
  for (let min = 0; min < 1440; min += interval) {
    const major = min % 60 === 0;
    ticks.push({ min, major });
  }
  return ticks;
}

const LANE_H = 52;
const LABEL_W = 90;
const AXIS_H = 24;
const ZOOM_LEVELS = [4, 6, 8, 12, 16, 24, 32, 48, 64];
const DEFAULT_ZOOM_INDEX = 4; // 16px/min ≈ 1.5h visible

interface Props {
  segments: TimelineSegment[];
  summary: Record<string, Record<string, number>>;
  currentAppByDevice: Record<string, string>;
}

export default function Timeline({ segments, currentAppByDevice }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const colorMap = new Map<string, string>();
  const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM_INDEX);
  const pxPerMin = ZOOM_LEVELS[zoomIdx]!;
  const totalWidth = 1440 * pxPerMin;

  // Preserve scroll center when zooming
  const scrollCenterRef = useRef<number | null>(null);

  const handleZoomIn = useCallback(() => {
    setZoomIdx((i) => {
      const next = Math.min(i + 1, ZOOM_LEVELS.length - 1);
      if (next !== i && scrollRef.current) {
        scrollCenterRef.current = scrollRef.current.scrollLeft + scrollRef.current.clientWidth / 2;
      }
      return next;
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomIdx((i) => {
      const next = Math.max(i - 1, 0);
      if (next !== i && scrollRef.current) {
        scrollCenterRef.current = scrollRef.current.scrollLeft + scrollRef.current.clientWidth / 2;
      }
      return next;
    });
  }, []);

  // Auto-scroll to "now" on mount or zoom change
  useEffect(() => {
    if (!scrollRef.current || segments.length === 0) return;
    const el = scrollRef.current;
    if (scrollCenterRef.current !== null) {
      // Preserve center position after zoom
      const center = scrollCenterRef.current;
      scrollCenterRef.current = null;
      el.scrollLeft = Math.max(0, Math.min(center - el.clientWidth / 2, totalWidth - el.clientWidth));
    } else {
      // Center on "now"
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const scrollTo = nowMin * pxPerMin - el.clientWidth / 2;
      el.scrollLeft = Math.max(0, Math.min(scrollTo, totalWidth - el.clientWidth));
    }
  }, [segments, pxPerMin, totalWidth]);

  if (segments.length === 0) {
    return (
      <div className="text-center py-16" style={{ color: "var(--ink-muted)" }}>
        <p className="text-2xl opacity-40 mb-3">( ^-ω-^ )</p>
        <p className="text-sm">今天还没有活动记录</p>
      </div>
    );
  }

  // Group by device
  const byDevice = new Map<string, { name: string; segs: TimelineSegment[] }>();
  for (const seg of segments) {
    let entry = byDevice.get(seg.device_id);
    if (!entry) { entry = { name: seg.device_name, segs: [] }; byDevice.set(seg.device_id, entry); }
    entry.segs.push(seg);
  }

  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  return (
    <div className="gantt">
      {Array.from(byDevice.entries()).map(([deviceId, { name, segs }]) => {
        const currentApp = currentAppByDevice[deviceId];
        const merged = mergeSegments(segs);

        // Group by app → lanes
        const laneMap = new Map<string, TimelineSegment[]>();
        for (const s of merged) {
          let list = laneMap.get(s.app_name);
          if (!list) { list = []; laneMap.set(s.app_name, list); }
          list.push(s);
        }
        const lanes = Array.from(laneMap.entries()).sort((a, b) => {
          if (a[0] === currentApp) return -1;
          if (b[0] === currentApp) return 1;
          const da = a[1].reduce((s, x) => s + x.duration_minutes, 0);
          const db = b[1].reduce((s, x) => s + x.duration_minutes, 0);
          return db - da;
        });

        const totalH = AXIS_H + lanes.length * LANE_H;

        return (
          <div key={deviceId} className="gantt-device">
            <div className="gantt-device-header">
              <p className="gantt-device-name">{name}</p>
              <div className="gantt-zoom">
                <span className="gantt-zoom-label">
                  {ZOOM_LEVELS[zoomIdx]!}px/min
                </span>
                <button
                  type="button"
                  className="gantt-zoom-btn"
                  onClick={handleZoomOut}
                  disabled={zoomIdx === 0}
                  aria-label="缩小"
                >−</button>
                <button
                  type="button"
                  className="gantt-zoom-btn"
                  onClick={handleZoomIn}
                  disabled={zoomIdx === ZOOM_LEVELS.length - 1}
                  aria-label="放大"
                >+</button>
              </div>
            </div>

            <div className="gantt-chart" style={{ height: totalH }}>
              {/* Labels column (fixed left) */}
              <div className="gantt-labels" style={{ width: LABEL_W }}>
                {/* Spacer for axis row */}
                <div style={{ height: AXIS_H }} />
                {lanes.map(([app, appSegs]) => {
                  const isCur = app === currentApp;
                  const total = appSegs.reduce((s, x) => s + x.duration_minutes, 0);
                  return (
                    <div key={app} className="gantt-label" style={{ height: LANE_H }}>
                      {isCur && <span className="gantt-label-now">◆</span>}
                      <span className="gantt-label-name">{app}</span>
                      <span className="gantt-label-dur">{formatDuration(total)}</span>
                    </div>
                  );
                })}
              </div>

              {/* Scrollable timeline area */}
              <div className="gantt-scroll" ref={scrollRef}>
                <div className="gantt-timeline" style={{ width: totalWidth, height: totalH }}>
                  {/* Time axis */}
                  <div className="gantt-axis" style={{ height: AXIS_H }}>
                    {/* Hour markers */}
                    {Array.from({ length: 24 }, (_, h) => (
                      <span
                        key={h}
                        className="gantt-axis-label"
                        style={{ left: h * 60 * pxPerMin }}
                      >
                        {String(h).padStart(2, "0")}:00
                      </span>
                    ))}
                    {/* 15-min tick lines */}
                    {genTicks(pxPerMin).map(({ min, major }) => (
                      <div
                        key={min}
                        className="gantt-tick"
                        style={{
                          left: min * pxPerMin,
                          height: major ? "100%" : "35%",
                          top: major ? 0 : "65%",
                          opacity: major ? 0.3 : 0.08,
                        }}
                      />
                    ))}
                  </div>

                  {/* Lanes */}
                  {lanes.map(([app, appSegs], li) => {
                    const color = getColor(app, colorMap);
                    const isCur = app === currentApp;
                    const top = AXIS_H + li * LANE_H;

                    return (
                      <div key={app} className="gantt-lane" style={{ top, height: LANE_H, width: totalWidth }}>
                        {/* Lane bg stripes */}
                        <div
                          className="gantt-lane-bg"
                          style={{ backgroundColor: isCur ? `${color}0a` : "transparent" }}
                        />

                        {/* Activity bars */}
                        {appSegs.map((seg, i) => {
                          const startMin = minsSinceMidnight(seg.started_at);
                          const leftPx = startMin * pxPerMin;
                          const widthPx = Math.max(seg.duration_minutes * pxPerMin, 2);
                          if (widthPx <= 0 || leftPx >= totalWidth) return null;

                          return (
                            <div
                              key={i}
                              className="gantt-bar"
                              style={{
                                left: leftPx,
                                width: widthPx,
                                backgroundColor: color,
                                opacity: isCur ? 0.85 : 0.5,
                                boxShadow: isCur ? `0 0 0 1px ${color}` : "none",
                              }}
                              title={`${app}${seg.display_title ? ` · ${seg.display_title}` : ""}
${formatTime(seg.started_at)} → ${seg.ended_at ? formatTime(seg.ended_at) : "现在"}
${formatDuration(seg.duration_minutes)}`}
                            />
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* Now indicator */}
                  <div
                    className="gantt-now"
                    style={{ left: nowMin * pxPerMin, top: AXIS_H, height: `calc(100% - ${AXIS_H}px)` }}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
