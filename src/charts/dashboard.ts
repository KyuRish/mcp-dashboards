import {
  Chart,
  ArcElement,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  PieController,
  DoughnutController,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import html2canvas from "html2canvas";
import { CHART_COLORS, getCSSVar, tooltipStyle, escapeHtml, deferResize, sendClickMessage, addExportButton, saveCanvasViaServer } from "./shared.js";

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  PieController,
  DoughnutController,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend
);

interface KPI {
  label: string;
  value: string | number;
  change?: number;
  prefix?: string;
  suffix?: string;
}

interface DashboardChart {
  type: "pie" | "bar" | "line";
  title?: string;
  data?: Array<{ label: string; value: number }>;
  labels?: string[];
  datasets?: Array<{ label: string; data: (number | null)[] }>;
  options?: Record<string, unknown>;
}

interface DashboardData {
  title: string;
  kpis: KPI[];
  charts: DashboardChart[];
}

export function renderDashboard(container: HTMLElement, payload: DashboardData): void {
  const { title, kpis, charts } = payload;

  const kpiHtml = kpis.length > 0
    ? `<div class="kpi-row">${kpis.map((k, i) => buildKpiCard(k, i)).join("")}</div>`
    : "";

  const chartsHtml = charts
    .map(
      (c, i) => `
      <div class="card chart-card" style="animation-delay: ${(kpis.length + i) * 0.08 + 0.05}s">
        <div class="chart-card__header">
          <div>
            <div class="chart-card__title">${escapeHtml(c.title ?? `Chart ${i + 1}`)}</div>
          </div>
        </div>
        <div class="chart-card__body">
          <canvas id="dash-chart-${i}"></canvas>
        </div>
      </div>
    `
    )
    .join("");

  const downloadSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
  const refreshSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;

  container.innerHTML = `
    <div class="dashboard">
      <div class="header">
        <div class="header__brand">
          <span class="header__dot"></span>
          ${escapeHtml(title)}
        </div>
        <div class="header__right">
          <span class="header__meta">${new Date().toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
          <button class="export-btn" id="dash-download" title="Download all charts as PNG">${downloadSvg}</button>
          <button class="export-btn" id="dash-refresh" title="Refresh data">${refreshSvg}</button>
        </div>
      </div>
      <div class="dashboard-main">
        ${kpiHtml}
        <div class="chart-grid">
          ${chartsHtml}
        </div>
      </div>
    </div>
  `;

  // Overall dashboard download - clone off-screen, prep the clone, screenshot it
  container.querySelector("#dash-download")?.addEventListener("click", async () => {
    const dashEl = container.querySelector<HTMLElement>(".dashboard");
    if (!dashEl) return;

    // Clone the dashboard so the live DOM is never touched
    const clone = dashEl.cloneNode(true) as HTMLElement;

    // Match exact dimensions of the original
    const rect = dashEl.getBoundingClientRect();
    clone.style.cssText = `position:fixed;left:-9999px;top:0;width:${rect.width}px;pointer-events:none;`;
    document.body.appendChild(clone);

    // 1. Swap cloned canvases to <img> (cloned canvases lose pixel data)
    const origCanvases = dashEl.querySelectorAll<HTMLCanvasElement>(".chart-card__body canvas");
    const cloneCanvases = clone.querySelectorAll<HTMLCanvasElement>(".chart-card__body canvas");
    cloneCanvases.forEach((cv, i) => {
      const img = document.createElement("img");
      img.src = origCanvases[i].toDataURL();
      img.style.cssText = `position:absolute;inset:0;width:100%;height:100%;`;
      cv.parentElement!.appendChild(img);
      cv.style.display = "none";
    });

    // 2. Force animations off, opacity on (KPI values use fadeInScale with opacity:0 start)
    const overrideStyle = document.createElement("style");
    overrideStyle.textContent = `[data-mcp-clone] *,[data-mcp-clone] *::before,[data-mcp-clone] *::after{animation:none!important;opacity:1!important;transform:none!important;}`;
    clone.setAttribute("data-mcp-clone", "");
    document.head.appendChild(overrideStyle);

    // 3. Hide action buttons in the clone
    clone.querySelectorAll<HTMLElement>(".header__right .export-btn, .chart-card__actions").forEach((el) => {
      el.style.display = "none";
    });

    try {
      const canvas = await html2canvas(clone, {
        backgroundColor: getCSSVar("--bg-base") || "#0D1117",
        scale: window.devicePixelRatio || 2,
        useCORS: true,
        logging: false,
      });
      await saveCanvasViaServer(canvas, title);
    } catch (e) {
      console.error("Screenshot failed:", e);
    } finally {
      clone.remove();
      overrideStyle.remove();
    }
  });

  // Overall dashboard refresh
  const refreshBtn = container.querySelector<HTMLElement>("#dash-refresh");
  refreshBtn?.addEventListener("click", () => {
    refreshBtn.style.animation = "spin 0.6s linear";
    refreshBtn.addEventListener("animationend", () => { refreshBtn.style.animation = ""; }, { once: true });
    (window as any).__mcpRefresh?.();
  });

  // Wire up KPI click handlers
  container.querySelectorAll<HTMLElement>("[data-kpi-index]").forEach((el) => {
    el.style.cursor = "pointer";
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.kpiIndex ?? "0", 10);
      const kpi = kpis[idx];
      if (!kpi) return;
      const val = `${kpi.prefix ?? ""}${kpi.value}${kpi.suffix ?? ""}`;
      const changeStr = kpi.change !== undefined ? ` (${kpi.change > 0 ? "+" : ""}${kpi.change.toFixed(1)}%)` : "";
      sendClickMessage(`${kpi.label}: ${val}${changeStr}`);
    });
  });

  // Render each chart after DOM is ready
  requestAnimationFrame(() => {
    charts.forEach((c, i) => {
      const canvas = container.querySelector<HTMLCanvasElement>(`#dash-chart-${i}`);
      if (!canvas) return;
      renderChartWidget(canvas, c);
    });
  });
}

