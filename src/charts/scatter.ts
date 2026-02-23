import {
  Chart,
  ScatterController,
  PointElement,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import { getCSSVar, tooltipStyle, escapeHtml, resolveColors, addExportButton } from "./shared.js";

Chart.register(ScatterController, PointElement, LinearScale, Tooltip, Legend);

interface ScatterDataset {
  label: string;
  data: Array<{ x: number; y: number }>;
}

interface ScatterData {
  title: string;
  datasets: ScatterDataset[];
  options: {
    xLabel?: string;
    yLabel?: string;
    showLine?: boolean;
    colors?: string[];
  };
}

export function renderScatterChart(container: HTMLElement, payload: ScatterData): void {
  const { title, datasets, options } = payload;
  const totalPoints = datasets.reduce((s, ds) => s + ds.data.length, 0);

  container.innerHTML = `
    <div class="chart-view">
      <div class="card chart-card">
        <div class="chart-card__header">
          <div>
            <div class="chart-card__title">${escapeHtml(title)}</div>
            <div class="chart-card__subtitle">${datasets.length} series - ${totalPoints} points</div>
          </div>
        </div>
        <div class="chart-card__body">
          <canvas id="chart-canvas"></canvas>
        </div>
      </div>
    </div>
  `;

  const canvas = container.querySelector<HTMLCanvasElement>("#chart-canvas")!;
  const palette = resolveColors(options.colors);
  const showLine = options.showLine === true;

  const chartInstance = new Chart(canvas, {
    type: "scatter",
    data: {
      datasets: datasets.map((ds, i) => {
        const color = palette[i % palette.length];
        return {
          label: ds.label,
          data: ds.data,
          backgroundColor: color + "AA",
          borderColor: color,
          borderWidth: 1,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointHoverBorderWidth: 2,
          pointHoverBorderColor: getCSSVar("--bg-card"),
          showLine,
          tension: showLine ? 0.3 : 0,
          fill: false,
        };
      }),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "nearest",
        intersect: true,
      },
      scales: {
        x: {
          border: { display: false },
          grid: { color: getCSSVar("--border") },
          ticks: { color: getCSSVar("--text-secondary"), font: { size: 11 } },
          title: {
            display: !!options.xLabel,
            text: options.xLabel ?? "",
            color: getCSSVar("--text-secondary"),
            font: { size: 11, weight: "600" as const },
          },
        },
        y: {
          border: { display: false },
          grid: { color: getCSSVar("--border"), drawTicks: false },
          ticks: {
            color: getCSSVar("--text-secondary"),
            font: { size: 11 },
            padding: 8,
          },
          title: {
            display: !!options.yLabel,
            text: options.yLabel ?? "",
            color: getCSSVar("--text-secondary"),
            font: { size: 11, weight: "600" as const },
          },
        },
      },
      plugins: {
        legend: {
          display: datasets.length > 1,
          position: "top",
          align: "end",
          labels: {
            color: getCSSVar("--text-secondary"),
            boxWidth: 10,
            padding: 12,
            font: { size: 11 },
          },
        },
        tooltip: {
          ...tooltipStyle(),
          callbacks: {
            label: (ctx) => {
              const point = ctx.parsed;
              return ` ${ctx.dataset.label}: (${point.x}, ${point.y})`;
            },
          },
        },
      },
    },
  });

  addExportButton(container, chartInstance, title);
}
