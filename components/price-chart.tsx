"use client";

import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

export interface PriceChartProps {
  labels: string[];
  values: number[];
}

export function PriceChart({ labels, values }: PriceChartProps) {
  if (!labels.length || !values.length) {
    return <div className="empty-state">暂无价格序列数据</div>;
  }
  return (
    <div className="chart-wrap">
      <Line
        data={{
          labels,
          datasets: [
            {
              label: "Close",
              data: values,
              borderColor: "#2dd4bf",
              backgroundColor: "rgba(45,212,191,0.2)",
              fill: true,
              pointRadius: 0,
              borderWidth: 2,
              tension: 0.25,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              grid: { color: "rgba(148,163,184,0.2)" },
              ticks: { maxTicksLimit: 7, color: "#9aaac0" },
            },
            y: {
              grid: { color: "rgba(148,163,184,0.2)" },
              ticks: { color: "#9aaac0" },
            },
          },
        }}
      />
    </div>
  );
}
