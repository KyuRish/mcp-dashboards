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
  datasets: Array<{ label: string; data: number[]; colors?: string[] }>;
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

export function renderBarChart(container: HTMLElement, payload: BarData): void {
  const { title, options } = payload;
  const isHorizontal = options.horizontal === true;
  const isStacked = options.stacked === true;

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

  // Drill-down state
  interface HistoryEntry {
    title: string;
    labels: string[];
    datasets: Array<{ label: string; data: number[]; colors?: string[] }>;
    annotations?: any[];
    drilldown?: Record<string, DrilldownLevel>;
  }

  const history: HistoryEntry[] = [];
  let currentChart: Chart | null = null;

  function updateBreadcrumb(): void {
    const bc = container.querySelector<HTMLElement>(".drilldown-breadcrumb")!;
    if (history.length === 0) {
      bc.innerHTML = "";
      bc.style.display = "none";
      return;
    }
    bc.style.display = "flex";
    const items = history.map((h, i) =>
      `<span class="drilldown-breadcrumb__item" data-level="${i}">${escapeHtml(h.title)}</span>`
    );
    bc.innerHTML = items.join('<span class="drilldown-breadcrumb__sep">\u203A</span>');

    bc.querySelectorAll<HTMLElement>(".drilldown-breadcrumb__item").forEach(item => {
      item.addEventListener("click", () => {
        const level = parseInt(item.dataset.level ?? "0", 10);
        // Pop history back to the clicked level
        const target = history[level];
        history.length = level;
        renderLevel(target.title, target.labels, target.datasets, target.annotations, target.drilldown);
      });
    });
  }

  function renderLevel(
    levelTitle: string,
    labels: string[],
    datasets: Array<{ label: string; data: number[]; colors?: string[] }>,
    annotations?: any[],
    drilldown?: Record<string, DrilldownLevel>,
  ): void {
    // Destroy previous chart
    if (currentChart) {
      currentChart.destroy();
      currentChart = null;
    }

    // Update header text
    const titleEl = container.querySelector<HTMLElement>(".chart-card__title");
    if (titleEl) {
      titleEl.textContent = levelTitle;
      if (shimmerClass) titleEl.className = `chart-card__title${shimmerClass}`;
    }
    const subtitleEl = container.querySelector<HTMLElement>(".chart-card__subtitle");
    if (subtitleEl) subtitleEl.textContent = `${datasets.length} series - ${labels.length} categories`;

    updateBreadcrumb();

    // Ensure canvas exists (destroy removes it in some Chart.js versions)
    let canvas = container.querySelector<HTMLCanvasElement>("#chart-canvas");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = "chart-canvas";
      container.querySelector(".chart-card__body")!.appendChild(canvas);
    }

    const palette = resolveColors(options.colors, datasets.length);
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

          // Check for drill-down
          if (hasDrilldown && drilldown![label]) {
            const sub = drilldown![label];
            // Push current state to history
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
            ticks: { color: getCSSVar("--text-secondary"), font: { size: 11 } },
          },
          y: {
            stacked: isStacked,
            border: { display: false },
            grid: { display: !isHorizontal, color: getCSSVar("--border") },
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

    // Export/refresh buttons - attach once with a proxy that always uses the current chart
    if (history.length === 0) {
      const chartProxy = {
        get toBase64Image() { return () => currentChart?.toBase64Image() ?? ""; },
        get canvas() { return currentChart?.canvas; },
      };
      addExportButton(container, chartProxy as any, title);
      addRefreshButton(container, () => (window as any).__mcpRefresh?.());
    }
  }

  // Initial render
  renderLevel(title, payload.labels, payload.datasets, options.annotations, options.drilldown);
}

registerChart("bar", "render_bar_chart", renderBarChart);
