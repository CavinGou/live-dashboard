"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  fetchCurrent,
  fetchTimeline,
  subscribeCurrentEvents,
  type DashboardRequestOptions,
  type CurrentResponse,
  type TimelineResponse,
} from "@/lib/api";

const CURRENT_FALLBACK_POLL_INTERVAL = 3 * 1000;
const CURRENT_SSE_POLL_INTERVAL = 15 * 1000;
const TIMELINE_POLL_INTERVAL = 30 * 1000;

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useDashboard(dashboardId?: string) {
  const [current, setCurrent] = useState<CurrentResponse | null>(null);
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const requestOptions = useMemo<DashboardRequestOptions | undefined>(() => {
    return dashboardId ? { dashboardId } : undefined;
  }, [dashboardId]);

  useEffect(() => {
    if (!selectedDate) return;

    const controller = new AbortController();
    let currentRequestId = 0;
    let timelineRequestId = 0;
    let currentPollTimer: number | undefined;
    let eventRefreshTimer: number | undefined;
    let disposed = false;
    let realtimeConnected = false;

    const loadCurrent = async () => {
      const thisRequest = ++currentRequestId;
      try {
        const cur = await fetchCurrent(controller.signal, requestOptions);
        if (!controller.signal.aborted && thisRequest === currentRequestId) {
          setCurrent(cur);
          setViewerCount(cur.viewer_count ?? 0);
          setError(null);
        }
      } catch (e) {
        if (!controller.signal.aborted && thisRequest === currentRequestId) {
          setError(e instanceof Error ? e.message : "Failed to fetch data");
        }
      }
    };

    const loadTimeline = async () => {
      const thisRequest = ++timelineRequestId;
      try {
        const tl = await fetchTimeline(
          selectedDate,
          controller.signal,
          requestOptions,
        );
        if (!controller.signal.aborted && thisRequest === timelineRequestId) {
          setTimeline(tl);
        }
      } catch (e) {
        if (!controller.signal.aborted && thisRequest === timelineRequestId) {
          setError(e instanceof Error ? e.message : "Failed to fetch data");
        }
      }
    };

    const scheduleCurrentPoll = () => {
      if (disposed) return;
      if (currentPollTimer !== undefined) {
        window.clearTimeout(currentPollTimer);
      }
      currentPollTimer = window.setTimeout(async () => {
        await loadCurrent();
        scheduleCurrentPoll();
      }, realtimeConnected ? CURRENT_SSE_POLL_INTERVAL : CURRENT_FALLBACK_POLL_INTERVAL);
    };

    const refreshFromEvent = () => {
      if (eventRefreshTimer !== undefined) {
        window.clearTimeout(eventRefreshTimer);
      }
      eventRefreshTimer = window.setTimeout(loadCurrent, 60);
    };

    const unsubscribeEvents = subscribeCurrentEvents(
      refreshFromEvent,
      (connected) => {
        const reconnected = connected && !realtimeConnected;
        realtimeConnected = connected;
        setRealtimeConnected(connected);
        if (reconnected) void loadCurrent();
        scheduleCurrentPoll();
      },
    );

    setLoading(true);
    Promise.all([loadCurrent(), loadTimeline()]).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });

    scheduleCurrentPoll();
    const timelinePollId = setInterval(loadTimeline, TIMELINE_POLL_INTERVAL);

    return () => {
      disposed = true;
      controller.abort();
      unsubscribeEvents();
      if (currentPollTimer !== undefined) window.clearTimeout(currentPollTimer);
      if (eventRefreshTimer !== undefined) window.clearTimeout(eventRefreshTimer);
      clearInterval(timelinePollId);
    };
  }, [requestOptions, selectedDate]);

  const changeDate = useCallback((date: string) => {
    setSelectedDate(date);
  }, []);

  return {
    current,
    timeline,
    selectedDate,
    changeDate,
    loading,
    error,
    viewerCount,
    realtimeConnected,
  };
}
