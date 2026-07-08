import type { TimelineSegment } from "@/lib/api";

// Warm color palette
const APP_COLORS = [
  "#E8A0BF", "#88C9C9", "#E8B86D", "#C4A882", "#D4917B",
  "#A8C686", "#D4A0A0", "#8CB8B0", "#C9B97A", "#B89EC4",
];

function getAppColor(appName: string, colorMap: Map<string, string>): string {
  const existing = colorMap.get(appName);
  if (existing) return existing;
  const color = APP_COLORS[colorMap.size % APP_COLORS.length]!;
  colorMap.set(appName, color);
  return color;
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
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
      cur = {
        ...cur,
        ended_at: next.ended_at,
        duration_minutes: cur.duration_minutes + next.duration_minutes,
      };
    } else {
      merged.push(cur);
      cur = next;
    }
  }
  merged.push(cur);
  return merged;
}

interface Props {
  segments: TimelineSegment[];
  summary: Record<string, Record<string, number>>;
  currentAppByDevice: Record<string, string>;
}

const LANE_HEIGHT = 16;
const LABEL_WIDTH = 80;
const MAJOR_HOURS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

export default function Timeline({ segments, currentAppByDevice }: Props) {
  const colorMap = new Map<string, string>();

  // Compute day boundary (00:00 ~ 24:00)
  const dayStartMs = (() => {
    if (segments.length === 0) return 0;
    const t = new Date(segments[0]!.started_at);
    t.setHours(0, 0, 0, 0);
    return t.getTime();
  })();
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
  const dayRangeMs = dayEndMs - dayStartMs;

  if (segments.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--color-text-muted)]">
        <p className="text-2xl mb-2">(^-ω-^=)</p>
        <p className="text-sm">今天还没有活动记录呢~</p>
      </div>
    );
  }

  // Group by device
  const byDevice = new Map<string, { name: string; segs: TimelineSegment[] }>();
  for (const seg of segments) {
    let entry = byDevice.get(seg.device_id);
    if (!entry) {
      entry = { name: seg.device_name, segs: [] };
      byDevice.set(seg.device_id, entry);
    }
    entry.segs.push(seg);
  }

  const nowMs = Date.now();

  return (
    <div className="space-y-8">
      {Array.from(byDevice.entries()).map(([deviceId, { name, segs }]) => {
        const currentApp = currentAppByDevice[deviceId];
        const merged = mergeSegments(segs);

        // Group merged segments by app_name to create lanes
        const lanes = new Map<string, TimelineSegment[]>();
        for (const seg of merged) {
          let list = lanes.get(seg.app_name);
          if (!list) {
            list = [];
            lanes.set(seg.app_name, list);
          }
          list.push(seg);
        }

        const laneEntries = Array.from(lanes.entries());
        // Sort lanes: current app first, then by total duration desc
        laneEntries.sort((a, b) => {
          if (a[0] === currentApp) return -1;
          if (b[0] === currentApp) return 1;
          const durA = a[1].reduce((s, seg) => s + seg.duration_minutes, 0);
          const durB = b[1].reduce((s, seg) => s + seg.duration_minutes, 0);
          return durB - durA;
        });

        const trackHeight = laneEntries.length * LANE_HEIGHT;

        return (
          <div key={deviceId}>
            <h3 className="text-xs font-semibold mb-2 text-[var(--color-text-muted)] uppercase tracking-wider">
              {name}
            </h3>

            {/* Time axis */}
            <div className="relative select-none h-4 mb-0.5" style={{ marginLeft: LABEL_WIDTH }}>
              {MAJOR_HOURS.map((h) => (
                <span
                  key={h}
                  className="absolute text-[9px] text-[var(--color-text-muted)]"
                  style={{ left: `${(h / 24) * 100}%`, transform: "translateX(-50%)" }}
                >
                  {String(h).padStart(2, "0")}
                </span>
              ))}
            </div>

            {/* Multi-track Gantt */}
            <div
              className="relative bg-[var(--color-card)] rounded-lg overflow-hidden border border-[var(--color-border)] flex"
              style={{ height: trackHeight + 2 }}
            >
              {/* Left label column */}
              <div className="flex-shrink-0 relative z-20" style={{ width: LABEL_WIDTH }}>
                {laneEntries.map(([app, appSegs], laneIdx) => {
                  const isCurrent = app === currentApp;
                  const totalMin = appSegs.reduce((s, seg) => s + seg.duration_minutes, 0);
                  return (
                    <div
                      key={app}
                      className="flex items-center px-1.5 text-[9px] font-medium text-[var(--color-text-muted)] select-none truncate"
                      style={{ height: LANE_HEIGHT }}
                    >
                      {isCurrent && <span className="text-[var(--color-primary)] mr-0.5">▸</span>}
                      <span className="truncate">{app}</span>
                      <span className="font-mono ml-0.5 flex-shrink-0">{formatDuration(totalMin)}</span>
                    </div>
                  );
                })}
              </div>

              {/* Chart area */}
              <div className="relative flex-1 min-w-0">
                {/* Hour grid lines */}
                {Array.from({ length: 25 }, (_, h) => (
                  <div
                    key={h}
                    className="absolute top-0 bottom-0 border-l border-[var(--color-border)] pointer-events-none"
                    style={{ left: `${(h / 24) * 100}%`, opacity: h % 3 === 0 ? 0.4 : 0.12 }}
                  />
                ))}

                {/* Now indicator line */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-[var(--color-primary)] z-10 pointer-events-none"
                  style={{
                    left: `${Math.min(Math.max(((nowMs - dayStartMs) / dayRangeMs) * 100, 0), 100)}%`,
                    opacity: 0.7,
                    boxShadow: "0 0 4px var(--color-primary)",
                  }}
                />

                {/* Lanes */}
                {laneEntries.map(([app, appSegs], laneIdx) => {
                  const color = getAppColor(app, colorMap);
                  const isCurrent = app === currentApp;
                  const top = laneIdx * LANE_HEIGHT;

                  return (
                    <div key={app} className="absolute left-0 right-0" style={{ top, height: LANE_HEIGHT }}>
                      {/* Lane background */}
                      <div
                        className="absolute inset-0"
                        style={{ backgroundColor: isCurrent ? `${color}0d` : "transparent" }}
                      />

                      {/* Activity bars */}
                      {appSegs.map((seg, i) => {
                        const segMs = new Date(seg.started_at).getTime();
                        if (isNaN(segMs)) return null;
                        const leftPct = Math.max(((segMs - dayStartMs) / dayRangeMs) * 100, 0);
                        const widthPct = Math.min(
                          Math.max((seg.duration_minutes * 60000 / dayRangeMs) * 100, 0.15),
                          100 - leftPct
                        );
                        if (widthPct <= 0) return null;

                        return (
                          <div
                            key={i}
                            className="absolute rounded-sm cursor-pointer transition-all hover:opacity-90 hover:brightness-110"
                            style={{
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                              top: "2px",
                              bottom: "2px",
                              backgroundColor: color,
                              opacity: isCurrent ? 0.85 : 0.55,
                              boxShadow: isCurrent
                                ? `0 0 0 1px ${color}, 0 0 6px ${color}60`
                                : "none",
                              zIndex: isCurrent ? 2 : 1,
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
