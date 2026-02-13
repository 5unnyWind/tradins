import { normalizeAnalysisInput } from "@/lib/config";
import { saveRecord } from "@/lib/db";
import { resolveFinalRecommendation, runTradinsAnalysis } from "@/lib/engine";
import {
  computeNextRunAt,
  getSchedulerTask,
  listDueSchedulerTasks,
  saveSchedulerTaskRunResult,
} from "@/lib/scheduler-db";
import type { SchedulerTask } from "@/lib/types";

export interface SchedulerRunResult {
  taskId: number;
  taskName: string;
  ok: boolean;
  recordId: number | null;
  message: string;
}

async function runTask(task: SchedulerTask, force = false): Promise<SchedulerRunResult> {
  if (!task.enabled && !force) {
    return {
      taskId: task.id,
      taskName: task.name,
      ok: false,
      recordId: null,
      message: "任务已禁用，已跳过执行",
    };
  }

  const ranAt = new Date().toISOString();
  const nextRunAt = task.enabled ? computeNextRunAt(task.intervalMinutes, new Date(ranAt)) : null;
  const input = normalizeAnalysisInput({
    symbol: task.symbol,
    analysisMode: task.analysisMode,
    debateRounds: task.debateRounds,
    period: task.period,
    interval: task.interval,
  });

  try {
    const result = await runTradinsAnalysis(input);
    const saved = await saveRecord(input, result);
    const recommendation = resolveFinalRecommendation(result);
    const message = `执行成功，记录 #${saved.id}${recommendation ? `，建议: ${recommendation}` : ""}`;
    await saveSchedulerTaskRunResult({
      id: task.id,
      status: "success",
      message,
      nextRunAt,
      ranAt,
    });
    return {
      taskId: task.id,
      taskName: task.name,
      ok: true,
      recordId: saved.id,
      message,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await saveSchedulerTaskRunResult({
      id: task.id,
      status: "failed",
      message,
      nextRunAt,
      ranAt,
    });
    return {
      taskId: task.id,
      taskName: task.name,
      ok: false,
      recordId: null,
      message,
    };
  }
}

export async function runSchedulerTaskById(id: number, force = true): Promise<SchedulerRunResult | null> {
  const task = await getSchedulerTask(id);
  if (!task) return null;
  return runTask(task, force);
}

export async function runDueSchedulerTasks(limit = 3): Promise<SchedulerRunResult[]> {
  const due = await listDueSchedulerTasks(new Date(), limit);
  const results: SchedulerRunResult[] = [];
  for (const task of due) {
    results.push(await runTask(task, false));
  }
  return results;
}
