import {
  Chart,
  Tooltip,
  Legend,
} from "chart.js";
import { SankeyController, Flow } from "chartjs-chart-sankey";
import { getCSSVar, tooltipStyle, escapeHtml, resolveColors, addExportButton, addRefreshButton, sendClickMessage, deferResize, registerChart } from "./shared.js";
import { resolveTheme, applyTheme } from "../themes.js";

Chart.register(SankeyController, Flow, Tooltip, Legend);

interface SankeyFlow {
  from: string;
  to: string;
  flow: number;
}

interface SankeyData {
  type: "sankey";
  title: string;
  data: SankeyFlow[];
  options: {
    colorMode?: "gradient" | "from" | "to";
    colors?: string[];
  };
  theme?: string;
  palette?: string;
  typography?: string;
  effects?: string;
}

export function renderSankeyChart(container: HTMLElement, payload: SankeyData): void {
  const { title, data, options } = payload;
  const colorMode = options.colorMode ?? "gradient";

  const theme = resolveTheme(payload.theme, {
    palette: payload.palette,
    typography: payload.typography,
    effects: payload.effects,
  });
  if (theme) applyTheme(container, theme);

  // Build color map for all unique nodes
  const nodes = [...new Set(data.flatMap(d => [d.from, d.to]))];
  const palette = resolveColors(options.colors, nodes.length);
  const colorMap = new Map<string, string>();
  nodes.forEach((n, i) => colorMap.set(n, palette[i % palette.length]));

  container.innerHTML = `
    <div class="chart-view">
      <div class="card chart-card">
        <div class="chart-card__header">
          <div>
            <div class="chart-card__title${theme?.effects.shimmerTitle ? " shimmer-text" : ""}">${escapeHtml(title)}</div>
            <div class="chart-card__subtitle">${data.length} flows - ${nodes.length} nodes</div>
          </div>
        </div>
        <div class="chart-card__body">
          <canvas id="chart-canvas"></canvas>
        </div>
      </div>
    </div>
  `;

  const canvas = container.querySelector<HTMLCanvasElement>("#chart-canvas")!;

  const chartInstance = new Chart(canvas, {
    type: "sankey" as any,
    data: {
      datasets: [{
        data,
        colorFrom: (ctx: any) => {
          const flow = ctx.dataset.data[ctx.dataIndex];
          return flow ? (colorMap.get(flow.from) ?? palette[0]) : palette[0];
        },
        colorTo: (ctx: any) => {
          const flow = ctx.dataset.data[ctx.dataIndex];
          return flow ? (colorMap.get(flow.to) ?? palette[1]) : palette[1];
        },
        colorMode,
        borderWidth: 0,
        nodeWidth: 12,
        color: getCSSVar("--text-primary"),
        font: { size: 11 },
      }] as any,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (_event, elements) => {
        if (elements.length === 0) return;
        const el = elements[0] as any;
        const idx = el.index;
        const flow = data[idx];
        if (flow) {
          sendClickMessage(`${flow.from} → ${flow.to}: ${flow.flow.toLocaleString()} in "${title}"`);
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipStyle(),
          callbacks: {
            label: (ctx: any) => {
              const flow = ctx.dataset.data[ctx.dataIndex];
              if (!flow) return "";
              return `${flow.from} → ${flow.to}: ${flow.flow.toLocaleString()}`;
            },
          },
        },
      },
    },
  });

  deferResize(chartInstance);
  addExportButton(container, chartInstance, title);
  addRefreshButton(container);
}

registerChart("sankey", "render_sankey_chart", renderSankeyChart);
