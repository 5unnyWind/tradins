"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { DataSourceHealthItem, DataSourceHealthSnapshot } from "@/lib/types";

const NO_CACHE_HEADERS: HeadersInit = {
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

type SourceHealthApiResponse = {
  ok?: boolean;
  snapshot?: DataSourceHealthSnapshot;
  error?: string;
};

const SOURCE_LABEL: Record<DataSourceHealthItem["source"], string> = {
  yahoo: "Yahoo",
  eastmoney: "Eastmoney",
  reddit: "Reddit",
};
const TIMELINE_POINT_LIMIT = 12;

function fmtNum(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "N/A";
  return value.toFixed(digits);
}

function fmtRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "N/A";
  return `${value.toFixed(2)}%`;
}

function fmtTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function fmtTimelineTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function statusClass(status: DataSourceHealthItem["lastStatus"]): string {
  if (status === "success") return "is-success";
  if (status === "failed") return "is-failed";
  return "is-idle";
}

export function SourceHealthDashboard() {
  const [snapshot, setSnapshot] = useState<DataSourceHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const loadSnapshot = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/source-health?_=${Date.now()}`, {
        cache: "no-store",
        headers: NO_CACHE_HEADERS,
      });
      const data = (await response.json()) as SourceHealthApiResponse;
      if (!response.ok || !data.ok || !data.snapshot) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      setSnapshot(data.snapshot);
      if (!silent) {
        setStatus(`已刷新：${fmtTime(data.snapshot.generatedAt)}`);
      }
    } catch (error) {
      setStatus(`加载失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot(false);
  }, [loadSnapshot]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadSnapshot(true);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [loadSnapshot]);

  const sources = useMemo(() => snapshot?.sources ?? [], [snapshot]);
  const sourceSeriesMap = useMemo(() => {
    const mapped = new Map<DataSourceHealthItem["source"], DataSourceHealthSnapshot["series"][number]["points"]>();
    for (const series of snapshot?.series ?? []) {
      mapped.set(series.source, series.points);
    }
    return mapped;
  }, [snapshot]);

  return (
    <main className="shell source-health-shell">
      <section className="panel source-health-head">
        <div>
          <p className="eyebrow">source health panel</p>
          <h1>数据源健康面板</h1>
          <p className="source-health-muted">实时统计 Yahoo / Eastmoney / Reddit 的命中率、失败率和延迟表现。</p>
        </div>
        <div className="source-health-actions">
          <button
            type="button"
            className={`source-health-refresh${loading ? " is-loading" : ""}`}
            onClick={() => void loadSnapshot(false)}
            disabled={loading}
            aria-label={loading ? "刷新中" : "刷新数据"}
            title={loading ? "刷新中" : "刷新数据"}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                fill="currentColor"
                d="M12 5a7 7 0 0 1 6.62 4.75H16v2h6V5h-2v3.24A9 9 0 0 0 3 12h2a7 7 0 0 1 7-7Zm7 6a7 7 0 0 1-7 7 7 7 0 0 1-6.62-4.75H8v-2H2v6h2v-3.24A9 9 0 0 0 21 12h-2Z"
              />
            </svg>
          </button>
          <a className="hero-link-button" href="/">
            返回分析页
          </a>
          <a className="hero-link-button" href="/buff-cs2">
            BUFF CS2
          </a>
        </div>
      </section>

      {status ? <p className="status">{status}</p> : null}

      <section className="panel">
        <div className="panel-header">
          <h2>窗口信息</h2>
          <span>
            样本窗口: {snapshot?.latencyWindowSize ?? 0} 次请求 / 时序窗口: {snapshot?.seriesWindowMinutes ?? 0} 分钟
            / 粒度: {snapshot?.seriesBucketMinutes ?? 0} 分钟 / 更新时间: {fmtTime(snapshot?.generatedAt ?? null)}
          </span>
        </div>

        <div className="source-health-grid">
          {sources.map((item) => {
            const timeline = sourceSeriesMap.get(item.source) ?? [];
            const recentTimeline = timeline.slice(-TIMELINE_POINT_LIMIT);
            return (
              <article className="source-health-card" key={item.source}>
                <div className="source-health-card-head">
                  <h3>{SOURCE_LABEL[item.source]}</h3>
                  <span className={`source-health-badge ${statusClass(item.lastStatus)}`}>{item.lastStatus}</span>
                </div>
                <div className="source-health-metrics">
                  <p>请求数: {item.totalRequests}</p>
                  <p>命中率: {fmtRate(item.hitRatePct)}</p>
                  <p>失败率: {fmtRate(item.failureRatePct)}</p>
                  <p>平均延迟: {fmtNum(item.avgLatencyMs)} ms</p>
                  <p>P95 延迟: {fmtNum(item.p95LatencyMs)} ms</p>
                  <p>最近延迟: {fmtNum(item.lastLatencyMs)} ms</p>
                  <p>最近请求: {fmtTime(item.lastAt)}</p>
                </div>
                <div className="source-health-series">
                  <p className="source-health-series-title">近 {recentTimeline.length} 个时序点</p>
                  {recentTimeline.length ? (
                    <ul className="source-health-series-list">
                      {recentTimeline.map((point) => (
                        <li key={`${item.source}-${point.at}`}>
                          <span>{fmtTimelineTime(point.at)}</span>
                          <span>请求 {point.requests}</span>
                          <span>命中 {fmtRate(point.hitRatePct)}</span>
                          <span>失败 {fmtRate(point.failureRatePct)}</span>
                          <span>均延 {fmtNum(point.avgLatencyMs)} ms</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="source-health-muted">暂无时序数据。</p>
                  )}
                </div>
                {item.lastError ? <p className="source-health-error">最近错误: {item.lastError}</p> : null}
              </article>
            );
          })}
          {!sources.length ? <p className="source-health-muted">暂无统计数据。</p> : null}
        </div>
      </section>
    </main>
  );
}
