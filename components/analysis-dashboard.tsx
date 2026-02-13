"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, type UIEvent } from "react";
import useSWRInfinite from "swr/infinite";

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

const RECORD_PAGE_SIZE = 10;

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
  initialHasMore: boolean;
}

type RecordsPageResponse = {
  records: AnalysisRecordMeta[];
  storage: "vercel_postgres" | "memory";
  hasMore: boolean;
  nextCursor: number | null;
};

type AnalyzeProgressPayload = {
  message?: string;
  step?: number;
  totalSteps?: number;
};

type ArtifactType = "analyst" | "debate" | "plan" | "risk";

type AnalyzeArtifactPayload = {
  type?: "artifact";
  artifactType?: ArtifactType;
  title?: string;
  markdown?: string;
  key?: "market" | "fundamentals" | "news" | "social";
  roundId?: number;
  side?: "bull" | "bear" | "risky" | "safe" | "neutral" | "judge";
};

type AnalyzeErrorResponse = {
  ok?: false;
  error?: string;
  storage?: "vercel_postgres" | "memory";
};

type ParsedSseFrame = {
  event: string;
  data: unknown;
};

type StreamArtifactItem = {
  id: string;
  title: string;
  markdown: string;
  meta: string;
};

type QuickJumpTarget = {
  id: string;
  label: string;
};

function parseSseFrame(frame: string): ParsedSseFrame | null {
  const lines = frame.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (!dataLines.length) return null;
  const rawData = dataLines.join("\n");
  try {
    return { event, data: JSON.parse(rawData) };
  } catch {
    return { event, data: { message: rawData } };
  }
}

function toProgressText(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as AnalyzeProgressPayload;
  if (!payload.message) return null;
  const step = Number(payload.step);
  const total = Number(payload.totalSteps);
  if (Number.isFinite(step) && Number.isFinite(total) && step > 0 && total > 0) {
    return `[${step}/${total}] ${payload.message}`;
  }
  return payload.message;
}

function toArtifactItem(data: unknown): StreamArtifactItem | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as AnalyzeArtifactPayload;
  if (!payload.markdown || typeof payload.markdown !== "string") return null;
  const markdown = payload.markdown.trim();
  if (!markdown) return null;

  const title = typeof payload.title === "string" && payload.title.trim()
    ? payload.title.trim()
    : "实时产物";

  const metaParts: string[] = [];
  if (typeof payload.artifactType === "string") {
    const labelMap: Record<ArtifactType, string> = {
      analyst: "分析师",
      debate: "辩论",
      plan: "交易计划",
      risk: "风控",
    };
    metaParts.push(labelMap[payload.artifactType] ?? payload.artifactType);
  }
  if (Number.isInteger(payload.roundId) && Number(payload.roundId) > 0) {
    metaParts.push(`第 ${payload.roundId} 轮`);
  }
  if (typeof payload.side === "string") {
    const sideMap: Record<NonNullable<AnalyzeArtifactPayload["side"]>, string> = {
      bull: "多头",
      bear: "空头",
      risky: "激进派",
      safe: "保守派",
      neutral: "中立派",
      judge: "法官",
    };
    metaParts.push(sideMap[payload.side] ?? payload.side);
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title,
    markdown,
    meta: metaParts.join(" · "),
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  const raw = await response.text();
  if (!raw) return `HTTP ${response.status}`;
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    if (parsed.error) return parsed.error;
  } catch {}
  return raw;
}

