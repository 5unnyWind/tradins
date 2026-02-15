"use client";

import { useMemo } from "react";

export function SentimentGauge({ score }: { score: number }) {
  const safeScore = Math.max(0, Math.min(100, Math.round(score)));
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const progress = (safeScore / 100) * circumference;

  const color = useMemo(() => {
    if (safeScore >= 75) return "#22d3ee";
    if (safeScore >= 55) return "#38bdf8";
    if (safeScore >= 35) return "#f59e0b";
    return "#fb7185";
  }, [safeScore]);

  return (
    <div className="sentiment-gauge" aria-label={`情绪分数 ${safeScore}`}>
      <svg viewBox="0 0 120 120" className="sentiment-gauge-svg" aria-hidden="true">
        <circle cx="60" cy="60" r={radius} className="sentiment-gauge-track" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          className="sentiment-gauge-progress"
          style={{
            stroke: color,
            strokeDasharray: `${progress} ${circumference}`,
          }}
        />
      </svg>
      <div className="sentiment-gauge-score" style={{ color }}>
        {safeScore}
      </div>
    </div>
  );
}
