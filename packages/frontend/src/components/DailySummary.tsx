"use client";

import { useEffect, useState } from "react";
import { fetchDailySummary, type DailySummaryResponse } from "@/lib/api";

interface Props {
  selectedDate: string;
}

export default function DailySummary({ selectedDate }: Props) {
  const [data, setData] = useState<DailySummaryResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    function load() {
      fetchDailySummary(selectedDate, controller.signal)
        .then((d) => setData(d))
        .catch(() => {});
    }

    load();

    // Auto-refresh every 60 seconds to pick up new summaries
    const interval = setInterval(load, 60_000);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [selectedDate]);

  const summary = data?.summary;
  const generatedAt = data?.generated_at;

  return (
    <div className="card-decorated daily-summary">
      <p className="daily-summary-label">
        今日小结
        <span className="daily-summary-badge">AI</span>
      </p>
      <p className="daily-summary-text">
        {summary || "每小时自动更新"}
      </p>
      {generatedAt ? (
        <span className="daily-summary-time">
          {generatedAt.slice(11, 16)} · AI 生成
        </span>
      ) : (
        <span className="daily-summary-time daily-summary-time-pending">
          等待生成...
        </span>
      )}
    </div>
  );
}
