import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import { getCSSVar, tooltipStyle, escapeHtml, resolveColors, addExportButton, addRefreshButton, sendClickMessage, deferResize, registerChart } from "./shared.js";
import { resolveTheme, applyTheme } from "../themes.js";

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

interface BarData {
  title: string;
  labels: string[];
  datasets: Array<{ label: string; data: number[] }>;
  options: {
    horizontal?: boolean;
    stacked?: boolean;
    colors?: string[];
  };
  theme?: string;
  palette?: string;
  typography?: string;
  effects?: string;
}

export function renderBarChart(container: HTMLElement, payload: BarData): void {
  const { title, labels, datasets, options } = payload;
  const isHorizontal = options.horizontal === true;
  const isStacked = options.stacked === true;

  // Apply theme if specified
  const theme = resolveTheme(payload.theme, {
    palette: payload.palette,
    typography: payload.typography,
    effects: payload.effects,
  });
  if (theme) applyTheme(container, theme);

  container.innerHTML = `
    <div class="chart-view">
      <div class="card chart-card">
        <div class="chart-card__header">
          <div>
            <div class="chart-card__title${theme?.effects.shimmerTitle ? " shimmer-text" : ""}">${escapeHtml(title)}</div>
            <div class="chart-card__subtitle">${datasets.length} series - ${labels.length} categories</div>
          </div>
        </div>
        <div class="chart-card__body">
          <canvas id="chart-canvas"></canvas>
        </div>
      </div>
    </div>
  `;

  const canvas = container.querySelector<HTMLCanvasElement>("#chart-canvas")!;
  const palette = resolveColors(options.colors, datasets.length);

  const chartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: datasets.map((ds, i) => ({
        label: ds.label,
        data: ds.data,
        backgroundColor: palette[i % palette.length] + "CC",
        borderColor: palette[i % palette.length],
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      })),
    },
    options: {
      indexAxis: isHorizontal ? "y" : "x",
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      onClick: (_event, elements) => {
        if (elements.length === 0) return;
        const el = elements[0];
        const label = labels[el.index];
        const values = datasets.map((ds) => `${ds.label}: ${ds.data[el.index]?.toLocaleString()}`).join(", ");
        sendClickMessage(`${label} (${values}) in "${title}"`);
      },
      scales: {
        x: {
          stacked: isStacked,
          border: { display: false },
          grid: { display: isHorizontal, color: getCSSVar("--border") },
          ticks: { color: getCSSVar("--text-secondary"), font: { size: 11 } },
        },
        y: {
          stacked: isStacked,
          border: { display: false },
          grid: { display: !isHorizontal, color: getCSSVar("--border") },
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

  deferResize(chartInstance);
  addExportButton(container, chartInstance, title);
  addRefreshButton(container, () => (window as any).__mcpRefresh?.());
}

registerChart("bar", "render_bar_chart", renderBarChart);
