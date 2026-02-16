import { fetchProImpactForGoods } from "@/lib/data/pro-events";
import { fetchValveImpactForGoods } from "@/lib/data/valve-updates";
import {
  getIntelRunState,
  intelStorageMode,
  saveIntelRunState,
  type IntelEventInput,
  type IntelImpactInput,
  type IntelProvider,
  upsertIntelEvents,
  upsertIntelImpacts,
} from "@/lib/intel-db";

type BuffCurrency = "CNY" | "USD";

const PIPELINE_JOB_KEY = "intel:pipeline";
const DEFAULT_GOODS_IDS = [35263];

export interface RunIntelPipelineOptions {
  force?: boolean;
  goodsIds?: number[];
  providers?: IntelProvider[];
  days?: number;
  eventLimit?: number;
  timeoutMs?: number;
  currency?: BuffCurrency;
  requestCookie?: string | null;
  requestCsrfToken?: string | null;
}

export interface IntelPipelineJobResult {
  provider: IntelProvider;
  goodsId: number;
  status: "success" | "failed" | "skipped";
  ok: boolean;
  jobKey: string;
  startedAt: string;
  finishedAt: string;
  eventsStored: number;
  impactsStored: number;
  message: string;
  warnings: string[];
}

export interface IntelPipelineRunResult {
  ok: boolean;
  skipped: boolean;
  reason: string | null;
  startedAt: string;
  finishedAt: string;
  storage: "vercel_postgres" | "local";
  force: boolean;
  providers: IntelProvider[];
  goodsIds: number[];
  config: {
    days: number;
    eventLimit: number;
    timeoutMs: number;
    currency: BuffCurrency;
    concurrency: number;
    intervalMinutes: Record<IntelProvider, number>;
  };
  counts: {
    totalJobs: number;
    success: number;
    failed: number;
    skipped: number;
    eventsStored: number;
    impactsStored: number;
  };
  results: IntelPipelineJobResult[];
}

interface ResolvedPipelineConfig {
  enabled: boolean;
  force: boolean;
  providers: IntelProvider[];
  goodsIds: number[];
  days: number;
  eventLimit: number;
  timeoutMs: number;
  currency: BuffCurrency;
  concurrency: number;
  intervalMinutes: Record<IntelProvider, number>;
  requestCookie?: string | null;
  requestCsrfToken?: string | null;
}

interface JobPlan {
  provider: IntelProvider;
  goodsId: number;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  return clampInt(Number(value), min, max);
}

function parseCurrency(value: string | undefined): BuffCurrency | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "CNY" || normalized === "USD") return normalized;
  return null;
}

function normalizeProviders(values: Array<string | IntelProvider>): IntelProvider[] {
  const normalized = values
    .map((value) => String(value).trim().toLowerCase())
    .filter((value): value is IntelProvider => value === "valve" || value === "pro");
  return [...new Set(normalized)];
}

function parseProviders(value: string | undefined): IntelProvider[] {
  if (!value) return [];
  return normalizeProviders(value.split(","));
}

function normalizeGoodsIds(values: number[]): number[] {
  const normalized = values
    .map((value) => clampInt(Number(value), 1, 1_000_000_000))
    .filter((value) => Number.isFinite(value) && value > 0);
  return [...new Set(normalized)];
}

function parseGoodsIds(value: string | undefined): number[] {
  if (!value) return [];
  return normalizeGoodsIds(
    value
      .split(",")
      .map((token) => Number(token.trim()))
      .filter((num) => Number.isFinite(num)),
  );
}

