"use client";

import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  type CSSProperties,
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
  Plus,
  Radio,
  SlidersHorizontal,
  Sparkles,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useDashboard } from "@/hooks/useDashboard";
import {
  fetchBackground,
  fetchConfig,
  fetchDashboardSettings,
  putDashboardSettings,
  type BackgroundResponse,
  type SiteConfig,
} from "@/lib/api";
import { getAppDescription } from "@/lib/app-descriptions";
import {
  applySettings,
  cacheSettings,
  DEFAULT_SETTINGS,
  nextCheatProgress,
  normalizeSettings,
  readCachedSettings,
  readOwnerToken,
  writeOwnerToken,
  type DashboardSettings,
} from "@/lib/dashboard-settings";
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

function preloadImage(url: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", handleAbort);
      image.onload = null;
      image.onerror = null;
      if (error) reject(error);
      else resolve();
    };
    const handleAbort = () => finish(new Error("Background preload aborted"));
    const timeout = window.setTimeout(
      () => finish(new Error("Background preload timed out")),
      15_000,
    );

    signal.addEventListener("abort", handleAbort, { once: true });
    image.onload = () => finish();
    image.onerror = () => finish(new Error("Background image failed to load"));
    image.referrerPolicy = "no-referrer";
    image.src = url;
  });
}

/* ═══════════════════════════════════════
   Main Page — 花信 v5
   ═══════════════════════════════════════ */
