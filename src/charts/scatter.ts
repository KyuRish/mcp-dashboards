import {
  Chart,
  ScatterController,
  PointElement,
  LinearScale,
  Tooltip,
  Legend,
  LineElement,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import annotationPlugin from "chartjs-plugin-annotation";
import { getCSSVar, tooltipStyle, escapeHtml, resolveColors, buildAnnotations, addHtmlExportButton, addRefreshButton, sendClickMessage, deferResize, registerChart } from "./shared.js";
import { resolveTheme, applyTheme } from "../themes.js";

Chart.register(ScatterController, PointElement, LinearScale, Tooltip, Legend, LineElement, annotationPlugin);

interface ScatterPoint {
  x: number;
  y: number;
  label?: string;
  tooltip?: string;
}

interface ScatterDataset {
  label: string;
  data: ScatterPoint[];
}

interface ReferenceLine {
  value: number;
  label?: string;
  style?: "solid" | "dashed";
}

interface ScatterData {
  title: string;
  datasets: ScatterDataset[];
  options: {
    xLabel?: string;
    yLabel?: string;
    showLine?: boolean;
    showLabels?: boolean;
    colors?: string[];
    annotations?: any[];
    referenceLines?: {
      horizontal?: ReferenceLine[];
      vertical?: ReferenceLine[];
    };
  };
  theme?: string;
  palette?: string;
  typography?: string;
  effects?: string;
}

/** Convert legacy referenceLines to annotation format and merge with new annotations */
function mergeAnnotations(options: ScatterData["options"]): any[] {
  const result: any[] = options.annotations ? [...options.annotations] : [];
  if (options.referenceLines) {
    for (const rl of options.referenceLines.horizontal ?? []) {
      result.push({ type: "line", axis: "y", value: rl.value, label: rl.label, style: rl.style });
    }
    for (const rl of options.referenceLines.vertical ?? []) {
      result.push({ type: "line", axis: "x", value: rl.value, label: rl.label, style: rl.style });
    }
  }
  return result;
}

export function renderScatterChart(container: HTMLElement, payload: ScatterData): void {
  const { title, datasets, options = {} } = payload;
  const totalPoints = datasets.reduce((s, ds) => s + ds.data.length, 0);

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
  const palette = resolveColors(options.colors, datasets.length);
  const showLine = options.showLine === true;

  // Check if any point has a label
  const hasLabels = datasets.some(ds => ds.data.some(p => p.label));
  const showLabels = options.showLabels ?? hasLabels;

  // Compute explicit axis ranges
  const allPoints = datasets.flatMap((ds) => ds.data);
  const allX = allPoints.map((p) => p.x);
  const allY = allPoints.map((p) => p.y);
  const xMin = Math.min(...allX);
  const xMax = Math.max(...allX);
  const yMin = Math.min(...allY);
  const yMax = Math.max(...allY);
  const xPad = (xMax - xMin) * 0.1 || 1;
  const yPad = (yMax - yMin) * 0.15 || 1;

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
          datalabels: showLabels ? {
            display: (ctx: any) => !!(ctx.dataset.data[ctx.dataIndex] as ScatterPoint).label,
            formatter: (_value: unknown, ctx: any) => (ctx.dataset.data[ctx.dataIndex] as ScatterPoint).label || "",
            color: getCSSVar("--text-secondary"),
            font: { size: 10 },
            align: "top" as const,
            offset: 4,
            clamp: true,
          } : { display: false },
        };
      }),
    },
    plugins: [ChartDataLabels],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "nearest",
        intersect: true,
      },
      onClick: (_event, elements) => {
        if (elements.length === 0) return;
        const el = elements[0];
        const ds = datasets[el.datasetIndex];
        const point = ds.data[el.index];
        const label = point.label ? ` (${point.label})` : "";
        sendClickMessage(`${ds.label}${label}: (${point.x}, ${point.y}) in "${title}"`);
      },
      scales: {
        x: {
          type: "linear",
          min: xMin - xPad,
          max: xMax + xPad,
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
          type: "linear",
          min: yMin - yPad,
          max: yMax + yPad,
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
              const point = ctx.raw as ScatterPoint;
              const label = point.label ? ` ${point.label}:` : ` ${ctx.dataset.label}:`;
              return `${label} (${point.x}, ${point.y})`;
            },
            afterBody: (contexts) => {
              const point = contexts[0]?.raw as ScatterPoint | undefined;
              return point?.tooltip ? [`\n${point.tooltip}`] : [];
            },
          },
        },
        annotation: (() => {
          const merged = mergeAnnotations(options);
          const built = buildAnnotations(merged);
          return built ? { annotations: built } : undefined;
        })(),
      },
    },
  });

  deferResize(chartInstance);
  addHtmlExportButton(container, title);
  addRefreshButton(container, () => (window as any).__mcpRefresh?.());
}

registerChart("scatter", "render_scatter_chart", renderScatterChart);
