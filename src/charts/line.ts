import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { getCSSVar, tooltipStyle, escapeHtml, resolveColors, addExportButton } from "./shared.js";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend
);

interface LineData {
  title: string;
  labels: string[];
  datasets: Array<{ label: string; data: number[] }>;
  options: {
    fill?: boolean;
    smooth?: boolean;
    showPoints?: boolean;
    colors?: string[];
  };
}

export function renderLineChart(container: HTMLElement, payload: LineData): void {
  const { title, labels, datasets, options } = payload;
  const shouldFill = options.fill !== false;
  const isSmooth = options.smooth !== false;
  const showPoints = options.showPoints === true;

  container.innerHTML = `
    <div class="chart-view">
      <div class="card chart-card">
        <div class="chart-card__header">
          <div>
            <div class="chart-card__title">${escapeHtml(title)}</div>
            <div class="chart-card__subtitle">${datasets.length} series - ${labels.length} points</div>
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

  const chartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: datasets.map((ds, i) => {
        const color = palette[i % palette.length];
        return {
          label: ds.label,
          data: ds.data,
          borderColor: color,
          borderWidth: 2,
          tension: isSmooth ? 0.4 : 0,
          fill: shouldFill,
          backgroundColor: (ctx: any) => {
            if (!shouldFill) return "transparent";
            const gradient = ctx.chart.ctx.createLinearGradient(
              0, 0, 0, ctx.chart.height
            );
            gradient.addColorStop(0, color + "40");
            gradient.addColorStop(1, color + "00");
            return gradient;
          },
          pointRadius: showPoints ? 4 : 0,
          pointHoverRadius: 6,
          pointBackgroundColor: color,
          pointBorderColor: getCSSVar("--bg-card"),
          pointBorderWidth: 2,
          pointHoverBorderWidth: 2,
        };
      }),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      scales: {
        x: {
          border: { display: false },
          grid: { display: false },
          ticks: { color: getCSSVar("--text-secondary"), font: { size: 11 } },
        },
        y: {
          border: { display: false },
          grid: {
            color: getCSSVar("--border"),
            drawTicks: false,
          },
          ticks: {
            color: getCSSVar("--text-secondary"),
            font: { size: 11 },
            padding: 8,
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
        tooltip: tooltipStyle(),
      },
    },
  });

  addExportButton(container, chartInstance, title);
}