export default function Home() {
  const [activeDevFilter, setActiveDevFilter] = useState<string | null>(null);
  const [activityView, setActivityView] = useState<ActivityViewMode>("timeline");
  const [mounted, setMounted] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setMounted(true); }, []);

  const [settings, setSettings] = useState<DashboardSettings>(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<DashboardSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsWritable, setSettingsWritable] = useState(false);
  const [settingsUpdatedAt, setSettingsUpdatedAt] = useState<string | null>(null);
  const [ownerToken, setOwnerToken] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [appBgDraft, setAppBgDraft] = useState("");
  const [appBgTarget, setAppBgTarget] = useState("");
  const [settingsNote, setSettingsNote] = useState<string | null>(null);
  const cheatRef = useRef<string[]>([]);

  useEffect(() => {
    const cached = readCachedSettings();
    setSettings(cached);
    setDraft(cached);
    setOwnerToken(readOwnerToken());
  }, []);

  useEffect(() => {
    applySettings(draft);
  }, [draft]);

  useEffect(() => {
    if (!settingsOpen) setDraft(settings);
  }, [settings, settingsOpen]);

  const refreshSettings = useCallback(() => {
    void (async () => {
      try {
        const remote = await fetchDashboardSettings();
        const next = normalizeSettings(remote);
        setSettings(next);
        setSettingsWritable(remote.writable);
        setSettingsUpdatedAt(remote.updatedAt ?? null);
        cacheSettings(next);
      } catch {
        // Keep the cached appearance when the server is unreachable.
      }
    })();
  }, []);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && settingsOpen) {
        setSettingsOpen(false);
        return;
      }
      const cheat = nextCheatProgress(cheatRef.current, event.key.toLowerCase());
      cheatRef.current = cheat.progress;
      if (cheat.matched) setSettingsOpen((open) => !open);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settingsOpen]);

  const {
    current,
    timeline,
    selectedDate,
    changeDate,
    loading,
    error,
    viewerCount,
    realtimeConnected,
  } = useDashboard(undefined, refreshSettings);

  // Keep focus on a valid device. Initial focus prefers the first online device.
  useEffect(() => {
    const devices = current?.devices;
    if (!devices) return;

    if (devices.length === 0) {
      if (activeDevFilter !== null) setActiveDevFilter(null);
      return;
    }

    const selectedExists = activeDevFilter
      ? devices.some((device) => device.device_id === activeDevFilter)
      : false;
    if (selectedExists) return;

    const fallback = devices.find((device) => device.is_online === 1) ?? devices[0];
    setActiveDevFilter(fallback?.device_id ?? null);
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

  const focusedDevice = useMemo(
    () => (data?.devices ?? []).find((device) => device.device_id === activeDevFilter) ?? active,
    [active, activeDevFilter, data?.devices],
  );
  const focusedDeviceId = focusedDevice?.device_id ?? null;
  const music = focusedDevice?.extra?.music;
  const [background, setBackground] = useState<BackgroundResponse | null>(null);

  useEffect(() => {
    const deviceId = focusedDeviceId;
    const customUrl = focusedDevice?.app_name
      ? draft.appBackgrounds[focusedDevice.app_name]
      : undefined;

    if (!deviceId) {
      setBackground(null);
      return;
    }

    if (customUrl) {
      const controller = new AbortController();
      void (async () => {
        try {
          await preloadImage(customUrl, controller.signal);
        } catch {
          // Keep the previous wallpaper when the custom image cannot load.
        }
        if (controller.signal.aborted) return;
        setBackground({
          source: "custom",
          url: customUrl,
          device_id: deviceId,
          app_id: focusedDevice?.app_id ?? "",
          app_name: focusedDevice?.app_name ?? "",
          display_title: "",
          title: "",
          copyright: "",
        });
      })();
      return () => controller.abort();
    }

    let stopped = false;
    let activeController: AbortController | undefined;
    let refreshTimer: number | undefined;

    const load = async (initial: boolean) => {
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;

      try {
        const next = await fetchBackground(deviceId, controller.signal);
        if (stopped || controller.signal.aborted) return;
        if (next.url) {
          await preloadImage(next.url, controller.signal);
        }
        if (stopped || controller.signal.aborted) return;

        setBackground(next);

        const refreshAfterMs = Number(next.refresh_after_ms) || 0;
        if (next.source === "infinity" && refreshAfterMs > 0) {
          refreshTimer = window.setTimeout(
            () => { void load(false); },
            refreshAfterMs + 500,
          );
        }
      } catch {
        if (stopped || controller.signal.aborted) return;
        refreshTimer = window.setTimeout(
          () => { void load(false); },
          60_000,
        );
      }
    };

    void load(true);
    return () => {
      stopped = true;
      if (refreshTimer) window.clearTimeout(refreshTimer);
      activeController?.abort();
    };
  }, [
    focusedDeviceId,
    focusedDevice?.app_id,
    focusedDevice?.display_title,
    focusedDevice?.app_name,
    draft.appBackgrounds,
  ]);

  useEffect(() => {
    document.body.classList.toggle("photo-background", Boolean(background?.url));
    return () => document.body.classList.remove("photo-background");
  }, [background?.url]);

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
    if (!focusedDeviceId) return segs;
    return segs.filter((s) => s.device_id === focusedDeviceId);
  }, [tlData, focusedDeviceId]);

  const totalMins = useMemo(() => {
    return filteredSegments.reduce(
      (total, segment) => total + segment.duration_minutes,
      0,
    );
  }, [filteredSegments]);

  const handleDevFilter = useCallback((devId: string) => {
    setActiveDevFilter(devId);
  }, []);

  const currentAppName = focusedDevice?.app_name ?? "";

  const selectableApps = useMemo(() => {
    const names = new Map<string, boolean>();
    if (currentAppName) names.set(currentAppName, true);
    for (const segment of tlData?.segments ?? []) {
      if (segment.app_name && !names.has(segment.app_name)) names.set(segment.app_name, false);
    }
    for (const app of Object.keys(draft.appBackgrounds)) {
      if (!names.has(app)) names.set(app, false);
    }
    return Array.from(names.entries())
      .map(([name, current]) => ({ name, current }))
      .sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name, "zh"));
  }, [currentAppName, tlData?.segments, draft.appBackgrounds]);

  const draftRef = useRef(draft);
  useEffect(() => { draftRef.current = draft; }, [draft]);

  useEffect(() => {
    if (!settingsOpen) return;
    setSettingsNote(null);
    const target = currentAppName || selectableApps[0]?.name || "";
    setAppBgTarget(target);
    setAppBgDraft(target ? (draftRef.current.appBackgrounds[target] ?? "") : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen, currentAppName]);

  const applyAppBackground = useCallback(() => {
    const app = appBgTarget;
    if (!app) return;
    const url = appBgDraft.trim();
    setDraft((prev) => {
      const next = { ...prev.appBackgrounds };
      if (url) next[app] = url;
      else delete next[app];
      return { ...prev, appBackgrounds: next };
    });
    setSettingsNote("待同步");
  }, [appBgDraft, appBgTarget]);

  const pickAppBackgroundTarget = useCallback((app: string) => {
    setAppBgTarget(app);
    setAppBgDraft(app ? (draftRef.current.appBackgrounds[app] ?? "") : "");
  }, []);

  const removeAppBackground = useCallback((app: string) => {
    setDraft((prev) => {
      const next = { ...prev.appBackgrounds };
      delete next[app];
      return { ...prev, appBackgrounds: next };
    });
    if (appBgTarget === app) setAppBgDraft("");
    setSettingsNote("待同步");
  }, [appBgTarget]);

  const resetDraft = useCallback(() => {
    setDraft(DEFAULT_SETTINGS);
    setAppBgDraft("");
    setSettingsNote("已恢复默认值，待同步");
  }, []);

  const pickAppBackgroundFile = useCallback((file: File | undefined) => {
    if (!file || !appBgTarget) return;
    if (file.size > 1_100_000) {
      setSettingsNote("图片需小于 1.2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : "";
      if (!url) return;
      setDraft((prev) => ({
        ...prev,
        appBackgrounds: { ...prev.appBackgrounds, [appBgTarget]: url },
      }));
      setAppBgDraft(url);
      setSettingsNote("待同步");
    };
    reader.readAsDataURL(file);
  }, [appBgTarget]);

  const saveSettingsToServer = useCallback(async () => {
    const token = ownerToken.trim();
    if (!token) {
      setSettingsNote("先填写管理口令");
      return;
    }
    setSettingsSaving(true);
    setSettingsNote(null);
    try {
      const saved = await putDashboardSettings(draft, token);
      const next = normalizeSettings(saved);
      setSettings(next);
      setDraft(next);
      cacheSettings(next);
      setSettingsWritable(saved.writable);
      setSettingsUpdatedAt(saved.updatedAt ?? null);
      writeOwnerToken(token);
      setSettingsNote("已同步");
    } catch (e) {
      setSettingsNote(e instanceof Error ? e.message : "同步失败");
    } finally {
      setSettingsSaving(false);
    }
  }, [draft, ownerToken]);

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
  const devices = useMemo(
    () => [...(data?.devices ?? [])].sort((a, b) => a.device_id.localeCompare(b.device_id, "en")),
    [data?.devices],
  );
  const focusedDeviceIndex = Math.max(
    0,
    devices.findIndex((device) => device.device_id === focusedDeviceId),
  );
  const focusedDevicePosition = devices.length > 0 ? focusedDeviceIndex / devices.length : 0;

  return (
    <div className="dashboard-root">
      <div className="ambient-plane" aria-hidden="true" />
      <div ref={backdropRef} className="wallpaper-layer" aria-hidden="true">
        {background?.url && (
          <div
            key={background.url}
            className="wallpaper-image"
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
            {devices.length > 0 && (
              <div
                className="device-dock"
                role="tablist"
                aria-label="聚焦设备"
                style={{
                  "--device-dock-width": `${devices.length * 172}px`,
                  "--device-count": devices.length,
                  "--device-indicator-left": `calc(5px + (100% - 10px) * ${focusedDevicePosition})`,
                  "--device-indicator-width": `calc((100% - 10px) / ${devices.length})`,
                } as CSSProperties}
              >
                <span className="device-dock-indicator" aria-hidden="true" />
                {devices.map((d) => {
                  const isSel = focusedDeviceId === d.device_id;
                  const isOn = d.is_online === 1;
                  const battery = d.extra?.battery_percent;
                  return (
                    <button
                      key={d.device_id}
                      type="button"
                      role="tab"
                      aria-selected={isSel}
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
            )}
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
                {focusedDevice?.is_online === 1 ? (
                  <div className="presence-content">
                    <div className="status-line">
                      <span className="status-dot" />
                      此刻在线
                    </div>

                    <div className="hero-block">
                      <div className="hero-app-row">
                        {focusedDevice.extra?.app_icon && (
                          <img
                            className="app-icon-image"
                            src={focusedDevice.extra.app_icon}
                            alt=""
                            draggable={false}
                          />
                        )}
                        <div className="hero-copy">
                          <span className="hero-kicker">当前应用</span>
                          <p className="hero-app hero-alive">{focusedDevice.app_name}</p>
                        </div>
                      </div>
                      {focusedDevice.display_title && (
                        <p className="hero-title">{getAppDescription(focusedDevice.app_name, focusedDevice.display_title)}</p>
                      )}
                    </div>

                    {music?.title && (
                      <div className="music-block">
                        <div className="music-row">
                          {music.app && (
                            <div className="music-source">
                              <span className="music-source-name">{music.app}</span>
                            </div>
                          )}
                          <div className="music-info">
                            <span className="music-title-text">{music.title}</span>
                            {music.artist && <span className="music-artist">{music.artist}</span>}
                          </div>
                          {music.cover && <MusicCover src={music.cover} />}
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
              <div
                className="tl-view"
                style={{ opacity: loading && tlData ? 0.5 : 1, transition: "opacity 0.3s" }}
              >
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
            <span
              className="background-source"
              title={background?.copyright || background?.title || ""}
            >
              {background?.source === "bing"
                ? "Bing 每日壁纸"
                : background?.source === "infinity"
                  ? "Infinity 壁纸"
                  : background?.source === "activity"
                    ? "活动背景"
                    : background?.source === "custom"
                      ? "应用专属背景"
                      : "动态背景"}
            </span>
            <span>{displayName} Now</span>
          </div>
            </div>
          </GlassSurface>
        </section>
      </main>

      {settingsOpen && (
        <div
          className="settings-scrim"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSettingsOpen(false);
          }}
        >
          <div className="settings-panel" role="dialog" aria-modal="true" aria-label="面板设置">
            <div className="settings-head">
              <span className="settings-title"><SlidersHorizontal size={14} />面板设置</span>
              <button
                type="button"
                className="settings-btn settings-icon-btn"
                onClick={() => setSettingsOpen(false)}
                aria-label="关闭设置"
              >
                <X size={14} />
              </button>
            </div>

            <div className="settings-body">
              <div className="settings-col">
                <label className="settings-field">
                  <span className="settings-field-head">
                    <span>区块不透明度</span>
                    <span className="settings-value">{Math.round(draft.panelOpacity * 100)}%</span>
                  </span>
                  <input
                    className="settings-range"
                    type="range"
                    min={0}
                    max={96}
                    step={1}
                    value={Math.round(draft.panelOpacity * 100)}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, panelOpacity: Number(event.target.value) / 100 }))
                    }
                  />
                </label>

                <label className="settings-field">
                  <span className="settings-field-head">
                    <span>壁纸遮罩</span>
                    <span className="settings-value">{Math.round(draft.overlayStrength * 100)}%</span>
                  </span>
                  <input
                    className="settings-range"
                    type="range"
                    min={0}
                    max={160}
                    step={5}
                    value={Math.round(draft.overlayStrength * 100)}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, overlayStrength: Number(event.target.value) / 100 }))
                    }
                  />
                </label>
              </div>

              <div className="settings-col settings-col-apps">
                <div className="settings-field">
                  <span className="settings-field-head">
                    <span>应用专属背景</span>
                    <span className="settings-value">
                      {appBgTarget ? appBgTarget : "无在线应用"}
                    </span>
                  </span>
                  <div className="settings-apps">
                    {selectableApps.length === 0 && (
                      <span className="settings-apps-empty">暂无应用</span>
                    )}
                    {selectableApps.map((app) => {
                      const image = draft.appBackgrounds[app.name];
                      return (
                        <button
                          key={app.name}
                          type="button"
                          className={`settings-app${app.name === appBgTarget ? " is-selected" : ""}${image ? " is-configured" : ""}`}
                          onClick={() => pickAppBackgroundTarget(app.name)}
                          title={app.name}
                        >
                          <span
                            className="settings-app-thumb"
                            style={image ? { backgroundImage: `url(${JSON.stringify(image)})` } : undefined}
                          >
                            {!image && <Plus size={16} />}
                            {app.current && <span className="settings-app-badge">活跃</span>}
                          </span>
                          <span className="settings-app-name">{app.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <input
                  className="settings-input"
                  type="url"
                  inputMode="url"
                  spellCheck={false}
                  placeholder="https://"
                  value={appBgDraft}
                  disabled={!appBgTarget}
                  onChange={(event) => setAppBgDraft(event.target.value)}
                />
                <div className="settings-actions">
                  <button
                    type="button"
                    className="settings-btn settings-btn-primary"
                    onClick={applyAppBackground}
                    disabled={!appBgTarget}
                  >
                    应用
                  </button>
                  <label className={`settings-btn ${appBgTarget ? "" : "is-disabled"}`}>
                    选择图片
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      disabled={!appBgTarget}
                      onChange={(event) => {
                        pickAppBackgroundFile(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="settings-btn"
                    onClick={() => appBgTarget && removeAppBackground(appBgTarget)}
                    disabled={!appBgTarget || !draft.appBackgrounds[appBgTarget]}
                  >
                    移除
                  </button>
                </div>
              </div>
            </div>

            <div className="settings-foot">
              <label className="settings-field">
                <span className="settings-field-head">
                  <span>管理口令</span>
                  <span className="settings-value">
                    {settingsWritable ? (settingsUpdatedAt ? settingsUpdatedAt.slice(0, 16).replace("T", " ") : "未同步") : "服务端未开启"}
                  </span>
                </span>
                <input
                  className="settings-input"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="SETTINGS_TOKEN"
                  value={ownerToken}
                  disabled={!settingsWritable}
                  onChange={(event) => setOwnerToken(event.target.value)}
                />
              </label>

              <div className="settings-actions">
                <button
                  type="button"
                  className="settings-btn settings-btn-primary"
                  onClick={saveSettingsToServer}
                  disabled={!settingsWritable || settingsSaving}
                >
                  {settingsSaving ? "同步中" : "同步到云端"}
                </button>
                <button type="button" className="settings-btn" onClick={resetDraft}>
                  恢复默认
                </button>
                {settingsNote && <span className="settings-note">{settingsNote}</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