function resolvePipelineConfig(options: RunIntelPipelineOptions): ResolvedPipelineConfig {
  const envProviders = parseProviders(process.env.INTEL_PIPELINE_PROVIDERS);
  const providerSeed =
    options.providers !== undefined
      ? options.providers
      : envProviders.length
        ? envProviders
        : ["valve", "pro"];
  const providers = normalizeProviders(providerSeed);
  const envGoodsIds = parseGoodsIds(process.env.INTEL_GOODS_IDS);
  const goodsIds = normalizeGoodsIds(options.goodsIds ?? (envGoodsIds.length ? envGoodsIds : DEFAULT_GOODS_IDS));

  const days = clampInt(options.days ?? parseNumber(process.env.INTEL_DAYS, 30, 1, 120), 1, 120);
  const eventLimit = clampInt(options.eventLimit ?? parseNumber(process.env.INTEL_EVENT_LIMIT, 16, 1, 40), 1, 40);
  const timeoutMs = clampInt(options.timeoutMs ?? parseNumber(process.env.INTEL_TIMEOUT_MS, 12_000, 500, 20_000), 500, 20_000);
  const currency =
    options.currency ??
    parseCurrency(process.env.INTEL_CURRENCY) ??
    "CNY";
  const concurrency = clampInt(parseNumber(process.env.INTEL_PIPELINE_CONCURRENCY, 2, 1, 8), 1, 8);
  const intervalMinutes = {
    valve: clampInt(parseNumber(process.env.INTEL_VALVE_INTERVAL_MINUTES, 180, 1, 7 * 24 * 60), 1, 7 * 24 * 60),
    pro: clampInt(parseNumber(process.env.INTEL_PRO_INTERVAL_MINUTES, 180, 1, 7 * 24 * 60), 1, 7 * 24 * 60),
  } satisfies Record<IntelProvider, number>;

  return {
    enabled: parseBoolean(process.env.INTEL_PIPELINE_ENABLED, true),
    force: Boolean(options.force),
    providers: providers.length ? providers : ["valve", "pro"],
    goodsIds,
    days,
    eventLimit,
    timeoutMs,
    currency,
    concurrency,
    intervalMinutes,
    requestCookie: options.requestCookie,
    requestCsrfToken: options.requestCsrfToken,
  };
}

function buildJobKey(provider: IntelProvider, goodsId: number): string {
  return `intel:${provider}:goods:${goodsId}`;
}

function minutesSince(iso: string | null): number | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return null;
  return (Date.now() - ts) / 60_000;
}

async function shouldSkipJob(
  provider: IntelProvider,
  goodsId: number,
  intervalMinutes: number,
  force: boolean,
): Promise<{ skip: boolean; reason: string | null }> {
  if (force) return { skip: false, reason: null };
  const jobKey = buildJobKey(provider, goodsId);
  const state = await getIntelRunState(jobKey);
  const elapsed = minutesSince(state?.lastRanAt ?? null);
  if (elapsed === null) return { skip: false, reason: null };
  if (elapsed < intervalMinutes) {
    return {
      skip: true,
      reason: `距上次执行仅 ${elapsed.toFixed(1)} 分钟，小于间隔 ${intervalMinutes} 分钟`,
    };
  }
  return { skip: false, reason: null };
}

function mapValveEvents(result: Awaited<ReturnType<typeof fetchValveImpactForGoods>>): IntelEventInput[] {
  return result.events.map((event) => ({
    provider: "valve",
    eventId: event.id,
    eventTime: event.publishedAt,
    eventType: event.categories.join("|") || null,
    severity: event.severity,
    title: event.title,
    summary: event.summary || "",
    url: event.url,
    payload: {
      provider: "valve",
      goodsId: result.goodsId,
      categories: event.categories,
      tags: event.tags,
      severity: event.severity,
      direction: event.direction,
      impactScore: event.impactScore,
      returnsPct: event.returnsPct,
      sampledAt: event.sampledAt,
      baselinePrice: event.baselinePrice,
      baselineAt: event.baselineAt,
    },
    fetchedAt: result.fetchedAt,
  }));
}

function mapValveImpacts(result: Awaited<ReturnType<typeof fetchValveImpactForGoods>>): IntelImpactInput[] {
  return result.events.map((event) => ({
    provider: "valve",
    goodsId: result.goodsId,
    goodsName: null,
    eventId: event.id,
    eventTime: event.publishedAt,
    impactScore: event.impactScore,
    relevanceScore: null,
    direction: event.direction,
    returnH1: event.returnsPct.h1,
    returnH24: event.returnsPct.h24,
    returnH72: event.returnsPct.h72,
    payload: {
      provider: "valve",
      title: event.title,
      summary: event.summary,
      url: event.url,
      categories: event.categories,
      tags: event.tags,
      severity: event.severity,
      baselinePrice: event.baselinePrice,
      baselineAt: event.baselineAt,
      sampledAt: event.sampledAt,
    },
    fetchedAt: result.fetchedAt,
  }));
}

