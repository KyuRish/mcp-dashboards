import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import annotationPlugin from "chartjs-plugin-annotation";
import { getCSSVar, tooltipStyle, escapeHtml, resolveColors, buildAnnotations, addExportButton, addRefreshButton, sendClickMessage, deferResize, registerChart } from "./shared.js";
import { resolveTheme, applyTheme } from "../themes.js";

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend, annotationPlugin);

interface DrilldownLevel {
  labels: string[];
  datasets: Array<{ label: string; data: number[] }>;
}

interface BarData {
  title: string;
  labels: string[];
  datasets: Array<{ label: string; data: (number | null)[]; colors?: string[] }>;
  options: {
    horizontal?: boolean;
    stacked?: boolean;
    colors?: string[];
    annotations?: any[];
    drilldown?: Record<string, DrilldownLevel>;
  };
  theme?: string;
  palette?: string;
  typography?: string;
  effects?: string;
}

export interface BarDrilldownConfig {
  card: HTMLElement;
  title: string;
  labels: string[];
  datasets: Array<{ label: string; data: (number | null)[]; colors?: string[] }>;
  horizontal?: boolean;
  stacked?: boolean;
  colors?: string[];
  annotations?: any[];
  drilldown?: Record<string, DrilldownLevel>;
  shimmerClass?: string;
  tickSize?: number;
}

/**
 * Sets up a bar chart with drill-down support inside an existing card element.
 * Returns a chart proxy for export buttons.
 */
