import {
  Chart,
  Tooltip,
  Legend,
} from "chart.js";
import { TreemapController, TreemapElement } from "chartjs-chart-treemap";
import { getCSSVar, tooltipStyle, escapeHtml, resolveColors, addExportButton, addRefreshButton, sendClickMessage, deferResize, registerChart, addCanvasZoom } from "./shared.js";
import { resolveTheme, applyTheme } from "../themes.js";

Chart.register(TreemapController, TreemapElement, Tooltip, Legend);

interface TreemapItem {
  label: string;
  value: number;
  group?: string;
}

interface TreemapData {
  type: "treemap";
  title: string;
  data: TreemapItem[];
  options: {
    groups?: boolean;
    colors?: string[];
  };
  theme?: string;
  palette?: string;
  typography?: string;
  effects?: string;
}

export function renderTreemapChart(container: HTMLElement, payload: TreemapData): void {
  const { title, data, options } = payload;

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
            <div class="chart-card__subtitle">${data.length} items</div>
          </div>
        </div>
        <div class="chart-card__body">
          <canvas id="chart-canvas"></canvas>
        </div>
      </div>
    </div>
  `;

  const canvas = container.querySelector<HTMLCanvasElement>("#chart-canvas")!;

  // Determine if grouping is active
  const hasGroups = data.some(d => d.group);
  const useGroups = (options.groups !== false) && hasGroups;

  // Build color map: one color per group (or per item if no groups)
  const uniqueGroups = useGroups
    ? [...new Set(data.map(d => d.group ?? "Other"))]
    : data.map(d => d.label);
  const palette = resolveColors(options.colors, uniqueGroups.length);
  const colorMap = new Map<string, string>();
  uniqueGroups.forEach((g, i) => colorMap.set(g, palette[i % palette.length]));

  const groups = useGroups ? ["group", "label"] : ["label"];

  const chartInstance = new Chart(canvas, {
    type: "treemap" as any,
    data: {
      datasets: [{
        tree: data.map(d => ({
          label: d.label,
          value: d.value,
          group: d.group ?? "Other",
        })),
        key: "value",
        groups,
        borderWidth: 1,
        borderColor: getCSSVar("--bg-card"),
        spacing: 1,
        backgroundColor: (ctx: any) => {
          if (!ctx.raw?._data) return palette[0] + "CC";
          const key = useGroups ? ctx.raw._data.group : ctx.raw._data.label;
          return (colorMap.get(key) ?? palette[0]) + "CC";
        },
        hoverBackgroundColor: (ctx: any) => {
          if (!ctx.raw?._data) return palette[0];
          const key = useGroups ? ctx.raw._data.group : ctx.raw._data.label;
          return colorMap.get(key) ?? palette[0];
        },
        labels: {
          display: true,
          color: getCSSVar("--text-primary"),
          font: { size: 11, weight: "600" as any },
          formatter: (ctx: any) => {
            if (!ctx.raw?._data) return "";
            const d = ctx.raw._data;
            // Show label for leaf nodes
            if (d.label) return d.label;
            // Show group name for group headers
            if (d.group && groups.length > 1) return d.group;
            return "";
          },
        },
        captions: {
          display: useGroups,
          color: getCSSVar("--text-secondary"),
          font: { size: 10 },
          padding: 4,
        },
      }] as any,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (_event, elements) => {
        if (elements.length === 0) return;
        const el = elements[0] as any;
        const raw = el.element?.$context?.raw?._data;
        if (raw) {
          const groupStr = raw.group && useGroups ? `${raw.group} > ` : "";
          sendClickMessage(`${groupStr}${raw.label}: ${raw.value?.toLocaleString()} in "${title}"`);
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipStyle(),
          callbacks: {
            title: (items: any[]) => {
              const raw = items[0]?.raw?._data;
              if (!raw) return "";
              if (useGroups && raw.group) return `${raw.group} > ${raw.label}`;
              return raw.label ?? "";
            },
            label: (ctx: any) => {
              const raw = ctx.raw?._data;
              if (!raw) return "";
              return ` Value: ${raw.value?.toLocaleString()}`;
            },
          },
        },
      },
    },
  });

  deferResize(chartInstance);
  addExportButton(container, chartInstance, title);
  addRefreshButton(container);

  const body = container.querySelector<HTMLElement>(".chart-card__body");
  if (body) addCanvasZoom(body, canvas, chartInstance);
}

registerChart("treemap", "render_treemap_chart", renderTreemapChart);
