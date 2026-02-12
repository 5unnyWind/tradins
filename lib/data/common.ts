const POSITIVE_WORDS = new Set([
  "beat",
  "beats",
  "growth",
  "surge",
  "rally",
  "upside",
  "upgrade",
  "outperform",
  "record",
  "bullish",
  "buyback",
  "approval",
  "expansion",
  "strong",
  "improve",
  "获批",
  "增长",
  "超预期",
  "上调",
  "利好",
  "回购",
]);

const NEGATIVE_WORDS = new Set([
  "miss",
  "weak",
  "lawsuit",
  "downgrade",
  "probe",
  "decline",
  "drop",
  "selloff",
  "bearish",
  "cut",
  "warning",
  "fraud",
  "loss",
  "layoff",
  "recall",
  "investigation",
  "亏损",
  "下调",
  "诉讼",
  "利空",
  "裁员",
  "下滑",
]);

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "were",
  "have",
  "will",
  "stock",
  "shares",
  "company",
  "today",
  "said",
  "http",
  "https",
  "com",
]);

export function normalizeTokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z\u4e00-\u9fff]+/g) ?? []).filter(Boolean);
}

export function sentimentScore(text: string): number {
  const tokens = normalizeTokens(text);
  if (!tokens.length) return 0;
  const pos = tokens.filter((token) => POSITIVE_WORDS.has(token)).length;
  const neg = tokens.filter((token) => NEGATIVE_WORDS.has(token)).length;
  const raw = pos - neg;
  const scale = Math.max(3, Math.sqrt(tokens.length));
  return Math.max(-1, Math.min(1, raw / scale));
}

export function sentimentLabel(score: number): "positive" | "negative" | "neutral" {
  if (score > 0.15) return "positive";
  if (score < -0.15) return "negative";
  return "neutral";
}

export function topKeywords(texts: string[], topK = 8): string[] {
  const counter = new Map<string, number>();
  for (const text of texts) {
    for (const token of normalizeTokens(text)) {
      if (token.length < 3 || STOPWORDS.has(token)) continue;
      counter.set(token, (counter.get(token) ?? 0) + 1);
    }
  }
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([key]) => key);
}

export function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}
