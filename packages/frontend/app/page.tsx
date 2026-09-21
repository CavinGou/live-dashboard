"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useDashboard } from "@/hooks/useDashboard";
import { fetchConfig, type SiteConfig } from "@/lib/api";
import { getAppDescription } from "@/lib/app-descriptions";
import Timeline, { type ActivityViewMode } from "@/components/Timeline";

/* ═══ Helpers ═══ */
function fmtDur(m: number): string {
  if (!Number.isFinite(m) || m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${r}m` : `${h}h`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function offsetDate(s: string, n: number) {
  const d = new Date(s + "T00:00:00");
  if (isNaN(d.getTime())) return s;
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(s: string) {
  const parts = s.split("-");
  if (parts.length !== 3) return s;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return s;
  const date = new Date(y, m - 1, d);
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${m}月${d}日 ${weekdays[date.getDay()]}`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 9) return "早上好";
  if (h >= 9 && h < 12) return "上午好";
  if (h >= 12 && h < 14) return "中午好";
  if (h >= 14 && h < 18) return "下午好";
  if (h >= 18 && h < 22) return "晚上好";
  return "夜深了";
}

function fmtTime(t?: string) {
  if (!t) return "--:--";
  const d = new Date(t);
  return isNaN(d.getTime()) ? "--:--" : d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

/* ═══ Decorative Blossom ═══ */
function BlossomSVG({ className }: { className?: string }) {
  return (
    <svg className={className || "blossom-deco"} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      {[0, 72, 144, 216, 288].map((r) => (
        <ellipse key={r} cx="100" cy="100" rx="28" ry="48" fill="currentColor" transform={`rotate(${r} 100 100) translate(0 -30)`} opacity="0.7" />
      ))}
      <circle cx="100" cy="100" r="12" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

function MusicCover({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed) return null;

  return (
    <img
      className="music-cover"
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

/* ═══════════════════════════════════════
   Main Page — 花信 v5
   ═══════════════════════════════════════ */
export default function Home() {
  const { current, timeline, selectedDate, changeDate, loading, error, viewerCount } = useDashboard();
  const [activeDevFilter, setActiveDevFilter] = useState<string | null>(null);
  const [activityView, setActivityView] = useState<ActivityViewMode>("timeline");
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Default to first online device on initial load
  useEffect(() => {
    if (activeDevFilter === null && current?.devices) {
      const devices = current.devices;
      const online = devices.filter((d) => d.is_online === 1);
      if (online.length > 0) {
        setActiveDevFilter(online[0]!.device_id);
      } else if (devices.length > 0) {
        setActiveDevFilter(devices[0]!.device_id);
      }
    }
  }, [current?.devices, activeDevFilter]);
  const data = current;
  const tlData = timeline;

  // All online devices
  const onlineDevices = useMemo(() =>
    (data?.devices ?? []).filter((d) => d.is_online === 1),
  [data?.devices]);

  // Primary active device (most recently seen)
  const active = useMemo(() => {
    if (!onlineDevices.length) return undefined;
    let best = onlineDevices[0];
    for (const d of onlineDevices) {
      const t = d.last_seen_at ? new Date(d.last_seen_at).getTime() : 0;
      const bt = best.last_seen_at ? new Date(best.last_seen_at).getTime() : 0;
      if (t > bt) best = d;
    }
    return best;
  }, [onlineDevices]);

  const isOnline = !!active;
  const music = active?.extra?.music;

  const allOffline = useMemo(() => {
    if (!data?.devices || data.devices.length === 0) return true;
    return data.devices.every((d) => d.is_online !== 1);
  }, [data?.devices]);

  useEffect(() => {
    document.body.classList.toggle("night-mode", allOffline);
    return () => { document.body.classList.remove("night-mode"); };
  }, [allOffline]);

  // Current app by device
  const currentAppByDevice = useMemo(() => {
    const m: Record<string, string> = {};
    for (const d of data?.devices ?? []) {
      if (d.is_online === 1 && d.app_name) m[d.device_id] = d.app_name;
    }
    return m;
  }, [data?.devices]);

  const isToday = mounted && selectedDate === todayStr();

  // Filtered raw segments for the activity view
  const filteredSegments = useMemo(() => {
    const segs = tlData?.segments ?? [];
    if (!activeDevFilter) return segs;
    return segs.filter((s) => s.device_id === activeDevFilter);
  }, [tlData, activeDevFilter]);

  const totalMins = useMemo(() => {
    return filteredSegments.reduce(
      (total, segment) => total + segment.duration_minutes,
      0,
    );
  }, [filteredSegments]);

  const handleDevFilter = useCallback((devId: string) => {
    setActiveDevFilter(devId);
  }, []);

  // Fetch AI daily summary from backend
  const [dailySummary, setDailySummary] = useState<{ summary: string | null; generated_at: string | null } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setDailySummary(null);
    fetch(`/api/daily-summary?date=${selectedDate}`, { signal: controller.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setDailySummary(d); })
      .catch(() => {});
    return () => controller.abort();
  }, [selectedDate]);

  // Fetch site config
  const [siteConfig, setSiteConfig] = useState<SiteConfig | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetchConfig(controller.signal)
      .then(setSiteConfig)
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const { displayName, siteTitle } = siteConfig ?? { displayName: "長青", siteTitle: "事件面板-長青" };

  return (
    <>
      {/* Fireflies — visible only in night mode */}
      <div className="firefly-container" aria-hidden="true">
        <div className="firefly" /><div className="firefly" /><div className="firefly" />
        <div className="firefly" /><div className="firefly" /><div className="firefly" />
        <div className="firefly" /><div className="firefly" />
      </div>

      {/* ── Header ── */}
      <header className="top-bar reveal">
        <div className="top-bar-inner">
          {/* Left: title */}
          <div className="top-bar-left">
            <h1 className="site-title">{siteTitle}</h1>
            {mounted && <span className="site-greeting">{greeting()}</span>}
          </div>

          {/* Center: devices as clickable buttons showing current app */}
          <div className="top-bar-center reveal reveal-d2">
            {(data?.devices ?? []).map((d) => {
              const isSel = activeDevFilter === d.device_id;
              const isOn = d.is_online === 1;
              return (
                <button
                  key={d.device_id}
                  type="button"
                  className={`dev-btn ${isSel ? "dev-btn-active" : ""} ${isOn ? "" : "dev-btn-off"}`}
                  onClick={() => handleDevFilter(d.device_id)}
                >
                  <span className="dev-btn-name">{d.device_name}</span>
                  {isOn && (
                    <span className="dev-btn-app">
                      {d.app_name}{d.display_title ? ` · ${d.display_title}` : ""}
                    </span>
                  )}
                  {!isOn && <span className="dev-btn-off-label">离线</span>}
                  {isOn && d.extra && typeof d.extra.battery_percent === "number" && (
                    <span className="dev-btn-batt">{d.extra.battery_charging ? "\u26A1" : ""}{d.extra.battery_percent}%</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right: time + viewers */}
          <div className="top-bar-right">
            <span className="top-time">{mounted ? fmtTime(data?.server_time) : "--:--"}</span>
            {viewerCount > 0 && <span className="top-viewers">{viewerCount} 人在看</span>}
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <div className="panels">
        {/* ═══ LEFT ═══ */}
        <div className="panel-left">
          <BlossomSVG />
          <div className="petal-container">
            <div className="petal" /><div className="petal" /><div className="petal" /><div className="petal" />
            <div className="petal" /><div className="petal" /><div className="petal" /><div className="petal" />
            <div className="petal" /><div className="petal" /><div className="petal" /><div className="petal" />
          </div>

          {isOnline ? (
            <div className="presence-content">
              {/* Poetic online indicator */}
              <p className="status-line reveal reveal-d2">
                <span className="status-dot" />
                此刻在线
              </p>

              {/* Hero: split into app + what */}
              <div className="hero-block reveal reveal-d3">
                <p className="hero-app hero-alive">正在用 {active.app_name}</p>
                {active.display_title && (
                  <p className="hero-title">{getAppDescription(active.app_name, active.display_title)}</p>
                )}
              </div>

              {/* Music — detailed */}
              {music?.title && (
                <div className="music-block reveal reveal-d4">
                  <p className="music-label">正在听的音乐</p>
                  <div className="music-row">
                    {music.cover && <MusicCover src={music.cover} />}
                    <div className="music-bars">
                      <div className="m-bar" /><div className="m-bar" /><div className="m-bar" /><div className="m-bar" />
                    </div>
                    <div className="music-info">
                      <span className="music-title-text">{music.title}</span>
                      {music.artist && <span className="music-artist">{music.artist}</span>}
                      {music.app && <span className="music-app">via {music.app}</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* Separator */}
              <div className="orn-sep reveal reveal-d4"><span className="orn-sep-dot" /></div>

              {/* AI Daily Summary — moved above chart */}
              <div className="ai-summary reveal reveal-d5">
                <p className="ai-summary-label">今日小结</p>
                <p className="ai-summary-text">
                  {dailySummary?.summary || "整点自动生成"}
                </p>
                <span className="ai-summary-time">
                  {dailySummary?.generated_at ? `${dailySummary.generated_at.slice(11, 16)} · AI 生成` : "等待生成..."}
                </span>
              </div>

            </div>
          ) : (
            <div className="presence-content presence-offline reveal reveal-d2">
              <p className="offline-poem-line offline-poem-dim">万籁俱寂，设备已入眠</p>
              {loading && !data && <p className="offline-loading">轻叩数据之门...</p>}
              {error && !loading && <p className="offline-loading">信号微弱，尝试重连中</p>}
            </div>
          )}


        </div>

        {/* ═══ RIGHT: Timeline ═══ */}
        <div className="panel-right">
          {/* Date nav */}
          <div className="tl-header reveal reveal-d3">
            <span className="tl-title">
              活动
              {activeDevFilter && (
                <span className="tl-filter-badge">
                  {(data?.devices ?? []).find((d) => d.device_id === activeDevFilter)?.device_name}
                </span>
              )}
            </span>
            <div className="tl-header-actions">
              <span className="tl-total">{fmtDur(totalMins)}</span>
              <div className="view-switch" role="tablist" aria-label="活动展示模式">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activityView === "timeline"}
                  className={activityView === "timeline" ? "view-switch-active" : ""}
                  onClick={() => setActivityView("timeline")}
                >
                  时间线
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activityView === "usage"}
                  className={activityView === "usage" ? "view-switch-active" : ""}
                  onClick={() => setActivityView("usage")}
                >
                  使用排行
                </button>
              </div>
              <div className="tl-nav">
                <button type="button" className="btn-subtle" onClick={() => changeDate(offsetDate(selectedDate, -1))} aria-label="前一天">&larr;</button>
                <span className="tl-date" suppressHydrationWarning>{fmtDate(selectedDate)}</span>
                <button type="button" className="btn-subtle" onClick={() => changeDate(offsetDate(selectedDate, 1))} disabled={isToday} aria-label="后一天">&rarr;</button>
                {!isToday && <button type="button" className="btn-subtle btn-today" onClick={() => changeDate(todayStr())}>今天</button>}
              </div>
            </div>
          </div>

          {/* Activity view — timeline or aggregated ranking */}
          <div className="tl-scroll reveal reveal-d4">
            {filteredSegments.length === 0 && !loading ? (
              <div className="tl-empty">
                <p className="tl-empty-poem">尚无足迹</p>
                <p className="tl-empty-sub">这一天还是一张白纸</p>
              </div>
            ) : (
              <div style={{ opacity: loading && tlData ? 0.4 : 1, transition: "opacity 0.3s" }}>
                {filteredSegments.length > 0 && (
                  <Timeline
                    segments={filteredSegments}
                    currentAppByDevice={currentAppByDevice}
                    isToday={isToday}
                    mode={activityView}
                  />
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="tl-footer" suppressHydrationWarning>
            <span suppressHydrationWarning>每 10 秒自动刷新</span><span suppressHydrationWarning>{displayName} Now</span>
          </div>
        </div>
      </div>
    </>
  );
}
