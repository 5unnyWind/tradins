import OpenAI from "openai";

import { getLLMConfig } from "@/lib/config";

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set([
  "ECONNABORTED",
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readHeader(headers: unknown, name: string): string | null {
  if (!headers) return null;
  if (typeof headers === "object" && headers !== null) {
    const get = (headers as { get?: (key: string) => string | null }).get;
    if (typeof get === "function") {
      return get(name);
    }
    const record = headers as Record<string, unknown>;
    const hit = record[name] ?? record[name.toLowerCase()] ?? record[name.toUpperCase()];
    return typeof hit === "string" ? hit : null;
  }
  return null;
}

function getRetryAfterMs(error: unknown): number | null {
  const headers = (error as { headers?: unknown })?.headers;
  const retryAfterRaw = readHeader(headers, "retry-after");
  if (!retryAfterRaw) return null;
  const seconds = Number(retryAfterRaw);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const ts = Date.parse(retryAfterRaw);
  if (Number.isNaN(ts)) return null;
  return Math.max(0, ts - Date.now());
}

function getErrorStatus(error: unknown): number | null {
  const status = (error as { status?: unknown })?.status;
  if (typeof status === "number" && Number.isFinite(status)) return status;
  return null;
}

function getErrorCode(error: unknown): string | null {
  const code = (error as { code?: unknown })?.code;
  if (typeof code === "string" && code) return code.toUpperCase();
  return null;
}

function isRetryableError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status !== null && RETRYABLE_STATUS.has(status)) return true;

  const code = getErrorCode(error);
  if (code && RETRYABLE_ERROR_CODES.has(code)) return true;

  const name = (error as { name?: unknown })?.name;
  if (typeof name === "string") {
    const n = name.toLowerCase();
    if (n.includes("timeout") || n.includes("connection") || n.includes("rate")) return true;
  }

  const message = (error as { message?: unknown })?.message;
  if (typeof message === "string") {
    const m = message.toLowerCase();
    if (
      m.includes("rate limit") ||
      m.includes("timeout") ||
      m.includes("temporarily unavailable") ||
      m.includes("network") ||
      m.includes("fetch failed")
    ) {
      return true;
    }
  }
  return false;
}

function backoffDelayMs(attempt: number, baseMs: number, maxMs: number, error: unknown): number {
  const expo = baseMs * 2 ** attempt;
  const jitter = Math.floor(Math.random() * baseMs);
  const computed = Math.min(maxMs, expo + jitter);
  const retryAfter = getRetryAfterMs(error);
  if (retryAfter === null) return computed;
  return Math.min(maxMs, Math.max(computed, retryAfter));
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

export async function llmComplete(systemPrompt: string, userPrompt: string): Promise<string> {
  const cfg = getLLMConfig();
  if (!cfg.apiKey) {
    throw new Error("LLM disabled: missing TRADINS_API_KEY.");
  }
  const client = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl,
    maxRetries: 0,
  });
  const totalAttempts = cfg.maxRetries + 1;

  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    try {
      const completion = await client.chat.completions.create({
        model: cfg.model,
        temperature: cfg.temperature,
        max_tokens: cfg.maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });
      const content = completion.choices[0]?.message?.content?.trim();
      if (!content) throw new Error("LLM returned empty content.");
      return content;
    } catch (error) {
      const isLastAttempt = attempt >= totalAttempts - 1;
      if (isLastAttempt || !isRetryableError(error)) {
        throw new Error(`LLM request failed after ${attempt + 1} attempt(s): ${describeError(error)}`);
      }
      const delayMs = backoffDelayMs(attempt, cfg.retryBaseDelayMs, cfg.retryMaxDelayMs, error);
      const status = getErrorStatus(error);
      const statusText = status === null ? "" : ` status=${status}`;
      console.warn(
        `[LLM] attempt ${attempt + 1}/${totalAttempts} failed${statusText}; retrying in ${delayMs}ms`,
      );
      await sleep(delayMs);
    }
  }

  throw new Error(`LLM request failed after ${totalAttempts} attempt(s).`);
}
