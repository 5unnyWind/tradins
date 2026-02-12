"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, useTransition } from "react";
import useSWR from "swr";

import type { AnalysisRecordMeta, AnalysisResult } from "@/lib/types";

const PriceChart = dynamic(
  () => import("@/components/price-chart").then((m) => m.PriceChart),
  { ssr: false },
);
const MarkdownView = dynamic(
  () => import("@/components/markdown-view").then((m) => m.MarkdownView),
  { ssr: false },
);
const MermaidView = dynamic(
  () => import("@/components/mermaid-view").then((m) => m.MermaidView),
  { ssr: false },
);

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

function fmtNum(value: unknown, digits = 2): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "N/A";
  return n.toFixed(digits);
}

function fmtPct(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "N/A";
  const v = Math.abs(n) <= 1 ? n * 100 : n;
  return `${v.toFixed(2)}%`;
}

interface DashboardProps {
  initialRecords: AnalysisRecordMeta[];
  initialStorageMode: "vercel_postgres" | "memory";
}

export function AnalysisDashboard({ initialRecords, initialStorageMode }: DashboardProps) {
  const [symbol, setSymbol] = useState("AAPL");
  const [analysisMode, setAnalysisMode] = useState<"quick" | "standard" | "deep">("standard");
  const [debateRounds, setDebateRounds] = useState("");
  const [period, setPeriod] = useState("6mo");
  const [interval, setInterval] = useState("1d");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [status, setStatus] = useState("");
  const [storageMode, setStorageMode] = useState<"vercel_postgres" | "memory">(initialStorageMode);
  const [isPending, startTransition] = useTransition();

  const { data, mutate } = useSWR("/api/records", fetcher, {
    fallbackData: { records: initialRecords, storage: initialStorageMode },
    revalidateOnFocus: false,
  });

  const records: AnalysisRecordMeta[] = data?.records ?? [];

  const chartData = useMemo(() => {
    const bars = result?.stageBundle.market.recentBars ?? {};
    const entries = Object.entries(bars).sort((a, b) => a[0].localeCompare(b[0]));
    return {
      labels: entries.map(([k]) => k),
      values: entries.map(([, v]) => Number(v.Close ?? 0)),
    };
  }, [result]);

  async function runAnalysis() {
    setStatus("多智能体分析执行中，请等待 30-180 秒...");
    const payload: Record<string, unknown> = {
      symbol: symbol.trim().toUpperCase(),
      analysisMode,
      period: period.trim(),
      interval: interval.trim(),
    };
    if (debateRounds.trim()) payload.debateRounds = Number(debateRounds.trim());

    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await response.json();
    if (!response.ok || !json.ok) {
      throw new Error(json.error ?? `HTTP ${response.status}`);
    }
    setResult(json.result);
    setStorageMode(json.storage);
    setStatus(`分析完成，记录 ID: ${json.recordId}`);
    mutate();
  }

  async function loadRecord(id: number) {
    setStatus(`正在加载记录 #${id} ...`);
    const response = await fetch(`/api/records/${id}`, { cache: "no-store" });
    const json = await response.json();
    if (!response.ok || !json.ok) {
      throw new Error(json.error ?? `HTTP ${response.status}`);
    }
    setResult(json.record.result);
    setStatus(`已加载记录 #${id}`);
  }

  return (
    <main className="shell">
      <div className="bg-orb orb-a" />
      <div className="bg-orb orb-b" />

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">tradins on next.js + vercel</p>
          <h1>多智能体股票分析工作台</h1>
          <p>
            四位分析师并行研究，随后多空辩论、研究主管决策、风控内阁裁定。所有分析记录可持久化到
            Vercel Postgres。
          </p>
          <p className="storage-tag">
            当前存储: <strong>{storageMode}</strong>
          </p>
        </div>

        <form
          className="panel form-panel"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(() => {
              runAnalysis().catch((err) => setStatus(`分析失败: ${err instanceof Error ? err.message : String(err)}`));
            });
          }}
        >
          <label>
            股票代码
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="AAPL / 0700.HK / 600519.SS" />
          </label>
          <label>
            分析模式
            <select
              value={analysisMode}
              onChange={(e) => setAnalysisMode(e.target.value as "quick" | "standard" | "deep")}
            >
              <option value="quick">quick</option>
              <option value="standard">standard</option>
              <option value="deep">deep</option>
            </select>
          </label>
          <label>
            辩论轮次（留空走模式默认）
            <input value={debateRounds} onChange={(e) => setDebateRounds(e.target.value)} placeholder="1-10" />
          </label>
          <label>
            K线周期
            <input value={period} onChange={(e) => setPeriod(e.target.value)} />
          </label>
          <label>
            K线粒度
            <input value={interval} onChange={(e) => setInterval(e.target.value)} />
          </label>
          <button type="submit" disabled={isPending}>
            {isPending ? "分析中..." : "开始分析"}
          </button>
          <p className="status">{status}</p>
        </form>
      </section>

      <section className="grid cols-2">
        <article className="panel">
          <div className="panel-header">
            <h2>分析记录</h2>
            <span>{records.length} 条</span>
          </div>
          <div className="record-list">
            {records.map((record) => (
              <button
                type="button"
                className="record-item"
                key={record.id}
                onClick={() => {
                  startTransition(() => {
                    loadRecord(record.id).catch((err) =>
                      setStatus(`加载失败: ${err instanceof Error ? err.message : String(err)}`),
                    );
                  });
                }}
              >
                <div>
                  <strong>{record.symbol}</strong>
                  <span>
                    {record.analysisMode} · {record.debateRounds} 轮
                  </span>
                </div>
                <div>
                  <em>{record.recommendation ?? "-"}</em>
                  <small>{new Date(record.createdAt).toLocaleString()}</small>
                </div>
              </button>
            ))}
            {!records.length ? <div className="empty-state">暂无记录</div> : null}
          </div>
        </article>

        <article className="panel">
          <h2>数据流图</h2>
          {result ? <MermaidView code={result.graphMermaid} /> : <div className="empty-state">先运行一次分析</div>}
        </article>
      </section>

      {result ? (
        <>
          <section className="grid cols-2">
            <article className="panel">
              <h2>市场快照</h2>
              <div className="metric-grid">
                <div className="metric">
                  <span>现价</span>
                  <strong>{fmtNum(result.stageBundle.market.technicals.price)}</strong>
                </div>
                <div className="metric">
                  <span>1日涨跌</span>
                  <strong>{fmtPct(result.stageBundle.market.technicals.changePct1d)}</strong>
                </div>
                <div className="metric">
                  <span>RSI14</span>
                  <strong>{fmtNum(result.stageBundle.market.technicals.rsi14)}</strong>
                </div>
                <div className="metric">
                  <span>量比20d</span>
                  <strong>{fmtNum(result.stageBundle.market.technicals.volumeRatio20d)}</strong>
                </div>
              </div>
              <PriceChart labels={chartData.labels} values={chartData.values} />
            </article>

            <article className="panel">
              <h2>研究主管初步交易计划</h2>
              <MarkdownView markdown={result.preliminaryPlan} />
            </article>
          </section>

          <section className="panel">
            <h2>四位分析师</h2>
            <div className="card-grid">
              <div className="card">
                <h3>📈 市场分析师</h3>
                <MarkdownView markdown={result.analystReports.market.markdown} />
              </div>
              <div className="card">
                <h3>📊 基本面分析师</h3>
                <MarkdownView markdown={result.analystReports.fundamentals.markdown} />
              </div>
              <div className="card">
                <h3>📰 新闻分析师</h3>
                <MarkdownView markdown={result.analystReports.news.markdown} />
              </div>
              <div className="card">
                <h3>🗣️ 舆情分析师</h3>
                <MarkdownView markdown={result.analystReports.social.markdown} />
              </div>
            </div>
          </section>

          <section className="panel">
            <h2>多空辩论</h2>
            <div className="timeline">
              {result.debates.map((turn) => (
                <article className="turn" key={turn.roundId}>
                  <span className="badge">第 {turn.roundId} 轮</span>
                  <div className="grid cols-2">
                    <div className="card">
                      <h3>🐂 多头</h3>
                      <MarkdownView markdown={turn.bullMarkdown} />
                    </div>
                    <div className="card">
                      <h3>🐻 空头</h3>
                      <MarkdownView markdown={turn.bearMarkdown} />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>风控内阁与最终裁定</h2>
            <div className="card-grid triple">
              <div className="card">
                <h3>🚨 激进派</h3>
                <MarkdownView markdown={result.riskReports.risky} />
              </div>
              <div className="card">
                <h3>🛡️ 保守派</h3>
                <MarkdownView markdown={result.riskReports.safe} />
              </div>
              <div className="card">
                <h3>⚖️ 中立派</h3>
                <MarkdownView markdown={result.riskReports.neutral} />
              </div>
            </div>
            <div className="judge-box">
              <h3>风控法官</h3>
              <MarkdownView markdown={result.riskReports.judge} />
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