export function initBarDrilldown(cfg: BarDrilldownConfig): { proxy: any } {
  const { card, title, horizontal: isHorizontal = false, stacked: isStacked = false, shimmerClass = "", tickSize = 11 } = cfg;

  // Add breadcrumb if not present
  let bc = card.querySelector<HTMLElement>(".drilldown-breadcrumb");
  if (!bc) {
    bc = document.createElement("div");
    bc.className = "drilldown-breadcrumb";
    const body = card.querySelector(".chart-card__body");
    if (body) card.insertBefore(bc, body);
  }

  interface HistoryEntry {
    title: string;
    labels: string[];
    datasets: Array<{ label: string; data: (number | null)[]; colors?: string[] }>;
    annotations?: any[];
    drilldown?: Record<string, DrilldownLevel>;
  }

  const history: HistoryEntry[] = [];
  let currentChart: Chart | null = null;

  function updateBreadcrumb(): void {
    if (history.length === 0) {
      bc!.innerHTML = "";
      bc!.style.display = "none";
      return;
    }
    bc!.style.display = "flex";
    const items = history.map((h, i) =>
      `<span class="drilldown-breadcrumb__item" data-level="${i}">${escapeHtml(h.title)}</span>`
    );
    bc!.innerHTML = items.join('<span class="drilldown-breadcrumb__sep">\u203A</span>');

    bc!.querySelectorAll<HTMLElement>(".drilldown-breadcrumb__item").forEach(item => {
      item.addEventListener("click", () => {
        const level = parseInt(item.dataset.level ?? "0", 10);
        const target = history[level];
        history.length = level;
        renderLevel(target.title, target.labels, target.datasets, target.annotations, target.drilldown);
      });
    });
  }

  function renderLevel(
    levelTitle: string,
    labels: string[],
    datasets: Array<{ label: string; data: (number | null)[]; colors?: string[] }>,
    annotations?: any[],
    drilldown?: Record<string, DrilldownLevel>,
  ): void {
    if (currentChart) {
      currentChart.destroy();
      currentChart = null;
    }

    const titleEl = card.querySelector<HTMLElement>(".chart-card__title");
    if (titleEl) {
      titleEl.textContent = levelTitle;
      if (shimmerClass) titleEl.className = `chart-card__title${shimmerClass}`;
    }
    const subtitleEl = card.querySelector<HTMLElement>(".chart-card__subtitle");
    if (subtitleEl) subtitleEl.textContent = `${datasets.length} series - ${labels.length} categories`;

    updateBreadcrumb();

    let canvas = card.querySelector<HTMLCanvasElement>("canvas");
    if (!canvas) {
      canvas = document.createElement("canvas");
      card.querySelector(".chart-card__body")!.appendChild(canvas);
    }

    const palette = resolveColors(cfg.colors, datasets.length);
    const hasDrilldown = drilldown && Object.keys(drilldown).length > 0;

    currentChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: datasets.map((ds, i) => {
          const base = palette[i % palette.length];
          const bg = ds.colors ? ds.colors.map(c => c + "CC") : base + "CC";
          const border = ds.colors ?? base;
          return {
            label: ds.label,
            data: ds.data,
            backgroundColor: bg,
            borderColor: border,
            borderWidth: 1,
            borderRadius: 4,
            borderSkipped: false,
          };
        }),
      },
      options: {
        indexAxis: isHorizontal ? "y" : "x",
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        onClick: (_event, elements) => {
          if (elements.length === 0) return;
          const el = elements[0];
          const label = labels[el.index];

          if (hasDrilldown && drilldown![label]) {
            const sub = drilldown![label];
            history.push({ title: levelTitle, labels, datasets, annotations, drilldown });
            renderLevel(`${levelTitle} \u203A ${label}`, sub.labels, sub.datasets);
            return;
          }

          const values = datasets.map((ds) => `${ds.label}: ${ds.data[el.index]?.toLocaleString()}`).join(", ");
          sendClickMessage(`${label} (${values}) in "${levelTitle}"`);
        },
        scales: {
          x: {
            stacked: isStacked,
            border: { display: false },
            grid: { display: isHorizontal, color: getCSSVar("--border") },
            ticks: { color: getCSSVar("--text-secondary"), font: { size: tickSize } },
          },
          y: {
            stacked: isStacked,
            border: { display: false },
            grid: { display: !isHorizontal, color: getCSSVar("--border") },
            ticks: { color: getCSSVar("--text-secondary"), font: { size: tickSize }, padding: 8 },
          },
        },
        plugins: {
          legend: {
            display: datasets.length > 1,
            position: "top",
            align: "end",
            labels: { color: getCSSVar("--text-secondary"), boxWidth: 10, padding: 12, font: { size: tickSize } },
          },
          tooltip: {
            ...tooltipStyle(),
            callbacks: hasDrilldown ? {
              afterBody: (contexts) => {
                const label = contexts[0]?.label ?? "";
                return drilldown![label] ? ["", "Click to drill down \u2193"] : [];
              },
            } : undefined,
          },
          annotation: buildAnnotations(annotations) ? { annotations: buildAnnotations(annotations) } : undefined,
        },
      },
    });

    deferResize(currentChart);
  }

  renderLevel(title, cfg.labels, cfg.datasets, cfg.annotations, cfg.drilldown);

  const proxy = {
    get toBase64Image() { return () => currentChart?.toBase64Image() ?? ""; },
    get canvas() { return currentChart?.canvas; },
  };

  return { proxy };
}

export function renderBarChart(container: HTMLElement, payload: BarData): void {
  const { title, options } = payload;

  const theme = resolveTheme(payload.theme, {
    palette: payload.palette,
    typography: payload.typography,
    effects: payload.effects,
  });
  if (theme) applyTheme(container, theme);

  const shimmerClass = theme?.effects.shimmerTitle ? " shimmer-text" : "";

  container.innerHTML = `
    <div class="chart-view">
      <div class="card chart-card">
        <div class="chart-card__header">
          <div>
            <div class="chart-card__title${shimmerClass}">${escapeHtml(title)}</div>
            <div class="chart-card__subtitle">${payload.datasets.length} series - ${payload.labels.length} categories</div>
          </div>
        </div>
        <div class="drilldown-breadcrumb"></div>
        <div class="chart-card__body">
          <canvas id="chart-canvas"></canvas>
        </div>
      </div>
    </div>
  `;

  const card = container.querySelector<HTMLElement>(".chart-card")!;
  const { proxy } = initBarDrilldown({
    card,
    title,
    labels: payload.labels,
    datasets: payload.datasets,
    horizontal: options.horizontal,
    stacked: options.stacked,
    colors: options.colors,
    annotations: options.annotations,
    drilldown: options.drilldown,
    shimmerClass,
  });

  addExportButton(container, proxy as any, title);
  addRefreshButton(container);
}

registerChart("bar", "render_bar_chart", renderBarChart);