function buildKpiCard(kpi: KPI, index: number): string {
  const val = `${kpi.prefix ?? ""}${typeof kpi.value === "number" ? kpi.value.toLocaleString() : kpi.value}${kpi.suffix ?? ""}`;

  let trendHtml = "";
  if (kpi.change !== undefined) {
    const dir = kpi.change > 0 ? "up" : kpi.change < 0 ? "down" : "flat";
    const arrow = kpi.change > 0 ? "\u25B2" : kpi.change < 0 ? "\u25BC" : "\u25CF";
    const cls = kpi.change > 0 ? "card--positive" : kpi.change < 0 ? "card--negative" : "card--neutral";

    trendHtml = `
      <div class="kpi__trend">
        <span class="kpi__delta kpi__delta--${dir}">
          <span class="kpi__delta-arrow">${arrow}</span>
          ${Math.abs(kpi.change).toFixed(1)}%
        </span>
      </div>
    `;

    return `
      <div class="card kpi ${cls}" data-kpi-index="${index}" style="animation-delay: ${index * 0.08 + 0.05}s">
        <span class="kpi__label">${escapeHtml(kpi.label)}</span>
        <span class="kpi__value">${val}</span>
        ${trendHtml}
      </div>
    `;
  }

  return `
    <div class="card kpi card--accent" data-kpi-index="${index}" style="animation-delay: ${index * 0.08 + 0.05}s">
      <span class="kpi__label">${escapeHtml(kpi.label)}</span>
      <span class="kpi__value">${val}</span>
    </div>
  `;
}

