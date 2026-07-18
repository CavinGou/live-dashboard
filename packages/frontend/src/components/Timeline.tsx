import { useRef, useEffect } from "react";
import * as echarts from "echarts";
import type { TimelineSegment } from "@/lib/api";

const PALETTE = [
  "#d4788a", "#7aab8a", "#c4a060", "#8a8ec0", "#6ab8b8",
  "#b88870", "#789a78", "#b0906a", "#a080a0", "#7ab0a0",
];

function formatDuration(minutes: number): string {
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function minsSinceMidnight(isoStr: string): number {
  const d = new Date(isoStr);
  return d.getHours() * 60 + d.getMinutes();
}

/** Merge consecutive segments with same app_name */
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

interface Props {
  segments: TimelineSegment[];
  summary: Record<string, Record<string, number>>;
  currentAppByDevice: Record<string, string>;
}

export default function Timeline({ segments, currentAppByDevice }: Props) {
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

        // Build lanes (apps sorted by duration, current first)
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

        const appNames = lanes.map(([app]) => app);
        const colorMap = new Map<string, string>();
        let ci = 0;
        for (const [app] of lanes) {
          if (!colorMap.has(app)) {
            colorMap.set(app, PALETTE[ci % PALETTE.length]!);
            ci++;
          }
        }

        // Build ECharts data: [startMin, duration, appIndex, appName, displayTitle, endedAt]
        const barData: any[][] = [];
        for (let li = 0; li < lanes.length; li++) {
          const [app, appSegs] = lanes[li]!;
          for (const seg of appSegs) {
            const startMin = minsSinceMidnight(seg.started_at);
            const durMin = Math.max(seg.duration_minutes, 0.1);
            barData.push([startMin, durMin, li, app, seg.display_title || "", seg.ended_at || ""]);
          }
        }

        return (
          <DeviceChart
            key={deviceId}
            deviceName={name}
            appNames={appNames}
            colorMap={colorMap}
            barData={barData}
            nowMin={nowMin}
            currentApp={currentApp}
          />
        );
      })}
    </div>
  );
}

