"use client";

import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import {
  BarChart3,
  Battery,
  BatteryCharging,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LayoutList,
  Music2,
  Radio,
  Sparkles,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useDashboard } from "@/hooks/useDashboard";
import {
  fetchBackground,
  fetchConfig,
  type BackgroundResponse,
  type SiteConfig,
} from "@/lib/api";
import { getAppDescription } from "@/lib/app-descriptions";
import Timeline, { type ActivityViewMode } from "@/components/Timeline";

/* ═══ Helpers ═══ */
function fmtDur(m: number): string {
  if (!Number.isFinite(m)) return "<1m";
  const minutes = Math.max(0, Math.round(m));
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const r = minutes % 60;
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

function GlassSurface({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return <div className={`glass-surface ${className}`}>{children}</div>;
}

/* ═══════════════════════════════════════
   Main Page — 花信 v5
   ═══════════════════════════════════════ */
export default function Home() {
  const {
    current,
    timeline,
    selectedDate,
    changeDate,
    loading,
    error,
    viewerCount,
    realtimeConnected,
  } = useDashboard();
  const [activeDevFilter, setActiveDevFilter] = useState<string | null>(null);
  const [activityView, setActivityView] = useState<ActivityViewMode>("timeline");
  const [mounted, setMounted] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);
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
  const hasCurrentData = current !== null;
  const backgroundDevice = useMemo(
    () => (data?.devices ?? []).find((device) => device.device_id === activeDevFilter) ?? active,
    [active, activeDevFilter, data?.devices],
  );
  const [background, setBackground] = useState<BackgroundResponse | null>(null);
  const [backgroundReady, setBackgroundReady] = useState(false);

  const allOffline = useMemo(() => {
    if (!data?.devices || data.devices.length === 0) return true;
    return data.devices.every((d) => d.is_online !== 1);
  }, [data?.devices]);

  useEffect(() => {
    if (!hasCurrentData) return;
    document.body.classList.toggle("night-mode", allOffline);
    return () => { document.body.classList.remove("night-mode"); };
  }, [allOffline, hasCurrentData]);

  useEffect(() => {
    if (!backgroundDevice?.device_id) {
      setBackground(null);
      setBackgroundReady(true);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => setBackgroundReady(true), 1500);
    setBackgroundReady(false);
    fetchBackground(backgroundDevice.device_id, controller.signal)
      .then(setBackground)
      .catch(() => {})
      .finally(() => {
        window.clearTimeout(timeout);
        if (!controller.signal.aborted) setBackgroundReady(true);
      });
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    backgroundDevice?.device_id,
    backgroundDevice?.app_id,
    backgroundDevice?.display_title,
  ]);

  useEffect(() => {
    document.body.classList.toggle("photo-background", Boolean(background?.url));
    return () => document.body.classList.remove("photo-background");
  }, [background?.url]);

  useEffect(() => {
    if (!hasCurrentData || !backgroundReady) return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        document.body.classList.add("theme-transitions-ready");
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      document.body.classList.remove("theme-transitions-ready");
    };
  }, [hasCurrentData, backgroundReady]);

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
    <div className="dashboard-root">
      <div ref={backdropRef} className="ambient-plane" aria-hidden="true">
        {background?.url && (
          <div
            key={background.url}
            className="ambient-image"
            style={{ backgroundImage: `url(${JSON.stringify(background.url)})` }}
          />
        )}
      </div>

      <header className="top-bar-host reveal">
        <GlassSurface
          className="top-bar-liquid"
        >
          <div className="top-bar-inner">
          <div className="top-bar-left">
            <span className="brand-mark"><Radio size={17} /></span>
            <div className="brand-copy">
              <h1 className="site-title">{siteTitle}</h1>
              {mounted && <span className="site-greeting">{greeting()}</span>}
            </div>
          </div>

          <div className="top-bar-center">
            {(data?.devices ?? []).map((d) => {
              const isSel = activeDevFilter === d.device_id;
              const isOn = d.is_online === 1;
              const battery = d.extra?.battery_percent;
              return (
                <button
                  key={d.device_id}
                  type="button"
                  className={`dev-btn ${isSel ? "dev-btn-active" : ""} ${isOn ? "" : "dev-btn-off"}`}
                  onClick={() => handleDevFilter(d.device_id)}
                >
                  <span className={`device-presence ${isOn ? "is-live" : ""}`} />
                  <span className="dev-btn-name">{d.device_name}</span>
                  {isOn ? (
                    <span className="dev-btn-app">
                      {d.app_name}{d.display_title ? ` · ${d.display_title}` : ""}
                    </span>
                  ) : (
                    <span className="dev-btn-off-label">离线</span>
                  )}
                  {isOn && typeof battery === "number" && (
                    <span className="dev-btn-batt">
                      {d.extra?.battery_charging ? <BatteryCharging size={13} /> : <Battery size={13} />}
                      {battery}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="top-bar-right">
            <span className={`sync-pill ${realtimeConnected ? "is-live" : ""}`}>
              {realtimeConnected ? <Wifi size={13} /> : <WifiOff size={13} />}
              {realtimeConnected ? "实时推送" : "轮询兜底"}
            </span>
            <span className="top-time">
              <Clock3 size={14} />
              {mounted ? fmtTime(data?.server_time) : "--:--"}
            </span>
            {viewerCount > 0 && <span className="top-viewers">{viewerCount} 人在看</span>}
          </div>
          </div>
        </GlassSurface>
      </header>

      <main className="panels">
        <section className="panel-host panel-left-host reveal reveal-d2">
          <div className="left-stack">
            <GlassSurface className="left-activity-card">
              <div className="panel-content activity-panel">
                {isOnline ? (
                  <div className="presence-content">
                    <div className="status-line">
                      <span className="status-dot" />
                      此刻在线
                    </div>

                    <div className="hero-block">
                      <div className="hero-app-row">
                        {active.extra?.app_icon && (
                          <img
                            className="app-icon-image"
                            src={active.extra.app_icon}
                            alt=""
                            draggable={false}
                          />
                        )}
                        <div className="hero-copy">
                          <span className="hero-kicker">当前应用</span>
                          <p className="hero-app hero-alive">{active.app_name}</p>
                        </div>
                      </div>
                      {active.display_title && (
                        <p className="hero-title">{getAppDescription(active.app_name, active.display_title)}</p>
                      )}
                    </div>

                    {music?.title && (
                      <div className="music-block">
                        <div className="section-label"><Music2 size={14} />正在播放</div>
                        <div className="music-row">
                          {music.cover && <MusicCover src={music.cover} />}
                          <div className="music-info">
                            <span className="music-title-text">{music.title}</span>
                            {music.artist && <span className="music-artist">{music.artist}</span>}
                            {music.app && <span className="music-app">via {music.app}</span>}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="presence-offline">
                    <span className="offline-icon"><WifiOff size={24} /></span>
                    <p className="offline-poem-line">设备暂时离线</p>
                    {loading && !data && <p className="offline-loading">正在连接数据源...</p>}
                    {error && !loading && <p className="offline-loading">连接中断，正在重试</p>}
                  </div>
                )}
              </div>
            </GlassSurface>

            <GlassSurface className="left-summary-card">
              <div className="panel-content summary-panel">
                <div className="ai-summary">
                  <div className="ai-summary-header">
                    <span className="ai-summary-label"><Sparkles size={14} />今日小结</span>
                    <span className="ai-summary-time">
                      {dailySummary?.generated_at ? `${dailySummary.generated_at.slice(11, 16)} · AI 生成` : "等待生成"}
                    </span>
                  </div>
                  <p className="ai-summary-text">
                    {dailySummary?.summary || "整点自动生成"}
                  </p>
                </div>
              </div>
            </GlassSurface>
          </div>
        </section>

        <section className="panel-host panel-right-host reveal reveal-d3">
          <GlassSurface className="panel-liquid">
            <div className="panel-content panel-right">
              <div className="tl-header">
            <span className="tl-title">
              <BarChart3 size={15} />
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
                  <LayoutList size={13} />
                  时间线
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activityView === "usage"}
                  className={activityView === "usage" ? "view-switch-active" : ""}
                  onClick={() => setActivityView("usage")}
                >
                  <BarChart3 size={13} />
                  使用排行
                </button>
              </div>
              <div className="tl-nav">
                <button type="button" className="btn-subtle icon-btn" onClick={() => changeDate(offsetDate(selectedDate, -1))} aria-label="前一天">
                  <ChevronLeft size={16} />
                </button>
                <span className="tl-date" suppressHydrationWarning>
                  <CalendarDays size={13} />
                  {fmtDate(selectedDate)}
                </span>
                <button type="button" className="btn-subtle icon-btn" onClick={() => changeDate(offsetDate(selectedDate, 1))} disabled={isToday} aria-label="后一天">
                  <ChevronRight size={16} />
                </button>
                {!isToday && <button type="button" className="btn-subtle btn-today" onClick={() => changeDate(todayStr())}>今天</button>}
              </div>
            </div>
          </div>

          <div className="tl-scroll">
            {filteredSegments.length === 0 && !loading ? (
              <div className="tl-empty">
                <p className="tl-empty-poem">尚无活动记录</p>
                <p className="tl-empty-sub">这一天还是一张白纸</p>
              </div>
            ) : (
              <div style={{ opacity: loading && tlData ? 0.5 : 1, transition: "opacity 0.3s" }}>
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

          <div className="tl-footer" suppressHydrationWarning>
            <span className={`realtime-status ${realtimeConnected ? "is-live" : ""}`}>
              {realtimeConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
              {realtimeConnected ? "SSE 实时同步" : "轮询兜底"}
            </span>
            <span
              className="background-source"
              title={background?.copyright || background?.title || ""}
            >
              {background?.source === "bing"
                ? "Bing 每日壁纸"
                : background?.source === "activity"
                  ? "活动背景"
                  : "动态背景"}
            </span>
            <span>{displayName} Now</span>
          </div>
            </div>
          </GlassSurface>
        </section>
      </main>
    </div>
  );
}
