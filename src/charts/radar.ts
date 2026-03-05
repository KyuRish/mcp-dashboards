import {
  Chart,
  RadarController,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { getCSSVar, tooltipStyle, escapeHtml, resolveColors, addExportButton, addRefreshButton, sendClickMessage, deferResize, registerChart } from "./shared.js";
import { resolveTheme, applyTheme } from "../themes.js";

Chart.register(RadarController, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

interface RadarData {
  title: string;
  labels: string[];
  datasets: Array<{ label: string; data: number[] }>;
  options: {
    fill?: boolean;
    tension?: number;
    scale_min?: number;
    scale_max?: number;
    colors?: string[];
  };
  theme?: string;
  palette?: string;
  typography?: string;
  effects?: string;
}

export function renderRadarChart(container: HTMLElement, payload: RadarData): void {
  const { title, labels, datasets, options } = payload;
  const shouldFill = options.fill !== false;
  const tension = options.tension ?? 0.1;

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
            <div class="chart-card__subtitle">${datasets.length} series - ${labels.length} axes</div>
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
    type: "radar",
    data: {
      labels,
      datasets: datasets.map((ds, i) => {
        const color = palette[i % palette.length];
        return {
          label: ds.label,
          data: ds.data,
          borderColor: color,
          borderWidth: 2,
          backgroundColor: shouldFill ? color + "30" : "transparent",
          pointBackgroundColor: color,
          pointBorderColor: getCSSVar("--bg-card"),
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension,
        };
      }),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (_event, elements) => {
        if (elements.length === 0) return;
        const el = elements[0];
        const ds = datasets[el.datasetIndex];
        const label = labels[el.index];
        const value = ds.data[el.index];
        sendClickMessage(`${ds.label} - ${label}: ${value} in "${title}"`);
      },
      scales: {
        r: {
          beginAtZero: options.scale_min === undefined,
          min: options.scale_min,
          max: options.scale_max,
          angleLines: {
            color: getCSSVar("--border"),
          },
          grid: {
            color: getCSSVar("--border"),
          },
          pointLabels: {
            color: getCSSVar("--text-secondary"),
            font: { size: 11 },
          },
          ticks: {
            color: getCSSVar("--text-muted"),
            backdropColor: "transparent",
            font: { size: 10 },
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
              return ` ${ctx.dataset.label}: ${ctx.parsed.r}`;
            },
          },
        },
      },
    },
  });

  deferResize(chartInstance);
  addExportButton(container, chartInstance, title);
  addRefreshButton(container, () => (window as any).__mcpRefresh?.());
}

registerChart("radar", "render_radar_chart", renderRadarChart);