function renderChartWidget(canvas: HTMLCanvasElement, chart: DashboardChart): void {
  if (chart.type === "pie") {
    const data = chart.data ?? [];
    const total = data.reduce((s, d) => s + d.value, 0);
    const colors = data.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);
    const isDonut = (chart.options?.donut as boolean) === true;

    const chartTitle = chart.title ?? "chart";
    const pieChart = new Chart(canvas, {
      type: isDonut ? "doughnut" : "pie",
      data: {
        labels: data.map((d) => d.label),
        datasets: [{
          data: data.map((d) => d.value),
          backgroundColor: colors,
          borderColor: getCSSVar("--bg-card"),
          borderWidth: 2,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: isDonut ? "55%" : 0,
        onClick: (_event, elements) => {
          if (elements.length === 0) return;
          const el = elements[0];
          const item = data[el.index];
          const pct = ((item.value / total) * 100).toFixed(1);
          sendClickMessage(`${item.label}: ${item.value.toLocaleString()} (${pct}%) in "${chartTitle}"`);
        },
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: getCSSVar("--text-secondary"), boxWidth: 10, font: { size: 10 } },
          },
          tooltip: {
            ...tooltipStyle(),
            callbacks: {
              label: (ctx) => {
                const pct = ((ctx.parsed / total) * 100).toFixed(1);
                return ` ${ctx.label}: ${ctx.parsed.toLocaleString()} (${pct}%)`;
              },
            },
          },
        },
      },
    });
    deferResize(pieChart);
    const pieCard = canvas.closest<HTMLElement>(".chart-card");
    if (pieCard) addExportButton(pieCard, pieChart, chartTitle);
    return;
  }

  if (chart.type === "bar") {
    const labels = chart.labels ?? [];
    const datasets = chart.datasets ?? [];
    const isStacked = (chart.options?.stacked as boolean) === true;
    const isHorizontal = (chart.options?.horizontal as boolean) === true;

    const barTitle = chart.title ?? "chart";
    const barChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: datasets.map((ds, i) => ({
          label: ds.label,
          data: ds.data,
          backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + "CC",
          borderColor: CHART_COLORS[i % CHART_COLORS.length],
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
        })),
      },
      options: {
        indexAxis: isHorizontal ? "y" : "x",
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_event, elements) => {
          if (elements.length === 0) return;
          const el = elements[0];
          const label = labels[el.index];
          const values = datasets.map((ds) => `${ds.label}: ${ds.data[el.index]?.toLocaleString()}`).join(", ");
          sendClickMessage(`${label} (${values}) in "${barTitle}"`);
        },
        scales: {
          x: { stacked: isStacked, border: { display: false }, grid: { display: isHorizontal, color: getCSSVar("--border") }, ticks: { color: getCSSVar("--text-secondary"), font: { size: 10 } } },
          y: { stacked: isStacked, border: { display: false }, grid: { display: !isHorizontal, color: getCSSVar("--border") }, ticks: { color: getCSSVar("--text-secondary"), font: { size: 10 } } },
        },
        plugins: {
          legend: { display: datasets.length > 1, position: "top", align: "end", labels: { color: getCSSVar("--text-secondary"), boxWidth: 8, font: { size: 10 } } },
          tooltip: tooltipStyle(),
        },
      },
    });
    deferResize(barChart);
    const barCard = canvas.closest<HTMLElement>(".chart-card");
    if (barCard) addExportButton(barCard, barChart, barTitle);
    return;
  }

  if (chart.type === "line") {
    const labels = chart.labels ?? [];
    const datasets = chart.datasets ?? [];
    const shouldFill = (chart.options?.fill as boolean) !== false;
    const isSmooth = (chart.options?.smooth as boolean) !== false;

    const lineTitle = chart.title ?? "chart";
    const lineChart = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: datasets.map((ds, i) => {
          const color = CHART_COLORS[i % CHART_COLORS.length];
          return {
            label: ds.label,
            data: ds.data,
            borderColor: color,
            borderWidth: 2,
            tension: isSmooth ? 0.4 : 0,
            fill: shouldFill,
            backgroundColor: (ctx: any) => {
              if (!shouldFill) return "transparent";
              const grad = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
              grad.addColorStop(0, color + "40");
              grad.addColorStop(1, color + "00");
              return grad;
            },
            pointRadius: 0,
            pointHoverRadius: 5,
            pointBackgroundColor: color,
            pointBorderColor: getCSSVar("--bg-card"),
            pointBorderWidth: 2,
          };
        }),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        onClick: (_event, elements) => {
          if (elements.length === 0) return;
          const el = elements[0];
          const label = labels[el.index];
          const values = datasets.map((ds) => `${ds.label}: ${ds.data[el.index]?.toLocaleString()}`).join(", ");
          sendClickMessage(`${label} (${values}) in "${lineTitle}"`);
        },
        scales: {
          x: { border: { display: false }, grid: { display: false }, ticks: { color: getCSSVar("--text-secondary"), font: { size: 10 } } },
          y: { border: { display: false }, grid: { color: getCSSVar("--border"), drawTicks: false }, ticks: { color: getCSSVar("--text-secondary"), font: { size: 10 }, padding: 8 } },
        },
        plugins: {
          legend: { display: datasets.length > 1, position: "top", align: "end", labels: { color: getCSSVar("--text-secondary"), boxWidth: 8, font: { size: 10 } } },
          tooltip: tooltipStyle(),
        },
      },
    });
    deferResize(lineChart);
    const lineCard = canvas.closest<HTMLElement>(".chart-card");
    if (lineCard) addExportButton(lineCard, lineChart, lineTitle);
  }
}