function mapProEvents(result: Awaited<ReturnType<typeof fetchProImpactForGoods>>): IntelEventInput[] {
  return result.events.map((event) => ({
    provider: "pro",
    eventId: event.id,
    eventTime: event.publishedAt,
    eventType: event.eventType,
    severity: event.severity,
    title: event.title,
    summary: event.summary || "",
    url: event.url,
    payload: {
      provider: "pro",
      goodsId: result.goodsId,
      goodsName: result.goodsName,
      eventType: event.eventType,
      severity: event.severity,
      players: event.players,
      keywords: event.keywords,
      direction: event.direction,
      relevanceScore: event.relevanceScore,
      impactScore: event.impactScore,
      returnsPct: event.returnsPct,
      sampledAt: event.sampledAt,
      baselinePrice: event.baselinePrice,
      baselineAt: event.baselineAt,
    },
    fetchedAt: result.fetchedAt,
  }));
}

function mapProImpacts(result: Awaited<ReturnType<typeof fetchProImpactForGoods>>): IntelImpactInput[] {
  return result.events.map((event) => ({
    provider: "pro",
    goodsId: result.goodsId,
    goodsName: result.goodsName,
    eventId: event.id,
    eventTime: event.publishedAt,
    impactScore: event.impactScore,
    relevanceScore: event.relevanceScore,
    direction: event.direction,
    returnH1: event.returnsPct.h1,
    returnH24: event.returnsPct.h24,
    returnH72: event.returnsPct.h72,
    payload: {
      provider: "pro",
      title: event.title,
      summary: event.summary,
      url: event.url,
      eventType: event.eventType,
      severity: event.severity,
      players: event.players,
      keywords: event.keywords,
      baselinePrice: event.baselinePrice,
      baselineAt: event.baselineAt,
      sampledAt: event.sampledAt,
    },
    fetchedAt: result.fetchedAt,
  }));
}

async function runJob(
  plan: JobPlan,
  config: ResolvedPipelineConfig,
): Promise<IntelPipelineJobResult> {
  const startedAt = new Date().toISOString();
  const finishedAtDefault = startedAt;
  const jobKey = buildJobKey(plan.provider, plan.goodsId);
  const skipCheck = await shouldSkipJob(
    plan.provider,
    plan.goodsId,
    config.intervalMinutes[plan.provider],
    config.force,
  );

  if (skipCheck.skip) {
    const message = skipCheck.reason ?? "命中执行间隔，已跳过";
    return {
      provider: plan.provider,
      goodsId: plan.goodsId,
      status: "skipped",
      ok: true,
      jobKey,
      startedAt,
      finishedAt: finishedAtDefault,
      eventsStored: 0,
      impactsStored: 0,
      message,
      warnings: [],
    };
  }

  try {
    if (plan.provider === "valve") {
      const result = await fetchValveImpactForGoods({
        goodsId: plan.goodsId,
        game: "csgo",
        days: config.days,
        currency: config.currency,
        eventLimit: config.eventLimit,
        timeoutMs: config.timeoutMs,
        requestCookie: config.requestCookie,
        requestCsrfToken: config.requestCsrfToken,
      });
      const events = mapValveEvents(result);
      const impacts = mapValveImpacts(result);
      const [eventsStored, impactsStored] = await Promise.all([
        upsertIntelEvents(events),
        upsertIntelImpacts(impacts),
      ]);
      const finishedAt = new Date().toISOString();
      const message = `valve goods_id=${plan.goodsId} 写入事件 ${eventsStored} 条，影响 ${impactsStored} 条`;
      await saveIntelRunState(jobKey, "success", message, finishedAt);
      return {
        provider: plan.provider,
        goodsId: plan.goodsId,
        status: "success",
        ok: true,
        jobKey,
        startedAt,
        finishedAt,
        eventsStored,
        impactsStored,
        message,
        warnings: result.warnings,
      };
    }

    const result = await fetchProImpactForGoods({
      goodsId: plan.goodsId,
      game: "csgo",
      days: config.days,
      currency: config.currency,
      eventLimit: config.eventLimit,
      timeoutMs: config.timeoutMs,
      requestCookie: config.requestCookie,
      requestCsrfToken: config.requestCsrfToken,
    });
    const events = mapProEvents(result);
    const impacts = mapProImpacts(result);
    const [eventsStored, impactsStored] = await Promise.all([
      upsertIntelEvents(events),
      upsertIntelImpacts(impacts),
    ]);
    const finishedAt = new Date().toISOString();
    const message = `pro goods_id=${plan.goodsId} 写入事件 ${eventsStored} 条，影响 ${impactsStored} 条`;
    await saveIntelRunState(jobKey, "success", message, finishedAt);
    return {
      provider: plan.provider,
      goodsId: plan.goodsId,
      status: "success",
      ok: true,
      jobKey,
      startedAt,
      finishedAt,
      eventsStored,
      impactsStored,
      message,
      warnings: result.warnings,
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    await saveIntelRunState(jobKey, "failed", message, finishedAt);
    return {
      provider: plan.provider,
      goodsId: plan.goodsId,
      status: "failed",
      ok: false,
      jobKey,
      startedAt,
      finishedAt,
      eventsStored: 0,
      impactsStored: 0,
      message,
      warnings: [],
    };
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];
  const maxWorkers = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const runWorker = async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      results[current] = await worker(items[current]);
    }
  };

  await Promise.all(Array.from({ length: maxWorkers }, () => runWorker()));
  return results;
}

