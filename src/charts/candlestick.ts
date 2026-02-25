import {
  Chart,
  LinearScale,
  Tooltip,
  Legend,
  TimeScale,
} from "chart.js";
import "chartjs-adapter-luxon";
import { CandlestickController, CandlestickElement, OhlcController, OhlcElement } from "chartjs-chart-financial";
import { getCSSVar, tooltipStyle, escapeHtml, addExportButton, addRefreshButton, sendClickMessage, deferResize } from "./shared.js";

Chart.register(
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
  CandlestickController,
  CandlestickElement,
  OhlcController,
  OhlcElement
);

interface CandlestickDataPoint {
  date: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

interface CandlestickData {
  title: string;
  data: CandlestickDataPoint[];
  options: {
    type?: "candlestick" | "ohlc";
    showVolume?: boolean;
  };
}

export function renderCandlestickChart(container: HTMLElement, payload: CandlestickData): void {
  const { title, data, options } = payload;
  const chartType = options.type ?? "candlestick";
  const showVolume = options.showVolume === true && data.some((d) => d.v !== undefined);

  const upColor = getCSSVar("--positive") || "#22C55E";
  const downColor = getCSSVar("--negative") || "#EF4444";

  container.innerHTML = `
    <div class="chart-view">
      <div class="card chart-card">
        <div class="chart-card__header">
          <div>
            <div class="chart-card__title">${escapeHtml(title)}</div>
            <div class="chart-card__subtitle">${data.length} ${chartType === "ohlc" ? "OHLC" : "candlestick"} bars</div>
          </div>
        </div>
        <div class="chart-card__body">
          <canvas id="chart-canvas"></canvas>
        </div>
      </div>
    </div>
  `;

  const canvas = container.querySelector<HTMLCanvasElement>("#chart-canvas")!;

  const chartData = data.map((d) => ({
    x: new Date(d.date).getTime(),
    o: d.o,
    h: d.h,
    l: d.l,
    c: d.c,
  }));

  // Compute Y-axis range from data to avoid the axis starting at 0
  // (which would compress candles into flat lines)
  const allPrices = data.flatMap((d) => [d.o, d.h, d.l, d.c]);
  const yMin = Math.min(...allPrices);
  const yMax = Math.max(...allPrices);
  const yPadding = (yMax - yMin) * 0.15 || 1;

  const datasets: any[] = [
    {
      label: title,
      data: chartData,
      color: {
        up: upColor,
        down: downColor,
        unchanged: getCSSVar("--text-muted") || "#94A3B8",
      },
      borderColor: {
        up: upColor,
        down: downColor,
        unchanged: getCSSVar("--text-muted") || "#94A3B8",
      },
    },
  ];

  const chartInstance = new Chart(canvas, {
    type: chartType,
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (_event, elements) => {
        if (elements.length === 0) return;
        const idx = elements[0].index;
        const d = data[idx];
        sendClickMessage(
          `I clicked the ${d.date} candle in "${title}" (Open: ${d.o}, High: ${d.h}, Low: ${d.l}, Close: ${d.c}${d.v !== undefined ? `, Volume: ${d.v.toLocaleString()}` : ""}). Analyze this price action.`
        );
      },
      scales: {
        x: {
          type: "time",
          border: { display: false },
          grid: { display: false },
          ticks: {
            color: getCSSVar("--text-secondary"),
            font: { size: 11 },
            maxRotation: 0,
          },
          time: {
            displayFormats: {
              day: "MMM d",
              week: "MMM d",
              month: "MMM yyyy",
            },
          },
        },
        y: {
          type: "linear",
          beginAtZero: false,
          min: yMin - yPadding,
          max: yMax + yPadding,
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
          display: false,
        },
        tooltip: {
          ...tooltipStyle(),
          callbacks: {
            title: (items) => {
              if (items.length === 0) return "";
              const raw = items[0].raw as any;
              return new Date(raw.x).toLocaleDateString(undefined, { dateStyle: "medium" });
            },
            label: (ctx) => {
              const raw = ctx.raw as any;
              const change = raw.c - raw.o;
              const pct = ((change / raw.o) * 100).toFixed(2);
              const dir = change >= 0 ? "+" : "";
              return [
                ` O: ${raw.o.toLocaleString()}  H: ${raw.h.toLocaleString()}`,
                ` L: ${raw.l.toLocaleString()}  C: ${raw.c.toLocaleString()}`,
                ` Change: ${dir}${change.toLocaleString()} (${dir}${pct}%)`,
              ];
            },
          },
        },
      },
    },
  } as any);

  deferResize(chartInstance);
  addExportButton(container, chartInstance, title);
  addRefreshButton(container, () => (window as any).__mcpRefresh?.());
}