export function AnalysisDashboard({
  initialRecords,
  initialStorageMode,
  initialHasMore,
}: DashboardProps) {
  const [symbol, setSymbol] = useState("AAPL");
  const [analysisMode, setAnalysisMode] = useState<"quick" | "standard" | "deep">("standard");
  const [debateRounds, setDebateRounds] = useState("");
  const [period, setPeriod] = useState("6mo");
  const [interval, setInterval] = useState("1d");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [status, setStatus] = useState("");
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [streamArtifacts, setStreamArtifacts] = useState<StreamArtifactItem[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [storageMode, setStorageMode] = useState<"vercel_postgres" | "memory">(initialStorageMode);

  const initialPage: RecordsPageResponse = {
    records: initialRecords,
    storage: initialStorageMode,
    hasMore: initialHasMore,
    nextCursor: initialHasMore && initialRecords.length ? initialRecords[initialRecords.length - 1]?.id ?? null : null,
  };

  const {
    data: recordPages,
    size,
    setSize,
    mutate: mutateRecords,
    isValidating: isValidatingRecords,
  } = useSWRInfinite<RecordsPageResponse>(
    (pageIndex, previousPageData) => {
      if (pageIndex === 0) return `/api/records?limit=${RECORD_PAGE_SIZE}`;
      if (!previousPageData?.hasMore || !previousPageData.nextCursor) return null;
      return `/api/records?limit=${RECORD_PAGE_SIZE}&cursor=${previousPageData.nextCursor}`;
    },
    fetcher,
    {
      fallbackData: [initialPage],
      revalidateFirstPage: false,
      revalidateOnFocus: false,
    },
  );

  const pages = recordPages ?? [initialPage];
  const records = pages.flatMap((page) => page.records);
  const recordsHasMore = pages[pages.length - 1]?.hasMore ?? false;
  const isLoadingMoreRecords = isValidatingRecords && size > pages.length;

  const chartData = useMemo(() => {
    const bars = result?.stageBundle.market.recentBars ?? {};
    const entries = Object.entries(bars).sort((a, b) => a[0].localeCompare(b[0]));
    return {
      labels: entries.map(([k]) => k),
      values: entries.map(([, v]) => Number(v.Close ?? 0)),
    };
  }, [result]);

  const quickJumpTargets = useMemo<QuickJumpTarget[]>(() => {
    const targets: QuickJumpTarget[] = [
      { id: "section-flow", label: "数据流图" },
      { id: "section-stream", label: "实时分析产物" },
    ];
    if (!result) return targets;
    targets.push(
      { id: "section-market-snapshot", label: "市场快照" },
      { id: "section-preliminary-plan", label: "交易计划" },
      { id: "section-analysts", label: "四位分析师" },
      { id: "section-debates", label: "多空辩论" },
    );
    for (const turn of result.debates) {
      targets.push({
        id: `section-debate-round-${turn.roundId}`,
        label: `第 ${turn.roundId} 轮辩论`,
      });
    }
    targets.push({ id: "section-risk", label: "风控内阁" });
    return targets;
  }, [result]);

  function pushStatusLine(line: string) {
    setStatus(line);
    setStatusLog((prev) => {
      if (prev[0] === line) return prev;
      return [line, ...prev].slice(0, 8);
    });
  }

  function jumpToSection(targetId: string) {
    const element = document.getElementById(targetId);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function loadMoreRecords() {
    if (!recordsHasMore || isLoadingMoreRecords) return;
    void setSize((current) => current + 1);
  }

  function onRecordListScroll(event: UIEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    const nearBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 80;
    if (nearBottom) loadMoreRecords();
  }

  async function runAnalysis() {
    setIsAnalyzing(true);
    setStatusLog([]);
    setStreamArtifacts([]);
    pushStatusLine("正在建立流式连接...");

    const payload: Record<string, unknown> = {
      symbol: symbol.trim().toUpperCase(),
      analysisMode,
      period: period.trim(),
      interval: interval.trim(),
    };
    if (debateRounds.trim()) payload.debateRounds = Number(debateRounds.trim());

    try {
      const response = await fetch("/api/analyze/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      if (!response.body) {
        throw new Error("当前环境不支持流式读取响应体");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let donePayload: Record<string, unknown> | null = null;

      const consumeFrame = (frame: string): Record<string, unknown> | null => {
        const parsed = parseSseFrame(frame);
        if (!parsed || parsed.event === "ping" || parsed.event === "end") return null;

        if (parsed.event === "status" || parsed.event === "progress") {
          const line = toProgressText(parsed.data);
          if (line) pushStatusLine(line);
          return null;
        }

        if (parsed.event === "artifact") {
          const artifact = toArtifactItem(parsed.data);
          if (artifact) {
            setStreamArtifacts((prev) => [artifact, ...prev].slice(0, 30));
          }
          return null;
        }

        if (parsed.event === "done") {
          if (!parsed.data || typeof parsed.data !== "object") {
            throw new Error("分析完成事件格式不正确");
          }
          return parsed.data as Record<string, unknown>;
        }

        if (parsed.event === "error") {
          const errorPayload = parsed.data as AnalyzeErrorResponse;
          throw new Error(errorPayload.error ?? "分析失败");
        }
        return null;
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const parsedDone = consumeFrame(frame);
          if (parsedDone) donePayload = parsedDone;
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        for (const frame of buffer.split("\n\n")) {
          if (!frame.trim()) continue;
          const parsedDone = consumeFrame(frame);
          if (parsedDone) donePayload = parsedDone;
        }
      }

      if (!donePayload) {
        throw new Error("分析中断：未收到最终结果");
      }

      const finalResult = donePayload.result as AnalysisResult | undefined;
      if (!finalResult || typeof finalResult !== "object") {
        throw new Error("分析中断：返回结果为空");
      }

      const finalStorage = donePayload.storage === "memory" ? "memory" : "vercel_postgres";
      const finalRecordId = Number(donePayload.recordId);
      if (!Number.isInteger(finalRecordId) || finalRecordId <= 0) {
        throw new Error("分析中断：返回记录 ID 非法");
      }

      setResult(finalResult);
      setStorageMode(finalStorage);
      pushStatusLine(`分析完成，记录 ID: ${finalRecordId}`);

      await setSize(1);
      await mutateRecords();
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function loadRecord(id: number) {
    pushStatusLine(`正在加载记录 #${id} ...`);
    const response = await fetch(`/api/records/${id}`, { cache: "no-store" });
    const json = await response.json();
    if (!response.ok || !json.ok) {
      throw new Error(json.error ?? `HTTP ${response.status}`);
    }
    setResult(json.record.result);
    pushStatusLine(`已加载记录 #${id}`);
  }

  return (
    <main className="shell">
      <div className="bg-orb orb-a" />
      <div className="bg-orb orb-b" />

      <div className="dashboard-layout">
        <aside
          className={`panel records-sidebar records-drawer${isSidebarOpen ? " is-open" : ""}`}
          id="records-drawer"
          aria-hidden={!isSidebarOpen}
        >
          <div className="panel-header records-sidebar-header">
            <h2>分析记录</h2>
            <span className="records-sidebar-meta">
              {records.length} 条{recordsHasMore ? " · 下滑加载" : ""}
            </span>
          </div>
          <div className="record-list records-scroll" id="records-scroll" onScroll={onRecordListScroll}>
            {records.map((record) => (
              <button
                type="button"
                className="record-item"
                key={record.id}
                onClick={() => {
                  if (window.matchMedia("(max-width: 1080px)").matches) {
                    setIsSidebarOpen(false);
                  }
                  loadRecord(record.id).catch((err) =>
                    pushStatusLine(`加载失败: ${err instanceof Error ? err.message : String(err)}`),
                  );
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
            {isLoadingMoreRecords ? <div className="empty-state">加载更多中...</div> : null}
            {!recordsHasMore && records.length ? <div className="empty-state">已加载全部记录</div> : null}
          </div>
        </aside>
        <button
          type="button"
          className={`records-drawer-toggle${isSidebarOpen ? " is-open" : ""}`}
          aria-expanded={isSidebarOpen}
          aria-controls="records-drawer"
          onClick={() => setIsSidebarOpen((prev) => !prev)}
        >
          {isSidebarOpen ? "收起记录" : "展开记录"}
        </button>
        {isSidebarOpen ? (
          <button
            type="button"
            className="records-drawer-backdrop"
            aria-label="关闭记录侧边栏"
            onClick={() => setIsSidebarOpen(false)}
          />
        ) : null}

        <div className="dashboard-main">
          <section className="hero">
            <div className="hero-copy">
              <p className="eyebrow">tradins on next.js + vercel</p>
              <h1>Tradins 金融分析 Agengs-Team</h1>
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
                runAnalysis().catch((err) => {
                  const message = `分析失败: ${err instanceof Error ? err.message : String(err)}`;
                  pushStatusLine(message);
                });
              }}
            >
              <label>
                股票代码
                <input
                  name="symbol"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  inputMode="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder="AAPL / 0700.HK / 600519.SS"
                />
              </label>
              <label>
                分析模式
                <select
                  name="analysisMode"
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
                <input
                  name="debateRounds"
                  type="number"
                  min={1}
                  max={10}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  value={debateRounds}
                  onChange={(e) => setDebateRounds(e.target.value)}
                  placeholder="1-10"
                />
              </label>
              <label>
                K线周期
                <input
                  name="period"
                  autoComplete="off"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                />
              </label>
              <label>
                K线粒度
                <input
                  name="interval"
                  autoComplete="off"
                  value={interval}
                  onChange={(e) => setInterval(e.target.value)}
                />
              </label>
              <button type="submit" disabled={isAnalyzing}>
                {isAnalyzing ? "分析中..." : "开始分析"}
              </button>
              <p className="status" aria-live="polite">
                {status}
              </p>
              {statusLog.length ? (
                <div className="status-log">
                  {statusLog.map((line, index) => (
                    <p key={`${index}-${line}`}>{line}</p>
                  ))}
                </div>
              ) : null}
            </form>
          </section>

          <section className="panel anchor-target" id="section-flow">
            <h2>数据流图</h2>
            {result ? <MermaidView code={result.graphMermaid} /> : <div className="empty-state">先运行一次分析</div>}
          </section>

          <section className="panel anchor-target" id="section-stream">
            <div className="panel-header">
              <h2>实时分析产物</h2>
              <span>{streamArtifacts.length ? `${streamArtifacts.length} 条` : "等待产物"}</span>
            </div>
            <div className="artifact-stream-list">
              {streamArtifacts.length ? (
                streamArtifacts.map((item) => (
                  <article className="artifact-stream-item" key={item.id}>
                    <div className="artifact-stream-head">
                      <strong>{item.title}</strong>
                      <span>{item.meta || "实时输出"}</span>
                    </div>
                    <MarkdownView markdown={item.markdown} />
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  {isAnalyzing ? "分析进行中，产物会实时显示在这里" : "开始分析后，这里会显示每一轮产物"}
                </div>
              )}
            </div>
          </section>

          {result ? (
            <>
              <section className="grid cols-2">
                <article className="panel anchor-target" id="section-market-snapshot">
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

                <article className="panel anchor-target" id="section-preliminary-plan">
                  <h2>研究主管初步交易计划</h2>
                  <MarkdownView markdown={result.preliminaryPlan} />
                </article>
              </section>

              <section className="panel anchor-target" id="section-analysts">
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

              <section className="panel anchor-target" id="section-debates">
                <h2>多空辩论</h2>
                <div className="timeline">
                  {result.debates.map((turn) => (
                    <article
                      className="turn anchor-target"
                      id={`section-debate-round-${turn.roundId}`}
                      key={turn.roundId}
                    >
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

              <section className="panel anchor-target" id="section-risk">
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
        </div>
      </div>

      <nav className="quick-nav-dock" role="navigation" aria-label="分析区块快速定位">
        <div className="quick-nav-rail">
          {quickJumpTargets.map((target) => (
            <button
              key={target.id}
              type="button"
              className="quick-nav-pill"
              onClick={() => jumpToSection(target.id)}
            >
              {target.label}
            </button>
          ))}
          <button
            type="button"
            className="quick-nav-pill quick-nav-pill-top"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            回到顶部
          </button>
        </div>
      </nav>
    </main>
  );
}
