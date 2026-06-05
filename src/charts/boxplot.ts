import {
  Chart,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import { BoxPlotController, BoxAndWiskers, ViolinController, Violin } from "@sgratzl/chartjs-chart-boxplot";
import { getCSSVar, tooltipStyle, escapeHtml, resolveColors, addExportButton, addRefreshButton, sendClickMessage, deferResize, registerChart } from "./shared.js";
import { resolveTheme, applyTheme } from "../themes.js";

Chart.register(BoxPlotController, BoxAndWiskers, ViolinController, Violin, CategoryScale, LinearScale, Tooltip, Legend);

interface BoxplotDataset {
  label: string;
  data: number[][];
}

interface BoxplotData {
  type: "boxplot";
  title: string;
  labels: string[];
  datasets: BoxplotDataset[];
  options: {
    style?: "boxplot" | "violin";
    horizontal?: boolean;
    colors?: string[];
  };
  theme?: string;
  palette?: string;
  typography?: string;
  effects?: string;
}

export function renderBoxplotChart(container: HTMLElement, payload: BoxplotData): void {
  const { title, labels, datasets, options } = payload;
  const style = options.style ?? "boxplot";
  const isHorizontal = options.horizontal === true;

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
    type: style as any,
    data: {
      labels,
      datasets: datasets.map((ds, i) => {
        const color = palette[i % palette.length];
        return {
          label: ds.label,
          data: ds.data,
          backgroundColor: color + "40",
          borderColor: color,
          borderWidth: 1.5,
          outlierBackgroundColor: color,
          outlierBorderColor: color,
          outlierRadius: 3,
          itemRadius: 0,
          medianColor: getCSSVar("--text-primary"),
          meanBackgroundColor: color,
        };
      }),
    },
    options: {
      indexAxis: isHorizontal ? "y" : "x",
      responsive: true,
      maintainAspectRatio: false,
      onClick: (_event, elements) => {
        if (elements.length === 0) return;
        const el = elements[0];
        const label = labels[el.index];
        const ds = datasets[el.datasetIndex];
        sendClickMessage(`${ds.label} - ${label} in "${title}"`);
      },
      scales: {
        x: {
          border: { display: false },
          grid: { display: isHorizontal, color: getCSSVar("--border") },
          ticks: { color: getCSSVar("--text-secondary"), font: { size: 11 } },
        },
        y: {
          border: { display: false },
          grid: { display: !isHorizontal, color: getCSSVar("--border"), drawTicks: false },
          ticks: { color: getCSSVar("--text-secondary"), font: { size: 11 }, padding: 8 },
        },
      },
      plugins: {
        legend: {
          display: datasets.length > 1,
          position: "top",
          align: "end",
          labels: { color: getCSSVar("--text-secondary"), boxWidth: 10, padding: 12, font: { size: 11 } },
        },
        tooltip: tooltipStyle(),
      },
    },
  });

  deferResize(chartInstance);
  addExportButton(container, chartInstance, title);
  addRefreshButton(container);
}

registerChart("boxplot", "render_boxplot_chart", renderBoxplotChart);