function buildJobPlans(config: ResolvedPipelineConfig): JobPlan[] {
  const jobs: JobPlan[] = [];
  for (const provider of config.providers) {
    for (const goodsId of config.goodsIds) {
      jobs.push({ provider, goodsId });
    }
  }
  return jobs;
}

export async function runIntelPipeline(
  options: RunIntelPipelineOptions = {},
): Promise<IntelPipelineRunResult> {
  const startedAt = new Date().toISOString();
  const config = resolvePipelineConfig(options);
  const storage = intelStorageMode();

  if (!config.enabled) {
    const finishedAt = new Date().toISOString();
    const reason = "INTEL_PIPELINE_ENABLED=false，已跳过执行";
    return {
      ok: true,
      skipped: true,
      reason,
      startedAt,
      finishedAt,
      storage,
      force: config.force,
      providers: config.providers,
      goodsIds: config.goodsIds,
      config: {
        days: config.days,
        eventLimit: config.eventLimit,
        timeoutMs: config.timeoutMs,
        currency: config.currency,
        concurrency: config.concurrency,
        intervalMinutes: config.intervalMinutes,
      },
      counts: {
        totalJobs: 0,
        success: 0,
        failed: 0,
        skipped: 0,
        eventsStored: 0,
        impactsStored: 0,
      },
      results: [],
    };
  }

  if (!config.goodsIds.length) {
    const finishedAt = new Date().toISOString();
    const reason = "INTEL_GOODS_IDS 为空，未执行";
    return {
      ok: true,
      skipped: true,
      reason,
      startedAt,
      finishedAt,
      storage,
      force: config.force,
      providers: config.providers,
      goodsIds: [],
      config: {
        days: config.days,
        eventLimit: config.eventLimit,
        timeoutMs: config.timeoutMs,
        currency: config.currency,
        concurrency: config.concurrency,
        intervalMinutes: config.intervalMinutes,
      },
      counts: {
        totalJobs: 0,
        success: 0,
        failed: 0,
        skipped: 0,
        eventsStored: 0,
        impactsStored: 0,
      },
      results: [],
    };
  }

  const plans = buildJobPlans(config);
  const results = await runWithConcurrency(plans, config.concurrency, async (plan) => runJob(plan, config));

  const counts = results.reduce(
    (acc, item) => {
      if (item.status === "success") acc.success += 1;
      if (item.status === "failed") acc.failed += 1;
      if (item.status === "skipped") acc.skipped += 1;
      acc.eventsStored += item.eventsStored;
      acc.impactsStored += item.impactsStored;
      return acc;
    },
    {
      totalJobs: plans.length,
      success: 0,
      failed: 0,
      skipped: 0,
      eventsStored: 0,
      impactsStored: 0,
    },
  );

  const finishedAt = new Date().toISOString();
  const ok = counts.failed === 0;
  const summary = `jobs=${counts.totalJobs}, success=${counts.success}, failed=${counts.failed}, skipped=${counts.skipped}, events=${counts.eventsStored}, impacts=${counts.impactsStored}`;
  await saveIntelRunState(PIPELINE_JOB_KEY, ok ? "success" : "failed", summary, finishedAt);

  return {
    ok,
    skipped: false,
    reason: null,
    startedAt,
    finishedAt,
    storage,
    force: config.force,
    providers: config.providers,
    goodsIds: config.goodsIds,
    config: {
      days: config.days,
      eventLimit: config.eventLimit,
      timeoutMs: config.timeoutMs,
      currency: config.currency,
      concurrency: config.concurrency,
      intervalMinutes: config.intervalMinutes,
    },
    counts,
    results,
  };
}