function DeviceChart({
  deviceName, appNames, colorMap, barData, nowMin, currentApp,
}: {
  deviceName: string;
  appNames: string[];
  colorMap: Map<string, string>;
  barData: any[][];
  nowMin: number;
  currentApp: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const barShapesRef = useRef<any[]>([]);
  const nowMinRef = useRef(nowMin);
  nowMinRef.current = nowMin;

  // Init chart once
  useEffect(() => {
    if (!containerRef.current || chartRef.current) return;
    const chart = echarts.init(containerRef.current, null, { renderer: "canvas" });
    chartRef.current = chart;

    chart.setOption({
      grid: { left: 80, right: 20, top: 30, bottom: 30 },
      xAxis: {
        type: "value", min: 0, max: 1440,
        axisLabel: {
          formatter: (v: number) => {
            const h = Math.floor(v / 60);
            const m = Math.floor(v % 60);
            return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          },
          fontSize: 10, color: "#8B7E74",
        },
        axisLine: { lineStyle: { color: "#E8D5C4" } },
        splitLine: { show: true, lineStyle: { color: "#E8D5C4", type: "dashed", opacity: 0.3 } },
      },
      yAxis: {
        type: "category",
        axisLabel: { fontSize: 11, color: "#8B7E74", fontWeight: 500 },
        axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
      },
      dataZoom: [
        { type: "slider", xAxisIndex: 0, filterMode: "none", start: 0, end: 100, top: 0, height: 20,
          borderColor: "#E8D5C4", backgroundColor: "transparent",
          fillerColor: "rgba(232, 160, 191, 0.2)", handleStyle: { color: "#E8A0BF" },
          textStyle: { fontSize: 9, color: "#8B7E74" },
          labelFormatter: (v: number) => {
            const h = Math.floor(v / 60);
            const m = Math.floor(v % 60);
            return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          },
        },
        { type: "inside", xAxisIndex: 0, filterMode: "none" },
      ],
      tooltip: { trigger: "none" },
      series: [{
        type: "custom",
        renderItem: (_: any, api: any) => {
          const barData = barShapesRef.current;
          const children: any[] = [];
          for (const bar of barData) {
            const p1 = api.coord([bar.startMin, bar.appIdx]);
            const p2 = api.coord([bar.startMin + bar.dur, bar.appIdx]);
            if (!p1 || !p2) continue;
            const x1 = p1[0], x2 = p2[0];
            const yCenter = p1[1];
            const w = Math.max(x2 - x1, 1);
            if (w < 1 || x1 + w < 0) continue;
            const laneH = (api.size?.([0, 1])?.[1] ?? 20) * 0.7;
            children.push({
              type: "rect",
              shape: { x: x1, y: yCenter - laneH / 2, width: w, height: laneH },
              style: { fill: bar.color, opacity: bar.isCur ? 0.85 : 0.5 },
            });
          }
          // Now indicator line
          const nm = nowMinRef.current;
          const nowP = api.coord([nm, 0]);
          if (nowP) {
            const cy = api.coord([0, -0.5]);
            const cy2 = api.coord([0, barData.length ? Math.max(...barData.map((b: any) => b.appIdx)) + 0.5 : 0]);
            if (cy && cy2) {
              children.push({
                type: "line",
                shape: { x1: nowP[0], y1: cy[1], x2: nowP[0], y2: cy2[1] },
                style: { stroke: "#E8A0BF", lineWidth: 2, opacity: 0.6 },
                z: 10,
              });
            }
          }
          return { type: "group", children, clipOverflow: true };
        },
        data: [],
      }],
    });

    // Tooltip via mousemove on graphic elements
    const ttEl = document.createElement("div");
    ttEl.className = "gantt-tooltip";
    Object.assign(ttEl.style, {
      position: "fixed", display: "none", padding: "6px 10px",
      fontSize: "12px", background: "rgba(255,253,247,0.95)",
      border: "1px solid #E8D5C4", borderRadius: "6px",
      pointerEvents: "none", zIndex: "1000",
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    });
    containerRef.current.appendChild(ttEl);

    chart.on("mousemove", (params: any) => {
      const pixelX = params.event?.offsetX;
      const pixelY = params.event?.offsetY;
      if (pixelX == null || pixelY == null) { ttEl.style.display = "none"; return; }
      const point = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [pixelX, pixelY]);
      if (!Array.isArray(point)) { ttEl.style.display = "none"; return; }
      const dataMin = point[0] as number;
      const dataAppIdx = Math.round(point[1] as number);
      // Find bar at this position
      const bars = barShapesRef.current;
      let hit = null;
      for (const b of bars) {
        if (b.appIdx === dataAppIdx && dataMin >= b.startMin && dataMin <= b.startMin + b.dur) {
          hit = b; break;
        }
      }
      if (hit) {
        const endStr = (hit.startMin + hit.dur >= 1440) ? "现在" :
          `${String(Math.floor((hit.startMin + hit.dur) / 60)).padStart(2, "0")}:${String(Math.floor((hit.startMin + hit.dur) % 60)).padStart(2, "0")}`;
        ttEl.innerHTML = `<strong>${hit.app}</strong><br/>
          ${String(Math.floor(hit.startMin / 60)).padStart(2, "0")}:${String(Math.floor(hit.startMin % 60)).padStart(2, "0")} → ${endStr}<br/>
          ${formatDuration(hit.dur)}`;
        ttEl.style.display = "block";
        // Position near mouse but avoid overflow
        const mx = Math.min(pixelX + 15, (containerRef.current?.clientWidth || 600) - 200);
        const my = Math.min(pixelY + 15, (containerRef.current?.clientHeight || 400) - 60);
        ttEl.style.left = `${mx}px`;
        ttEl.style.top = `${my}px`;
      } else {
        ttEl.style.display = "none";
      }
    });
    chart.on("mouseout", () => { ttEl.style.display = "none"; });

    const resizeHandler = () => chart.resize();
    window.addEventListener("resize", resizeHandler);

    return () => {
      window.removeEventListener("resize", resizeHandler);
      ttEl.remove();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // Update bar data when data changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Update yAxis categories
    chart.setOption({ yAxis: { data: appNames } });

    // Update bar shapes ref (used by renderItem closure)
    barShapesRef.current = barData.map((d: any[]) => {
      const startMin = d[0];
      const dur = d[1];
      const appIdx = d[2];
      const app = d[3];
      const isCur = app === currentApp;
      const color = colorMap.get(app) || PALETTE[0]!;
      return { startMin, dur, appIdx, app, isCur, color };
    });

    // Force custom series to re-render by triggering a silent data update
    chart.setOption({ series: [{ data: [] }] });
  }, [barData, appNames]);

  return (
    <div className="gantt-device">
      <p className="gantt-device-name">{deviceName}</p>
      <div
        ref={containerRef}
        style={{ width: "100%", height: Math.max(250, 60 + appNames.length * 50) }}
      />
    </div>
  );
}
