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

const LANE_H = 26;
const LABEL_W = 85;
const AXIS_H = 18;
const HOURS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];

interface Props {
  segments: TimelineSegment[];
  summary: Record<string, Record<string, number>>;
  currentAppByDevice: Record<string, string>;
}

export default function Timeline({ segments, currentAppByDevice }: Props) {
  const colorMap = new Map<string, string>();

  const dayStartMs = segments.length > 0
    ? (() => { const d = new Date(segments[0]!.started_at); d.setHours(0, 0, 0, 0); return d.getTime(); })()
    : 0;
  const dayRangeMs = 24 * 60 * 60 * 1000;

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

  const nowMs = Date.now();

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
            <p className="gantt-device-name">{name}</p>

            <div className="gantt-chart" style={{ height: totalH }}>
              {/* Time axis */}
              <div className="gantt-axis" style={{ left: LABEL_W }}>
                {HOURS.map((h) => (
                  <span key={h} className="gantt-axis-label" style={{ left: `${(h / 24) * 100}%` }}>
                    {String(h).padStart(2, "0")}
                  </span>
                ))}
              </div>

              {/* Grid lines */}
              {Array.from({ length: 25 }, (_, h) => (
                <div key={h} className="gantt-gridline" style={{
                  left: `${(h / 24) * 100}%`,
                  opacity: h % 2 === 0 ? 0.3 : 0.08,
                }} />
              ))}

              {/* Now indicator */}
              <div className="gantt-now" style={{
                left: `${Math.min(Math.max(((nowMs - dayStartMs) / dayRangeMs) * 100, 0), 100)}%`,
              }} />

              {/* Labels column */}
              <div className="gantt-labels" style={{ width: LABEL_W }}>
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

              {/* Bars area */}
              <div className="gantt-bars" style={{ left: LABEL_W }}>
                {lanes.map(([app, appSegs], li) => {
                  const color = getColor(app, colorMap);
                  const isCur = app === currentApp;

                  return (
                    <div key={app} className="gantt-lane" style={{ top: li * LANE_H, height: LANE_H }}>
                      {appSegs.map((seg, i) => {
                        const ms = new Date(seg.started_at).getTime();
                        if (isNaN(ms)) return null;
                        const l = ((ms - dayStartMs) / dayRangeMs) * 100;
                        const w = Math.max((seg.duration_minutes * 60000 / dayRangeMs) * 100, 0.2);
                        if (w <= 0 || l >= 100) return null;

                        return (
                          <div
                            key={i}
                            className="gantt-bar"
                            style={{
                              left: `${Math.max(l, 0)}%`,
                              width: `${Math.min(w, 100 - Math.max(l, 0))}%`,
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
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
