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

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = echarts.init(containerRef.current, null, { renderer: "canvas" });

    const option: echarts.EChartsOption = {
      grid: {
        left: 80,
        right: 20,
        top: 30,
        bottom: 30,
      },
      xAxis: {
        type: "value",
        min: 0,
        max: 1440,
        axisLabel: {
          formatter: (v: number) => {
            const h = Math.floor(v / 60);
            const m = Math.floor(v % 60);
            return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          },
          fontSize: 10,
          color: "#8B7E74",
        },
        axisLine: { lineStyle: { color: "#E8D5C4" } },
        splitLine: {
          show: true,
          lineStyle: { color: "#E8D5C4", type: "dashed", opacity: 0.3 },
        },
      },
      yAxis: {
        type: "category",
        data: appNames,
        axisLabel: {
          fontSize: 11,
          color: "#8B7E74",
          fontWeight: 500,
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      dataZoom: [
        {
          type: "slider",
          xAxisIndex: 0,
          filterMode: "none",
          start: 0,
          end: 100,
          top: 0,
          height: 20,
          borderColor: "#E8D5C4",
          backgroundColor: "transparent",
          fillerColor: "rgba(232, 160, 191, 0.2)",
          handleStyle: { color: "#E8A0BF" },
          textStyle: { fontSize: 9, color: "#8B7E74" },
          labelFormatter: (v: number) => {
            const h = Math.floor(v / 60);
            const m = Math.floor(v % 60);
            return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          },
        },
        {
          type: "inside",
          xAxisIndex: 0,
          filterMode: "none",
        },
      ],
      tooltip: {
        trigger: "item",
        formatter: (params: any) => {
          if (!params.data) return "";
          const [, dur, , app, title, endedAt] = params.data;
          const startMin = params.data[0];
          const endMin = startMin + dur;
          const startStr = `${String(Math.floor(startMin / 60)).padStart(2, "0")}:${String(Math.floor(startMin % 60)).padStart(2, "0")}`;
          const endStr = endedAt
            ? `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(Math.floor(endMin % 60)).padStart(2, "0")}`
            : "现在";
          return `<div style="font-size:12px">
            <strong>${app}</strong>${title ? ` · ${title}` : ""}<br/>
            ${startStr} → ${endStr}<br/>
            ${formatDuration(dur)}
          </div>`;
        },
        backgroundColor: "rgba(255,253,247,0.95)",
        borderColor: "#E8D5C4",
        borderWidth: 1,
        textStyle: { fontSize: 12, color: "#2D2B2B" },
      },
      series: [
        {
          type: "custom",
          renderItem: (params: any, api: any) => {
            const startMin = api.value(0);
            const dur = api.value(1);
            const appIdx = api.value(2);
            const app = api.value(3);
            const isCur = app === currentApp;

            const yCenter = api.coord([0, appIdx])[1];
            const barHeight = api.size([0, 1])[1] * 0.7;
            const x1 = api.coord([startMin, appIdx])[0];
            const x2 = api.coord([startMin + dur, appIdx])[0];
            if (!Number.isFinite(x1) || !Number.isFinite(x2)) return;
            const width = Math.max(x2 - x1, 1);
            const color = colorMap.get(app) || PALETTE[0]!;

            return {
              type: "rect",
              shape: { x: x1, y: yCenter - barHeight / 2, width, height: barHeight },
              style: {
                fill: color,
                opacity: isCur ? 0.85 : 0.5,
                shadowBlur: isCur ? 4 : 0,
                shadowColor: isCur ? `${color}60` : "transparent",
              },
            };
          },
          data: barData,
          encode: { x: [0, 1], y: 2 },
        },
        // "Now" indicator line
        {
          type: "line",
          data: [
            [nowMin, -0.5],
            [nowMin, appNames.length - 0.5],
          ],
          xAxisIndex: 0,
          yAxisIndex: 0,
          symbol: "none",
          lineStyle: {
            color: "#E8A0BF",
            width: 2,
            opacity: 0.6,
            shadowBlur: 4,
            shadowColor: "rgba(232,160,191,0.4)",
          },
          z: 10,
          silent: true,
        },
      ],
    };

    chart.setOption(option);

    const resizeHandler = () => chart.resize();
    window.addEventListener("resize", resizeHandler);

    return () => {
      window.removeEventListener("resize", resizeHandler);
      chart.dispose();
    };
  }, [barData, appNames]);

  return (
    <div className="gantt-device">
      <p className="gantt-device-name">{deviceName}</p>
      <div
        ref={containerRef}
        style={{ width: "100%", height: Math.max(180, 40 + appNames.length * 40) }}
      />
    </div>
  );
}
