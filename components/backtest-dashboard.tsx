"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import type { BacktestReport } from "@/lib/types";

const PriceChart = dynamic(
  () => import("@/components/price-chart").then((module) => module.PriceChart),
  { ssr: false },
);

const NO_CACHE_HEADERS: HeadersInit = {
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

type BacktestApiResponse = {
  ok?: boolean;
  report?: BacktestReport;
  error?: string;
};

function fmtPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "N/A";
  return `${value.toFixed(2)}%`;
}

function fmtNum(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "N/A";
  return value.toFixed(digits);
}

export function BacktestDashboard() {
  const [symbol, setSymbol] = useState("");
  const [lookbackDays, setLookbackDays] = useState("365");
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [report, setReport] = useState<BacktestReport | null>(null);

  const curve = useMemo(() => {
    if (!report) return { labels: [] as string[], strategy: [] as number[], benchmark: [] as number[] };
    return {
      labels: report.equityCurve.map((point) => point.date),
      strategy: report.equityCurve.map((point) => point.strategyEquity),
      benchmark: report.equityCurve.map((point) => point.benchmarkEquity),
    };
  }, [report]);

  async function runBacktest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setStatus("");
    setReport(null);

    try {
      const normalizedSymbol = symbol.trim().toUpperCase();
      const days = Number(lookbackDays);
      if (!normalizedSymbol) {
        throw new Error("请输入股票代码");
      }
      if (!Number.isInteger(days) || days < 30 || days > 3650) {
        throw new Error("回测天数需为 30-3650 的整数");
      }

      const url = `/api/backtest?symbol=${encodeURIComponent(normalizedSymbol)}&lookbackDays=${days}`;
      const response = await fetch(url, {
        cache: "no-store",
        headers: NO_CACHE_HEADERS,
      });
      const data = (await response.json()) as BacktestApiResponse;
      if (!response.ok || !data.ok || !data.report) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }

      setReport(data.report);
      setStatus(`回测完成：${data.report.symbol}，区间 ${data.report.rangeStart} ~ ${data.report.rangeEnd}`);
    } catch (error) {
      setStatus(`回测失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="shell backtest-shell">
      <section className="panel backtest-head">
        <div>
          <p className="eyebrow">strategy backtest</p>
          <h1>建议信号回测</h1>
          <p className="backtest-muted">
            将历史分析建议映射为仓位规则：买入=100%，减仓=50%，观望/卖出=0%，输出胜率、最大回撤、夏普等指标。
          </p>
        </div>
        <div className="backtest-head-actions">
          <a className="hero-link-button" href="/">
            返回分析页
          </a>
          <a className="hero-link-button" href="/drift">
            漂移看板
          </a>
          <a className="hero-link-button" href="/source-health">
            数据源健康
          </a>
        </div>
      </section>

      <form className="panel backtest-form" onSubmit={runBacktest}>
        <label>
          股票代码
          <input
            required
            maxLength={20}
            value={symbol}
            onChange={(event) => setSymbol(event.target.value)}
            placeholder="例如：AAPL / 600519.SS / GOLD"
          />
        </label>
        <label>
          回测天数
          <input
            type="number"
            min={30}
            max={3650}
            value={lookbackDays}
            onChange={(event) => setLookbackDays(event.target.value)}
          />
        </label>
        <button type="submit" disabled={isLoading || !symbol.trim()}>
          {isLoading ? "回测中..." : "开始回测"}
        </button>
        {status ? <p className="status">{status}</p> : null}
      </form>

      {report ? (
        <>
          <section className="panel">
            <div className="panel-header">
              <h2>核心指标</h2>
              <span>
                信号使用 {report.signalsUsed}/{report.signalCount}
              </span>
            </div>
            <div className="metric-grid">
              <div className="metric">
                <span>策略总收益</span>
                <strong>{fmtPct(report.metrics.totalReturnPct)}</strong>
              </div>
              <div className="metric">
                <span>基准总收益</span>
                <strong>{fmtPct(report.metrics.benchmarkReturnPct)}</strong>
              </div>
              <div className="metric">
                <span>最大回撤</span>
                <strong>{fmtPct(report.metrics.maxDrawdownPct)}</strong>
              </div>
              <div className="metric">
                <span>夏普比率</span>
                <strong>{fmtNum(report.metrics.sharpeRatio, 3)}</strong>
              </div>
              <div className="metric">
                <span>年化收益</span>
                <strong>{fmtPct(report.metrics.annualizedReturnPct)}</strong>
              </div>
              <div className="metric">
                <span>年化波动</span>
                <strong>{fmtPct(report.metrics.annualizedVolatilityPct)}</strong>
              </div>
              <div className="metric">
                <span>胜率</span>
                <strong>{fmtPct(report.metrics.winRatePct)}</strong>
              </div>
              <div className="metric">
                <span>交易次数</span>
                <strong>
                  {report.metrics.tradeCount}（胜 {report.metrics.winCount} / 负 {report.metrics.lossCount}）
                </strong>
              </div>
            </div>
          </section>

          <section className="grid cols-2">
            <article className="panel">
              <h2>策略净值曲线</h2>
              <PriceChart labels={curve.labels} values={curve.strategy} />
            </article>
            <article className="panel">
              <h2>基准净值曲线</h2>
              <PriceChart labels={curve.labels} values={curve.benchmark} />
            </article>
          </section>

          <section className="panel">
            <h2>交易明细（最近 20 笔）</h2>
            {!report.trades.length ? (
              <p className="backtest-muted">无有效持仓交易（可能全部建议为观望/卖出）。</p>
            ) : (
              <div className="backtest-trade-list">
                {report.trades
                  .slice(-20)
                  .reverse()
                  .map((trade, index) => (
                    <article className="backtest-trade-item" key={`${trade.startDate}-${trade.endDate}-${index}`}>
                      <p>
                        <strong>{trade.startDate}</strong> ~ <strong>{trade.endDate}</strong>
                      </p>
                      <p>仓位: {(trade.exposure * 100).toFixed(0)}%</p>
                      <p>持有天数: {trade.days}</p>
                      <p>收益: {fmtPct(trade.returnPct)}</p>
                    </article>
                  ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
