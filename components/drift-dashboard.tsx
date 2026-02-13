"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import type { ConclusionDriftPoint, ConclusionDriftReport } from "@/lib/types";

const PriceChart = dynamic(
  () => import("@/components/price-chart").then((module) => module.PriceChart),
  { ssr: false },
);

const NO_CACHE_HEADERS: HeadersInit = {
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

type DriftApiResponse = {
  ok?: boolean;
  report?: ConclusionDriftReport;
  error?: string;
};

function fmtNum(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "N/A";
  return value.toFixed(digits);
}

function recommendationText(value: ConclusionDriftPoint["recommendation"]): string {
  return value ?? "N/A";
}

function recommendationClass(value: ConclusionDriftPoint["recommendation"]): string {
  if (value === "买入") return "is-buy";
  if (value === "观望") return "is-hold";
  if (value === "减仓") return "is-reduce";
  if (value === "卖出") return "is-sell";
  return "is-na";
}

function fmtTime(value: string): string {
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

export function DriftDashboard() {
  const [symbol, setSymbol] = useState("");
  const [limit, setLimit] = useState("60");
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [report, setReport] = useState<ConclusionDriftReport | null>(null);

  const confidenceCurve = useMemo(() => {
    if (!report) return { labels: [] as string[], values: [] as number[] };
    const points = report.points.filter((point) => Number.isFinite(point.confidence));
    return {
      labels: points.map((point) => fmtTime(point.createdAt)),
      values: points.map((point) => Number(point.confidence)),
    };
  }, [report]);

  async function runDrift(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setStatus("");
    setReport(null);

    try {
      const normalizedSymbol = symbol.trim().toUpperCase();
      const n = Number(limit);
      if (!normalizedSymbol) {
        throw new Error("请输入股票代码");
      }
      if (!Number.isInteger(n) || n < 5 || n > 300) {
        throw new Error("N 需为 5-300 的整数");
      }

      const url = `/api/drift?symbol=${encodeURIComponent(normalizedSymbol)}&limit=${n}`;
      const response = await fetch(url, {
        cache: "no-store",
        headers: NO_CACHE_HEADERS,
      });
      const data = (await response.json()) as DriftApiResponse;
      if (!response.ok || !data.ok || !data.report) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }

      setReport(data.report);
      setStatus(`加载完成：${data.report.symbol}，共 ${data.report.metrics.sampleCount} 条样本`);
    } catch (error) {
      setStatus(`加载失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="shell drift-shell">
      <section className="panel drift-head">
        <div>
          <p className="eyebrow">conclusion drift board</p>
          <h1>结论漂移看板</h1>
          <p className="drift-muted">查看同一标的过去 N 次建议变化，追踪结论切换频率与置信度曲线。</p>
        </div>
        <div className="drift-head-actions">
          <a className="hero-link-button" href="/">
            返回分析页
          </a>
          <a className="hero-link-button" href="/backtest">
            去回测页
          </a>
          <a className="hero-link-button" href="/source-health">
            数据源健康
          </a>
        </div>
      </section>

      <form className="panel drift-form" onSubmit={runDrift}>
        <label>
          股票代码
          <input
            required
            maxLength={20}
            value={symbol}
            onChange={(event) => setSymbol(event.target.value)}
            placeholder="例如：AAPL / 600519.SS / BTC / ETH"
          />
        </label>
        <label>
          最近 N 次
          <input
            type="number"
            min={5}
            max={300}
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
          />
        </label>
        <button type="submit" disabled={isLoading || !symbol.trim()}>
          {isLoading ? "加载中..." : "查看漂移"}
        </button>
        {status ? <p className="status">{status}</p> : null}
      </form>

      {report ? (
        <>
          <section className="panel">
            <h2>漂移概览</h2>
            <div className="metric-grid">
              <div className="metric">
                <span>样本数</span>
                <strong>{report.metrics.sampleCount}</strong>
              </div>
              <div className="metric">
                <span>结论切换次数</span>
                <strong>{report.metrics.changeCount}</strong>
              </div>
              <div className="metric">
                <span>平均置信度</span>
                <strong>{fmtNum(report.metrics.averageConfidence)}</strong>
              </div>
              <div className="metric">
                <span>置信区间</span>
                <strong>
                  {fmtNum(report.metrics.minConfidence)} ~ {fmtNum(report.metrics.maxConfidence)}
                </strong>
              </div>
              <div className="metric">
                <span>买入</span>
                <strong>{report.metrics.buyCount}</strong>
              </div>
              <div className="metric">
                <span>观望</span>
                <strong>{report.metrics.holdCount}</strong>
              </div>
              <div className="metric">
                <span>减仓</span>
                <strong>{report.metrics.reduceCount}</strong>
              </div>
              <div className="metric">
                <span>卖出</span>
                <strong>{report.metrics.sellCount}</strong>
              </div>
            </div>
          </section>

          <section className="panel">
            <h2>置信度曲线</h2>
            {confidenceCurve.labels.length ? (
              <PriceChart labels={confidenceCurve.labels} values={confidenceCurve.values} />
            ) : (
              <p className="drift-muted">所选样本没有置信度数据。</p>
            )}
          </section>

          <section className="panel">
            <h2>建议序列（最新在前）</h2>
            <div className="drift-list">
              {[...report.points]
                .reverse()
                .map((point, index, arr) => {
                  const older = arr[index + 1];
                  const changed =
                    older && older.recommendation !== null && point.recommendation !== null
                      ? older.recommendation !== point.recommendation
                      : false;

                  return (
                    <article className="drift-item" key={point.id}>
                      <div className="drift-item-row">
                        <span className={`drift-recommendation ${recommendationClass(point.recommendation)}`}>
                          {recommendationText(point.recommendation)}
                        </span>
                        {changed ? <span className="drift-change-flag">发生切换</span> : null}
                      </div>
                      <p className="drift-item-meta">
                        #{point.id} · {fmtTime(point.createdAt)} · 置信度 {fmtNum(point.confidence)} · 等级 {point.confidenceLevel ?? "N/A"}
                      </p>
                    </article>
                  );
                })}
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
