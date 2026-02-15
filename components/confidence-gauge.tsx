"use client";

interface ConfidenceGaugeProps {
  score: number;
  size?: number;
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function gaugeColor(score: number): string {
  if (score >= 75) return "#22d3ee";
  if (score >= 50) return "#60a5fa";
  return "#f59e0b";
}

export function ConfidenceGauge({ score, size = 96 }: ConfidenceGaugeProps) {
  const value = clamp(score);
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = Math.PI * radius;
  const progress = (value / 100) * circumference;
  const color = gaugeColor(value);

  return (
    <div className="confidence-gauge" style={{ width: size }}>
      <svg viewBox={`0 0 ${size} ${size / 2 + stroke}`} className="confidence-gauge-svg" aria-hidden="true">
        <path
          d={`M ${stroke / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none"
          stroke="rgba(148, 163, 184, 0.22)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <path
          d={`M ${stroke / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          className="confidence-gauge-progress"
        />
      </svg>
      <div className="confidence-gauge-score" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
