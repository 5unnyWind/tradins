"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { SchedulerTask } from "@/lib/types";

const NO_CACHE_HEADERS: HeadersInit = {
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

type AuthMeResponse = {
  ok?: boolean;
  configured?: boolean;
  authenticated?: boolean;
  error?: string;
};

type TasksResponse = {
  ok?: boolean;
  tasks?: SchedulerTask[];
  error?: string;
};

type TaskResponse = {
  ok?: boolean;
  task?: SchedulerTask;
  error?: string;
};

type RunResponse = {
  ok?: boolean;
  result?: {
    taskId: number;
    taskName: string;
    ok: boolean;
    recordId: number | null;
    message: string;
  };
  error?: string;
};

function fmtTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

async function readError(response: Response): Promise<string> {
  const raw = await response.text();
  if (!raw) return `HTTP ${response.status}`;
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    if (parsed.error) return parsed.error;
  } catch {}
  return raw;
}

export function SchedulerDashboard() {
  const [configured, setConfigured] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [password, setPassword] = useState("");
  const [tasks, setTasks] = useState<SchedulerTask[]>([]);
  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("AAPL");
  const [analysisMode, setAnalysisMode] = useState<"quick" | "standard" | "deep">("standard");
  const [debateRounds, setDebateRounds] = useState("2");
  const [period, setPeriod] = useState("6mo");
  const [interval, setInterval] = useState("1d");
  const [intervalMinutes, setIntervalMinutes] = useState("60");
  const [enabled, setEnabled] = useState(true);

  const activeCount = useMemo(() => tasks.filter((task) => task.enabled).length, [tasks]);

  const loadAuth = useCallback(async () => {
    setCheckingAuth(true);
    try {
      const response = await fetch(`/api/scheduler/auth/me?_=${Date.now()}`, {
        cache: "no-store",
        headers: NO_CACHE_HEADERS,
      });
      const data = (await response.json()) as AuthMeResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      setConfigured(Boolean(data.configured));
      setAuthenticated(Boolean(data.authenticated));
    } catch (error) {
      setConfigured(false);
      setAuthenticated(false);
      setStatus(`鉴权检查失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCheckingAuth(false);
    }
  }, []);

  const loadTasks = useCallback(async () => {
    setLoadingTasks(true);
    try {
      const response = await fetch(`/api/scheduler/tasks?_=${Date.now()}`, {
        cache: "no-store",
        headers: NO_CACHE_HEADERS,
      });
      const data = (await response.json()) as TasksResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
    } catch (error) {
      setStatus(`加载任务失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoadingTasks(false);
    }
  }, []);

  useEffect(() => {
    void loadAuth();
  }, [loadAuth]);

  useEffect(() => {
    if (!authenticated) return;
    void loadTasks();
  }, [authenticated, loadTasks]);

  async function onLoginSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setStatus("");
    try {
      const response = await fetch("/api/scheduler/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      setPassword("");
      setAuthenticated(true);
      setStatus("登录成功");
      await loadTasks();
    } catch (error) {
      setStatus(`登录失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function onLogout() {
    setSubmitting(true);
    try {
      await fetch("/api/scheduler/auth/logout", {
        method: "POST",
        headers: NO_CACHE_HEADERS,
      });
    } finally {
      setSubmitting(false);
      setAuthenticated(false);
      setTasks([]);
      setStatus("已退出登录");
    }
  }

  async function onCreateTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setStatus("");
    try {
      const rounds = Number(debateRounds);
      const intervalMins = Number(intervalMinutes);
      if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) {
        throw new Error("辩论轮次需为 1-10 的整数");
      }
      if (!Number.isInteger(intervalMins) || intervalMins < 1 || intervalMins > 10080) {
        throw new Error("执行间隔需为 1-10080 分钟");
      }
      const response = await fetch("/api/scheduler/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || `${symbol.trim().toUpperCase()} ${intervalMins}m`,
          symbol: symbol.trim().toUpperCase(),
          analysisMode,
          debateRounds: rounds,
          period: period.trim(),
          interval: interval.trim(),
          intervalMinutes: intervalMins,
          enabled,
        }),
      });
      const data = (await response.json()) as TaskResponse;
      if (!response.ok || !data.ok || !data.task) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      setTasks((prev) => [data.task as SchedulerTask, ...prev.filter((task) => task.id !== data.task?.id)]);
      setName("");
      setStatus(`任务已创建: ${data.task.name}`);
    } catch (error) {
      setStatus(`创建失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleTask(task: SchedulerTask) {
    setBusyTaskId(task.id);
    setStatus("");
    try {
      const response = await fetch(`/api/scheduler/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !task.enabled }),
      });
      const data = (await response.json()) as TaskResponse;
      if (!response.ok || !data.ok || !data.task) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      setTasks((prev) => prev.map((item) => (item.id === task.id ? (data.task as SchedulerTask) : item)));
      setStatus(`${task.name} 已${data.task.enabled ? "启用" : "停用"}`);
    } catch (error) {
      setStatus(`更新失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyTaskId(null);
    }
  }

  async function runNow(task: SchedulerTask) {
    setBusyTaskId(task.id);
    setStatus("");
    try {
      const response = await fetch(`/api/scheduler/tasks/${task.id}/run`, {
        method: "POST",
        headers: NO_CACHE_HEADERS,
      });
      const data = (await response.json()) as RunResponse;
      if (!response.ok || !data.ok || !data.result) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      setStatus(`${task.name}: ${data.result.message}`);
      await loadTasks();
    } catch (error) {
      setStatus(`执行失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyTaskId(null);
    }
  }

  async function removeTask(task: SchedulerTask) {
    const confirmed = window.confirm(`确认删除任务「${task.name}」？`);
    if (!confirmed) return;
    setBusyTaskId(task.id);
    setStatus("");
    try {
      const response = await fetch(`/api/scheduler/tasks/${task.id}`, {
        method: "DELETE",
        headers: NO_CACHE_HEADERS,
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      setTasks((prev) => prev.filter((item) => item.id !== task.id));
      setStatus(`已删除任务: ${task.name}`);
    } catch (error) {
      setStatus(`删除失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyTaskId(null);
    }
  }

  return (
    <main className="scheduler-shell">
      <section className="panel scheduler-head">
        <div>
          <p className="eyebrow">scheduler console</p>
          <h1>定时任务管理</h1>
          <p>用于配置、管理、查看自动分析任务。任务会按“执行间隔（分钟）”循环执行并写入分析记录。</p>
        </div>
        <div className="scheduler-head-actions">
          <a className="scheduler-link-button" href="/">
            返回分析页
          </a>
          {authenticated ? (
            <button type="button" onClick={onLogout} disabled={submitting}>
              退出登录
            </button>
          ) : null}
        </div>
      </section>

      {status ? <p className="status">{status}</p> : null}

      {!configured ? (
        <section className="panel">
          <h2>未配置登录密码</h2>
          <p className="scheduler-muted">
            请在环境变量中设置 `SCHEDULER_ADMIN_PASSWORD` 与 `SCHEDULER_AUTH_SECRET` 后刷新页面。
          </p>
        </section>
      ) : null}

      {configured && checkingAuth ? (
        <section className="panel">
          <p className="scheduler-muted">正在检查登录状态...</p>
        </section>
      ) : null}

      {configured && !checkingAuth && !authenticated ? (
        <section className="panel scheduler-login-panel">
          <h2>密码登录</h2>
          <form className="scheduler-login-form" onSubmit={onLoginSubmit}>
            <label>
              管理密码
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="输入定时任务管理密码"
              />
            </label>
            <button type="submit" disabled={submitting || !password.trim()}>
              {submitting ? "登录中..." : "登录"}
            </button>
          </form>
        </section>
      ) : null}

      {configured && authenticated ? (
        <section className="scheduler-layout">
          <form className="panel scheduler-form" onSubmit={onCreateTask}>
            <div className="panel-header">
              <h2>新建任务</h2>
              <span>{activeCount}/{tasks.length} 已启用</span>
            </div>
            <label>
              任务名
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：AAPL 每小时分析"
              />
            </label>
            <label>
              股票代码
              <input
                value={symbol}
                onChange={(event) => setSymbol(event.target.value)}
                placeholder="AAPL / 0700.HK / 600519.SS / 000001.SZ"
              />
            </label>
            <label>
              分析模式
              <select
                value={analysisMode}
                onChange={(event) => setAnalysisMode(event.target.value as "quick" | "standard" | "deep")}
              >
                <option value="quick">quick</option>
                <option value="standard">standard</option>
                <option value="deep">deep</option>
              </select>
            </label>
            <label>
              辩论轮次
              <input
                type="number"
                min={1}
                max={10}
                value={debateRounds}
                onChange={(event) => setDebateRounds(event.target.value)}
              />
            </label>
            <label>
              K线周期
              <input value={period} onChange={(event) => setPeriod(event.target.value)} />
            </label>
            <label>
              K线粒度
              <input value={interval} onChange={(event) => setInterval(event.target.value)} />
            </label>
            <label>
              执行间隔（分钟）
              <input
                type="number"
                min={1}
                max={10080}
                value={intervalMinutes}
                onChange={(event) => setIntervalMinutes(event.target.value)}
              />
            </label>
            <label className="scheduler-switch">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
              />
              创建后立即启用
            </label>
            <button type="submit" disabled={submitting}>
              {submitting ? "创建中..." : "创建任务"}
            </button>
          </form>

          <section className="panel scheduler-tasks">
            <div className="panel-header">
              <h2>任务列表</h2>
              <button type="button" onClick={() => void loadTasks()} disabled={loadingTasks}>
                {loadingTasks ? "刷新中..." : "刷新"}
              </button>
            </div>
            {!tasks.length ? <p className="scheduler-muted">暂无任务</p> : null}
            <div className="scheduler-task-list">
              {tasks.map((task) => {
                const busy = busyTaskId === task.id;
                return (
                  <article key={task.id} className="scheduler-task-card">
                    <header>
                      <div>
                        <h3>{task.name}</h3>
                        <p className="scheduler-task-meta">
                          #{task.id} · {task.symbol} · {task.analysisMode} · {task.debateRounds} 轮
                        </p>
                      </div>
                      <span className={`scheduler-badge ${task.enabled ? "is-on" : "is-off"}`}>
                        {task.enabled ? "启用中" : "已停用"}
                      </span>
                    </header>
                    <p className="scheduler-task-meta">
                      周期: {task.period} / {task.interval} · 间隔: {task.intervalMinutes} 分钟
                    </p>
                    <p className="scheduler-task-meta">下次执行: {fmtTime(task.nextRunAt)}</p>
                    <p className="scheduler-task-meta">
                      上次执行: {fmtTime(task.lastRunAt)} · 状态: {task.lastRunStatus}
                    </p>
                    {task.lastRunMessage ? (
                      <p className="scheduler-task-message">{task.lastRunMessage}</p>
                    ) : null}
                    <div className="scheduler-task-actions">
                      <button type="button" onClick={() => void toggleTask(task)} disabled={busy}>
                        {task.enabled ? "停用" : "启用"}
                      </button>
                      <button type="button" onClick={() => void runNow(task)} disabled={busy}>
                        立即执行
                      </button>
                      <button
                        type="button"
                        className="scheduler-danger"
                        onClick={() => void removeTask(task)}
                        disabled={busy}
                      >
                        删除
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </section>
      ) : null}
    </main>
  );
}
