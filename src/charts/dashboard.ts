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
  RadarController,
  RadialLinearScale,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { TreemapController, TreemapElement } from "chartjs-chart-treemap";
import { SankeyController, Flow } from "chartjs-chart-sankey";
import { WordCloudController, WordElement } from "chartjs-chart-wordcloud";
import { BoxPlotController, BoxAndWiskers, ViolinController, Violin as ViolinElement } from "@sgratzl/chartjs-chart-boxplot";
import { ChoroplethController, BubbleMapController, GeoFeature, ColorScale, SizeScale, ProjectionScale } from "chartjs-chart-geo";
import { feature } from "topojson-client";
import worldAtlas from "world-atlas/countries-110m.json";
import html2canvas from "html2canvas-pro";
import { getCSSVar, tooltipStyle, escapeHtml, deferResize, sendClickMessage, addExportButton, addHtmlExportButton, addRefreshButton, saveCanvasViaServer, resolveColors, registerChart, getChartEntry, showToast, resolveShimmerForExport, addCanvasZoom } from "./shared.js";
import { resolveTheme, applyTheme } from "../themes.js";
import { renderHeroRing, renderHeroWidget } from "./hero.js";
import { ALPHA2_TO_NUMERIC, NUMERIC_TO_ALPHA2, COLOR_SCALES } from "./geo.js";

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  PieController,
  DoughnutController,
  RadarController,
  RadialLinearScale,
  TreemapController,
  TreemapElement,
  SankeyController,
  Flow,
  WordCloudController,
  WordElement,
  BoxPlotController,
  BoxAndWiskers,
  ViolinController,
  ViolinElement,
  ChoroplethController,
  BubbleMapController,
  GeoFeature,
  ColorScale,
  SizeScale,
  ProjectionScale,
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
  sparkline?: number[];
}

interface DashboardChart {
  type: string;
  title?: string;
  data?: Array<{ label: string; value: number }> | Record<string, unknown>;
  labels?: string[];
  datasets?: Array<{ label: string; data: (number | null)[] }>;
  options?: Record<string, unknown>;
  span?: number;
  [key: string]: unknown;
}

interface HeroData {
  variant?: string;
  value?: string | number;
  unit?: string;
  label?: string;
  progress?: number;
  color?: string;
  size?: "sm" | "md" | "lg" | "xl";
  [key: string]: unknown;
}

interface FooterData {
  text?: string;
  lastUpdated?: string;
}

interface DashboardData {
  title: string;
  kpis: KPI[];
  charts: DashboardChart[];
  columns?: number;
  theme?: string;
  palette?: string;
  typography?: string;
  effects?: string;
  hero?: HeroData | HeroData[];
  footer?: FooterData;
  layout?: "default" | "hero-center" | "kpi-top";
}

// ── Color helpers for screenshot fallbacks (color-mix → rgba) ──

function _parseColor(c: string): [number, number, number] {
  c = c.trim();
  if (c.startsWith("#")) {
    let h = c.slice(1);
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    return [parseInt(h.slice(0,2), 16), parseInt(h.slice(2,4), 16), parseInt(h.slice(4,6), 16)];
  }
  const rgb = c.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (rgb) return [Math.round(+rgb[1]), Math.round(+rgb[2]), Math.round(+rgb[3])];
  const srgb = c.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (srgb) return [Math.round(+srgb[1]*255), Math.round(+srgb[2]*255), Math.round(+srgb[3]*255)];
  return [99, 102, 241];
}

function _rgba(color: string, pct: number): string {
  const [r, g, b] = _parseColor(color);
  return `rgba(${r},${g},${b},${pct / 100})`;
}

function _mixBlack(color: string, pct: number): string {
  const [r, g, b] = _parseColor(color);
  const f = pct / 100;
  return `rgb(${Math.round(r*f)},${Math.round(g*f)},${Math.round(b*f)})`;
}

function _mixTwo(a: string, pctA: number, b: string): string {
  const [r1, g1, b1] = _parseColor(a);
  const [r2, g2, b2] = _parseColor(b);
  const f = pctA / 100;
  return `rgb(${Math.round(r1*f + r2*(1-f))},${Math.round(g1*f + g2*(1-f))},${Math.round(b1*f + b2*(1-f))})`;
}

export function renderDashboard(container: HTMLElement, payload: DashboardData): void {
  const { title, kpis, charts } = payload;
  const layout = payload.layout || "default";

  // Apply theme if specified
  const theme = resolveTheme(payload.theme, {
    palette: payload.palette,
    typography: payload.typography,
    effects: payload.effects,
  });
  if (theme) applyTheme(container, theme);

  const shimmerClass = theme?.effects.shimmerTitle ? " shimmer-text" : "";

  const kpiHtml = kpis.length > 0
    ? `<div class="kpi-row">${kpis.map((k, i) => buildKpiCard(k, i)).join("")}</div>`
    : "";

  // Normalize hero to array
  const heroes: HeroData[] = payload.hero
    ? (Array.isArray(payload.hero) ? payload.hero : [payload.hero])
    : [];

  const heroHtml = heroes.length > 0
    ? `<div class="dashboard-hero" id="dash-hero"></div>`
    : "";

  const canvasTypes = new Set(["pie", "bar", "line", "radar", "treemap", "sankey", "wordcloud", "boxplot", "geo", "bubble_map"]);
  const heroTypes = new Set(["hero_ring", "hero"]);

  const chartsHtml = charts
    .map(
      (c, i) => {
        const delay = `animation-delay: ${(kpis.length + i) * 0.08 + 0.05}s`;
        const spanStyle = c.span && c.span > 1 ? `grid-column: span ${c.span};` : "";
        const style = [delay, spanStyle].filter(Boolean).join(";");
        if (heroTypes.has(c.type)) {
          return `
            <div class="card chart-card" style="${style}">
              <div class="chart-card__header">
                <div>
                  <div class="chart-card__title${shimmerClass}">${escapeHtml(c.title ?? `Chart ${i + 1}`)}</div>
                </div>
              </div>
              <div class="chart-card__body chart-card__body--css" style="display:flex;align-items:center;justify-content:center;" id="dash-hero-widget-${i}"></div>
            </div>
          `;
        }
        if (canvasTypes.has(c.type)) {
          return `
            <div class="card chart-card" style="${style}">
              <div class="chart-card__header">
                <div>
                  <div class="chart-card__title${shimmerClass}">${escapeHtml(c.title ?? `Chart ${i + 1}`)}</div>
                </div>
              </div>
              <div class="chart-card__body">
                <canvas id="dash-chart-${i}"></canvas>
              </div>
            </div>
          `;
        }
        // CSS/SVG chart types - render into a div container
        return `<div id="dash-css-chart-${i}" style="${style}"></div>`;
      }
    )
    .join("");

  const footerHtml = payload.footer
    ? `<div class="dashboard-footer">
        <span class="dashboard-footer__text">${escapeHtml(payload.footer.text ?? "")}</span>
        ${payload.footer.lastUpdated ? `<span class="dashboard-footer__updated">${escapeHtml(payload.footer.lastUpdated)}</span>` : ""}
      </div>`
    : "";

  const downloadSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
  const refreshSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;

  // Custom column count or default auto-fill
  const cols = payload.columns;
  const gridStyle = cols
    ? `style="grid-template-columns: repeat(${Math.min(Math.max(cols, 1), 4)}, 1fr)"`
    : "";

  // Layout determines order of hero/KPI/charts
  let mainContent: string;
  if (layout === "kpi-top") {
    mainContent = `${kpiHtml}${heroHtml}<div class="chart-grid" ${gridStyle}>${chartsHtml}</div>`;
  } else if (layout === "hero-center") {
    mainContent = `${heroHtml}${kpiHtml}<div class="chart-grid" ${gridStyle}>${chartsHtml}</div>`;
  } else {
    // default: hero above KPIs
    mainContent = `${heroHtml}${kpiHtml}<div class="chart-grid" ${gridStyle}>${chartsHtml}</div>`;
  }

  container.innerHTML = `
    <div class="dashboard">
      <div class="particles"><div class="particle"></div><div class="particle"></div><div class="particle"></div><div class="particle"></div><div class="particle"></div><div class="particle"></div><div class="particle"></div><div class="particle"></div><div class="particle"></div><div class="particle"></div></div>
      <div class="header">
        <div class="header__brand">
          <span class="header__dot"></span>
          <span class="${shimmerClass.trim()}">${escapeHtml(title)}</span>
        </div>
        <div class="header__right">
          <span class="header__meta">${new Date().toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
          <div class="export-dropdown" id="dash-download-wrap">
            <button class="export-btn" id="dash-download" title="Download as PNG">${downloadSvg}</button>
            <div class="export-dropdown__menu">
              <button data-mode="full">Full Image</button>
              <button data-mode="ppt-title">PPT Title Slide</button>
              <button data-mode="ppt-bg">PPT Background</button>
              <button data-mode="document">Document (A4)</button>
            </div>
          </div>
          <button class="export-btn" id="dash-refresh" title="Refresh data">${refreshSvg}</button>
        </div>
      </div>
      <div class="dashboard-main">
        ${mainContent}
        ${footerHtml}
      </div>
    </div>
  `;

  // Export dropdown wiring
  const dashEl = container.querySelector<HTMLElement>(".dashboard")!;
  const downloadBtn = container.querySelector<HTMLElement>("#dash-download");
  const downloadMenu = container.querySelector<HTMLElement>(".export-dropdown__menu");

  downloadBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    downloadMenu?.classList.toggle("open");
  });

  downloadMenu?.querySelectorAll<HTMLElement>("button[data-mode]").forEach(btn => {
    btn.addEventListener("click", async () => {
      downloadMenu?.classList.remove("open");
      const mode = btn.dataset.mode as "full" | "ppt-title" | "ppt-bg" | "document";
      await _exportDashboard(dashEl, title, mode);
    });
  });

  document.addEventListener("click", () => downloadMenu?.classList.remove("open"));

  // Overall dashboard refresh
  const refreshBtn = container.querySelector<HTMLElement>("#dash-refresh");
  refreshBtn?.addEventListener("click", () => {
    refreshBtn.style.animation = "spin 0.6s linear";
    refreshBtn.addEventListener("animationend", () => { refreshBtn.style.animation = ""; }, { once: true });
    (window as any).__mcpRefresh?.();
  });

  // Dashboard title click handler
  const brandEl = container.querySelector<HTMLElement>(".header__brand");
  if (brandEl) {
    brandEl.style.cursor = "pointer";
    brandEl.addEventListener("click", () => {
      sendClickMessage(`[Dashboard] "${title}"`);
    });
  }

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

  // Render hero section if present
  if (heroes.length > 0) {
    const heroEl = container.querySelector<HTMLElement>("#dash-hero");
    if (heroEl) {
      if (heroes.length === 1) {
        const h = heroes[0];
        if (h.variant && h.variant !== "progress_ring") {
          renderHeroWidget(heroEl, h);
        } else {
          renderHeroRing(heroEl, {
            value: h.value ?? "",
            unit: h.unit,
            label: h.label,
            progress: h.progress,
            color: h.color,
            size: h.size || "lg",
            style: h.style as "ring" | "gauge" | undefined,
          });
        }
      } else {
        heroEl.classList.add("dashboard-hero--multi");
        heroes.forEach((h, i) => {
          const slot = document.createElement("div");
          slot.className = "dashboard-hero__slot";
          heroEl.appendChild(slot);
          if (h.variant && h.variant !== "progress_ring") {
            renderHeroWidget(slot, h);
          } else {
            renderHeroRing(slot, {
              value: h.value ?? "",
              unit: h.unit,
              label: h.label,
              progress: h.progress,
              color: h.color,
              size: h.size || "md",
              style: h.style as "ring" | "gauge" | undefined,
            });
          }
        });
      }
    }
  }

  // Render each chart after DOM is ready
  requestAnimationFrame(() => {
    charts.forEach((c, i) => {
      try {
      // Handle hero_ring / hero widget type
      if (heroTypes.has(c.type)) {
        const heroWidgetEl = container.querySelector<HTMLElement>(`#dash-hero-widget-${i}`);
        if (heroWidgetEl) {
          const heroData = (c.data ?? {}) as Record<string, unknown>;
          if (heroData.variant && heroData.variant !== "progress_ring") {
            renderHeroWidget(heroWidgetEl, heroData);
          } else {
            renderHeroRing(heroWidgetEl, {
              value: (heroData.value as string | number) ?? "",
              unit: heroData.unit as string | undefined,
              label: heroData.label as string | undefined,
              progress: heroData.progress as number | undefined,
              color: heroData.color as string | undefined,
              size: (heroData.size as "sm" | "md" | "lg" | "xl") || "md",
              style: heroData.style as "ring" | "gauge" | undefined,
            });
          }
          // Add export/refresh buttons to the hero chart-card
          const heroCard = heroWidgetEl.closest<HTMLElement>(".chart-card");
          if (heroCard) {
            addHtmlExportButton(heroCard, c.title ?? `Chart ${i + 1}`);
            addRefreshButton(heroCard, () => (window as any).__mcpRefresh?.());
          }
        }
        return;
      }

      // Chart.js canvas types
      if (canvasTypes.has(c.type)) {
        const canvas = container.querySelector<HTMLCanvasElement>(`#dash-chart-${i}`);
        if (!canvas) return;
        renderChartWidget(canvas, c);
        return;
      }

      // CSS/SVG chart types - delegate to registry
      const cssEl = container.querySelector<HTMLElement>(`#dash-css-chart-${i}`);
      if (!cssEl) return;
      const entry = getChartEntry(c.type);
      if (entry) {
        // Build payload from chart widget data
        const payload = { type: c.type, title: c.title ?? "", ...c.data as object, ...(c as Record<string, unknown>) };
        entry.render(cssEl, payload);
      }
      } catch (err) { console.error(`Dashboard chart ${i} (${c.type}) failed:`, err); }
    });
  });

  // Masonry layout - each card spans exactly its content height in 1px rows
  const chartGrid = container.querySelector<HTMLElement>(".chart-grid");
  if (chartGrid) {
    let masonryRAF = 0;
    function applyMasonry(grid: HTMLElement): void {
      const gap = parseFloat(getComputedStyle(grid).rowGap) || 0;
      const items = grid.querySelectorAll<HTMLElement>(':scope > .card, :scope > [id^="dash-css-chart-"]');

      // Clamp column spans to actual column count to prevent overflow
      const cols = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
      items.forEach(card => {
        const colSpan = parseInt(card.style.gridColumn?.replace("span ", "") || "1", 10);
        if (colSpan > cols) card.style.gridColumn = `span ${cols}`;
      });

      items.forEach(card => { card.style.gridRowEnd = ""; });
      grid.offsetHeight; // force reflow to measure natural heights
      items.forEach(card => {
        const span = Math.ceil((card.scrollHeight + gap) / (1 + gap));
        card.style.gridRowEnd = `span ${span}`;
      });
    }

    requestAnimationFrame(() => applyMasonry(chartGrid));
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(masonryRAF);
      masonryRAF = requestAnimationFrame(() => applyMasonry(chartGrid));
    });
    chartGrid.querySelectorAll<HTMLElement>(':scope > .card, :scope > [id^="dash-css-chart-"]').forEach(card => ro.observe(card));
  }
}

function buildKpiSparkSVG(data: number[], color: string): string {
  if (data.length < 2) return "";
  const w = 100;
  const h = 20;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 2) - 1;
    return `${x},${y}`;
  });

  const linePath = `M${points.join(" L")}`;
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`;

  return `
    <svg class="kpi__sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <path d="${areaPath}" fill="${color}" opacity="0.15" />
      <path d="${linePath}" stroke="${color}" stroke-width="1.5" fill="none" />
    </svg>
  `;
}

function buildKpiCard(kpi: KPI, index: number): string {
  const val = `${kpi.prefix ?? ""}${typeof kpi.value === "number" ? kpi.value.toLocaleString() : kpi.value}${kpi.suffix ?? ""}`;

  let trendHtml = "";
  let sparkHtml = "";
  if (kpi.change !== undefined) {
    const dir = kpi.change > 0 ? "up" : kpi.change < 0 ? "down" : "flat";
    const arrow = kpi.change > 0 ? "\u25B2" : kpi.change < 0 ? "\u25BC" : "\u25CF";
    const cls = kpi.change > 0 ? "card--positive" : kpi.change < 0 ? "card--negative" : "card--neutral";
    const sparkColor = kpi.change > 0
      ? "var(--positive)" : kpi.change < 0
      ? "var(--negative)" : "var(--accent)";

    trendHtml = `
      <div class="kpi__trend">
        <span class="kpi__delta kpi__delta--${dir}">
          <span class="kpi__delta-arrow">${arrow}</span>
          ${Math.abs(kpi.change).toFixed(1)}%
        </span>
      </div>
    `;

    if (kpi.sparkline && kpi.sparkline.length >= 2) {
      sparkHtml = buildKpiSparkSVG(kpi.sparkline, sparkColor);
    }

    return `
      <div class="card kpi ${cls}" data-kpi-index="${index}" style="animation-delay: ${index * 0.08 + 0.05}s">
        <span class="kpi__label">${escapeHtml(kpi.label)}</span>
        <span class="kpi__value">${val}</span>
        ${trendHtml}
        ${sparkHtml}
      </div>
    `;
  }

  // No change - static KPI (sparkline without change still gets accent color)
  if (kpi.sparkline && kpi.sparkline.length >= 2) {
    sparkHtml = buildKpiSparkSVG(kpi.sparkline, "var(--accent)");
  }

  return `
    <div class="card kpi card--accent" data-kpi-index="${index}" style="animation-delay: ${index * 0.08 + 0.05}s">
      <span class="kpi__label">${escapeHtml(kpi.label)}</span>
      <span class="kpi__value">${val}</span>
      ${sparkHtml}
    </div>
  `;
}

function renderChartWidget(canvas: HTMLCanvasElement, chart: DashboardChart): void {
  if (chart.type === "pie") {
    const data = (chart.data ?? []) as Array<{ label: string; value: number }>;
    const palette = resolveColors(undefined, data.length);
    const total = data.reduce((s, d) => s + d.value, 0);
    const colors = data.map((_, i) => palette[i % palette.length]);
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
          spacing: 2,
          hoverBorderWidth: 2,
          hoverBorderColor: getCSSVar("--text-primary"),
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
    const palette = resolveColors(undefined, datasets.length);
    const isStacked = (chart.options?.stacked as boolean) === true;
    const isHorizontal = (chart.options?.horizontal as boolean) === true;

    const barTitle = chart.title ?? "chart";
    const barChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: datasets.map((ds: any, i: number) => {
          const base = palette[i % palette.length];
          const bg = ds.colors ? ds.colors.map((c: string) => c + "CC") : base + "CC";
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
    const palette = resolveColors(undefined, datasets.length);
    const shouldFill = (chart.options?.fill as boolean) !== false;
    const isSmooth = (chart.options?.smooth as boolean) !== false;

    const lineTitle = chart.title ?? "chart";
    const lineChart = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: datasets.map((ds, i) => {
          const color = palette[i % palette.length];
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
    return;
  }

  if (chart.type === "radar") {
    const labels = chart.labels ?? [];
    const datasets = chart.datasets ?? [];
    const palette = resolveColors(undefined, datasets.length);
    const shouldFill = (chart.options?.fill as boolean) !== false;
    const tension = (chart.options?.tension as number) ?? 0.1;

    const radarTitle = chart.title ?? "chart";
    const radarChart = new Chart(canvas, {
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
            pointRadius: 3,
            pointHoverRadius: 5,
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
          sendClickMessage(`${ds.label} - ${label}: ${value} in "${radarTitle}"`);
        },
        scales: {
          r: {
            beginAtZero: true,
            angleLines: { color: getCSSVar("--border") },
            grid: { color: getCSSVar("--border") },
            pointLabels: { color: getCSSVar("--text-secondary"), font: { size: 10 } },
            ticks: { color: getCSSVar("--text-muted"), backdropColor: "transparent", font: { size: 9 } },
          },
        },
        plugins: {
          legend: { display: datasets.length > 1, position: "top", align: "end", labels: { color: getCSSVar("--text-secondary"), boxWidth: 8, font: { size: 10 } } },
          tooltip: tooltipStyle(),
        },
      },
    });
    deferResize(radarChart);
    const radarCard = canvas.closest<HTMLElement>(".chart-card");
    if (radarCard) addExportButton(radarCard, radarChart, radarTitle);
    return;
  }

  if (chart.type === "treemap") {
    const items = (chart.data ?? []) as Array<{ label: string; value: number; group?: string }>;
    const hasGroups = items.some(d => d.group);
    const groups = hasGroups ? ["group", "label"] : ["label"];
    const uniqueKeys = hasGroups
      ? [...new Set(items.map(d => d.group ?? "Other"))]
      : items.map(d => d.label);
    const palette = resolveColors(undefined, uniqueKeys.length);
    const colorMap = new Map<string, string>();
    uniqueKeys.forEach((g, i) => colorMap.set(g, palette[i % palette.length]));

    const treemapTitle = chart.title ?? "chart";
    const treemapChart = new Chart(canvas, {
      type: "treemap" as any,
      data: {
        datasets: [{
          tree: items.map(d => ({ label: d.label, value: d.value, group: d.group ?? "Other" })),
          key: "value",
          groups,
          borderWidth: 1,
          borderColor: getCSSVar("--bg-card"),
          spacing: 1,
          backgroundColor: (ctx: any) => {
            if (!ctx.raw?._data) return palette[0] + "CC";
            const key = hasGroups ? ctx.raw._data.group : ctx.raw._data.label;
            return (colorMap.get(key) ?? palette[0]) + "CC";
          },
          labels: {
            display: true,
            color: getCSSVar("--text-primary"),
            font: { size: 10, weight: "600" as any },
            formatter: (ctx: any) => ctx.raw?._data?.label ?? "",
          },
          captions: {
            display: hasGroups,
            color: getCSSVar("--text-secondary"),
            font: { size: 9 },
            padding: 3,
          },
        }] as any,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_event, elements) => {
          if (elements.length === 0) return;
          const raw = (elements[0] as any).element?.$context?.raw?._data;
          if (raw) sendClickMessage(`${raw.label}: ${raw.value?.toLocaleString()} in "${treemapTitle}"`);
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipStyle(),
            callbacks: {
              title: (items: any[]) => items[0]?.raw?._data?.label ?? "",
              label: (ctx: any) => ` Value: ${ctx.raw?._data?.value?.toLocaleString()}`,
            },
          },
        },
      },
    });
    deferResize(treemapChart);
    const treemapCard = canvas.closest<HTMLElement>(".chart-card");
    if (treemapCard) addExportButton(treemapCard, treemapChart, treemapTitle);
    const treemapBody = canvas.closest<HTMLElement>(".chart-card__body");
    if (treemapBody) addCanvasZoom(treemapBody, canvas, treemapChart);
    return;
  }

  if (chart.type === "sankey") {
    const flows = (chart.data ?? []) as Array<{ from: string; to: string; flow: number }>;
    const nodes = [...new Set(flows.flatMap(d => [d.from, d.to]))];
    const palette = resolveColors(undefined, nodes.length);
    const colorMap = new Map<string, string>();
    nodes.forEach((n, i) => colorMap.set(n, palette[i % palette.length]));

    const sankeyTitle = chart.title ?? "chart";
    const sankeyChart = new Chart(canvas, {
      type: "sankey" as any,
      data: {
        datasets: [{
          data: flows,
          colorFrom: (ctx: any) => {
            const f = ctx.dataset.data[ctx.dataIndex];
            return f ? (colorMap.get(f.from) ?? palette[0]) : palette[0];
          },
          colorTo: (ctx: any) => {
            const f = ctx.dataset.data[ctx.dataIndex];
            return f ? (colorMap.get(f.to) ?? palette[1]) : palette[1];
          },
          colorMode: "gradient",
          borderWidth: 0,
          nodeWidth: 10,
          color: getCSSVar("--text-primary"),
          font: { size: 10 },
        }] as any,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_event, elements) => {
          if (elements.length === 0) return;
          const flow = flows[(elements[0] as any).index];
          if (flow) sendClickMessage(`${flow.from} → ${flow.to}: ${flow.flow.toLocaleString()} in "${sankeyTitle}"`);
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipStyle(),
            callbacks: {
              label: (ctx: any) => {
                const f = ctx.dataset.data[ctx.dataIndex];
                return f ? `${f.from} → ${f.to}: ${f.flow.toLocaleString()}` : "";
              },
            },
          },
        },
      },
    });
    deferResize(sankeyChart);
    const sankeyCard = canvas.closest<HTMLElement>(".chart-card");
    if (sankeyCard) addExportButton(sankeyCard, sankeyChart, sankeyTitle);
    return;
  }

  if (chart.type === "wordcloud") {
    const words = (chart.data ?? []) as Array<{ text: string; value: number }>;
    const palette = resolveColors(undefined, Math.min(words.length, 10));
    const maxVal = Math.max(...words.map(d => d.value));
    const minVal = Math.min(...words.map(d => d.value));
    const range = maxVal - minVal || 1;

    const wcTitle = chart.title ?? "chart";
    const wcChart = new Chart(canvas, {
      type: "wordCloud" as any,
      data: {
        labels: words.map(d => d.text),
        datasets: [{
          data: words.map(d => 10 + ((d.value - minVal) / range) * 30),
          color: words.map((_, i) => palette[i % palette.length]),
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_event, elements) => {
          if (elements.length === 0) return;
          const item = words[elements[0].index];
          if (item) sendClickMessage(`"${item.text}": ${item.value} in "${wcTitle}"`);
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipStyle(),
            callbacks: {
              label: (ctx: any) => {
                const item = words[ctx.dataIndex];
                return item ? `${item.text}: ${item.value.toLocaleString()}` : "";
              },
            },
          },
        },
      },
    });
    deferResize(wcChart);
    const wcCard = canvas.closest<HTMLElement>(".chart-card");
    if (wcCard) addExportButton(wcCard, wcChart, wcTitle);
    return;
  }

  if (chart.type === "boxplot") {
    const labels = chart.labels ?? [];
    const datasets = (chart.datasets ?? []) as Array<{ label: string; data: number[][] }>;
    const palette = resolveColors(undefined, datasets.length);
    const style = (chart.options?.style as string) ?? "boxplot";
    const isHorizontal = (chart.options?.horizontal as boolean) === true;

    const bpTitle = chart.title ?? "chart";
    const bpChart = new Chart(canvas, {
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
            outlierRadius: 2,
            itemRadius: 0,
            medianColor: getCSSVar("--text-primary"),
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
          sendClickMessage(`${datasets[el.datasetIndex]?.label} - ${label} in "${bpTitle}"`);
        },
        scales: {
          x: { border: { display: false }, grid: { display: isHorizontal, color: getCSSVar("--border") }, ticks: { color: getCSSVar("--text-secondary"), font: { size: 10 } } },
          y: { border: { display: false }, grid: { display: !isHorizontal, color: getCSSVar("--border") }, ticks: { color: getCSSVar("--text-secondary"), font: { size: 10 } } },
        },
        plugins: {
          legend: { display: datasets.length > 1, position: "top", align: "end", labels: { color: getCSSVar("--text-secondary"), boxWidth: 8, font: { size: 10 } } },
          tooltip: tooltipStyle(),
        },
      },
    });
    deferResize(bpChart);
    const bpCard = canvas.closest<HTMLElement>(".chart-card");
    if (bpCard) addExportButton(bpCard, bpChart, bpTitle);
    return;
  }

  if (chart.type === "geo") {
    const geoData = (chart.data ?? {}) as Record<string, number>;
    const projection = (chart.options?.projection as string) ?? "naturalEarth1";
    const colorScaleKey = (chart.options?.colorScale as string) ?? "blue";
    const showLegend = (chart.options?.showLegend as boolean) !== false;
    const missingColor = (chart.options?.missingColor as string) ?? "rgba(128, 140, 160, 0.15)";

    const countries = (feature(worldAtlas as any, (worldAtlas as any).objects.countries) as any).features as any[];
    const valueMap = new Map<string, number>();
    for (const [code, value] of Object.entries(geoData)) {
      const numericId = ALPHA2_TO_NUMERIC[code.toUpperCase()];
      if (numericId) valueMap.set(numericId, value);
    }
    const interpolate = COLOR_SCALES[colorScaleKey] ?? COLOR_SCALES.blue;

    const geoTitle = chart.title ?? "chart";
    const geoChart = new Chart(canvas, {
      type: "choropleth" as any,
      data: {
        labels: countries.map((c: any) => c.properties?.name ?? "Unknown"),
        datasets: [{
          outline: countries,
          data: countries.map((c: any) => ({
            feature: c,
            value: valueMap.get(String(c.id)) ?? null,
          })),
          outlineBorderColor: getCSSVar("--text-muted") || "#666",
          outlineBorderWidth: 0.5,
          borderColor: getCSSVar("--text-muted") || "#666",
          borderWidth: 0.3,
        }] as any,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_event: any, elements: any[]) => {
          if (elements.length === 0) return;
          const idx = elements[0].index;
          const feat = countries[idx];
          const name = feat.properties?.name ?? "Unknown";
          const numId = String(feat.id);
          const alpha2 = NUMERIC_TO_ALPHA2[numId] ?? numId;
          const val = valueMap.get(numId);
          sendClickMessage(val != null
            ? `${name} (${alpha2}): ${val.toLocaleString()} in "${geoTitle}"`
            : `${name} (${alpha2}): no data in "${geoTitle}"`);
        },
        scales: {
          projection: { axis: "x" as const, projection },
          color: {
            axis: "x" as const,
            interpolate,
            display: showLegend,
            missing: missingColor,
            legend: { position: "bottom-right" as const, align: "right" as const, length: 100, width: 8, indicatorWidth: 6 },
          },
        } as any,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipStyle(),
            callbacks: {
              label: (ctx: any) => {
                const feat = countries[ctx.dataIndex];
                const name = feat?.properties?.name ?? "Unknown";
                const val = ctx.raw?.value;
                return val != null ? ` ${name}: ${val.toLocaleString()}` : ` ${name}: No data`;
              },
            },
          },
        },
      } as any,
    });
    deferResize(geoChart);
    const geoCard = canvas.closest<HTMLElement>(".chart-card");
    if (geoCard) addExportButton(geoCard, geoChart, geoTitle);
    const geoBody = canvas.closest<HTMLElement>(".chart-card__body");
    if (geoBody) addCanvasZoom(geoBody, canvas, geoChart);
    return;
  }

  if (chart.type === "bubble_map") {
    const bubbleData = (chart.data ?? []) as Array<{ label: string; latitude: number; longitude: number; value: number }>;
    const projection = (chart.options?.projection as string) ?? "naturalEarth1";
    const sizeRange = (chart.options?.sizeRange as [number, number]) ?? [3, 20];
    const showOutline = (chart.options?.showOutline as boolean) !== false;
    const bubbleColor = (chart.options?.bubbleColor as string) ?? (getCSSVar("--accent") || "rgba(59, 130, 246, 0.7)");

    const countries = (feature(worldAtlas as any, (worldAtlas as any).objects.countries) as any).features as any[];
    const bmTitle = chart.title ?? "chart";

    const bmChart = new Chart(canvas, {
      type: "bubbleMap" as any,
      data: {
        labels: bubbleData.map((d) => d.label),
        datasets: [{
          outline: countries,
          showOutline,
          outlineBorderColor: getCSSVar("--text-muted") || "#666",
          outlineBorderWidth: 0.5,
          backgroundColor: bubbleColor,
          data: bubbleData.map((d) => ({
            longitude: d.longitude,
            latitude: d.latitude,
            value: d.value,
          })),
        }] as any,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_event: any, elements: any[]) => {
          if (elements.length === 0) return;
          const idx = elements[0].index;
          const pt = bubbleData[idx];
          if (pt) sendClickMessage(`${pt.label}: ${pt.value.toLocaleString()} in "${bmTitle}"`);
        },
        scales: {
          projection: { axis: "x" as const, projection },
          size: { axis: "x" as const, display: false, range: sizeRange },
        } as any,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipStyle(),
            callbacks: {
              label: (ctx: any) => {
                const pt = bubbleData[ctx.dataIndex];
                return pt ? ` ${pt.label}: ${pt.value.toLocaleString()}` : "";
              },
            },
          },
        },
      } as any,
    });
    deferResize(bmChart);
    const bmCard = canvas.closest<HTMLElement>(".chart-card");
    if (bmCard) addExportButton(bmCard, bmChart, bmTitle);
    const bmBody = canvas.closest<HTMLElement>(".chart-card__body");
    if (bmBody) {
      const baseRange = [...sizeRange] as [number, number];
      addCanvasZoom(bmBody, canvas, bmChart, (s) => {
        (bmChart.options as any).scales.size.range = [baseRange[0] / s, baseRange[1] / s];
      });
    }
    return;
  }

}

// -- Dashboard export --

async function _exportDashboard(
  dashEl: HTMLElement,
  title: string,
  mode: "full" | "ppt-title" | "ppt-bg" | "document",
): Promise<void> {
  // Clone the dashboard so the live DOM is never touched
  const clone = dashEl.cloneNode(true) as HTMLElement;
  const fullW = Math.max(dashEl.getBoundingClientRect().width, dashEl.scrollWidth);
  clone.style.cssText = `position:fixed;left:-99999px;top:0;width:${fullW}px;pointer-events:none;`;
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

  // 2. Freeze animations/transitions
  const overrideStyle = document.createElement("style");
  overrideStyle.textContent = [
    `[data-mcp-clone] *,[data-mcp-clone] *::before,[data-mcp-clone] *::after{animation:none!important;transition:none!important;}`,
    `[data-mcp-clone] .card,[data-mcp-clone] .chart-wrapper{opacity:1!important;}`,
    `[data-mcp-clone] .card::before{display:none!important;}`,
    `[data-mcp-clone] .card{border-color:rgba(255,255,255,0.08)!important;box-shadow:0 1px 3px rgba(0,0,0,0.4),0 4px 12px rgba(0,0,0,0.3)!important;}`,
  ].join("");
  clone.setAttribute("data-mcp-clone", "");
  document.head.appendChild(overrideStyle);

  // 3. Resolve color-mix() to inline rgba()
  const accent = getComputedStyle(dashEl).getPropertyValue("--accent").trim() || "#6366f1";

  clone.querySelectorAll<HTMLElement>(".hero-orb").forEach(orb => {
    const c = orb.style.getPropertyValue("--orb-color").trim() || accent;
    const aura = orb.querySelector<HTMLElement>(".hero-orb__aura");
    if (aura) {
      aura.style.background = `radial-gradient(circle at 50% 50%, ${_rgba(c, 50)} 0%, ${_rgba(c, 30)} 30%, ${_rgba(c, 12)} 55%, transparent 70%)`;
    }
    const sphere = orb.querySelector<HTMLElement>(".hero-orb__sphere");
    if (sphere) {
      sphere.style.background = `radial-gradient(circle at 45% 45%, ${c} 0%, ${_mixBlack(c, 60)} 40%, ${_rgba(c, 25)} 70%, ${_rgba(c, 10)} 100%)`;
      sphere.style.boxShadow = `0 0 25px ${c}, 0 0 60px ${_rgba(c, 50)}, inset 0 0 40px rgba(255,255,255,0.08), inset 0 0 70px ${_mixBlack(c, 40)}`;
    }
  });

  clone.querySelectorAll<HTMLElement>('.hero-gem[data-gem-bg="dark"] .hero-gem__text').forEach(el => {
    el.style.color = _mixTwo("#f0f0ff", 88, accent);
  });
  clone.querySelectorAll<HTMLElement>('.hero-gem[data-gem-bg="light"] .hero-gem__text').forEach(el => {
    el.style.color = _mixTwo("#1a1a2e", 85, accent);
  });

  // 4. Resolve shimmer gradient text to canvas-rendered images
  resolveShimmerForExport(clone);

  // 5. Hide action buttons in the clone
  clone.querySelectorAll<HTMLElement>(".header__right .export-dropdown, .header__right .export-btn, .chart-card__actions").forEach((el) => {
    el.style.display = "none";
  });

  try {
    const sourceCanvas = await html2canvas(clone, {
      backgroundColor: getCSSVar("--bg-base") || "#0D1117",
      scale: window.devicePixelRatio || 2,
      useCORS: true,
      logging: false,
      windowWidth: fullW,
      windowHeight: clone.scrollHeight,
    });

    if (mode === "full") {
      await saveCanvasViaServer(sourceCanvas, title);
    } else if (mode === "ppt-title") {
      await _exportTitleSlide(clone, sourceCanvas, title, fullW);
    } else if (mode === "ppt-bg") {
      await _exportBackground(clone, sourceCanvas, title, fullW);
    } else {
      await _exportPaginated(clone, sourceCanvas, title, fullW);
    }
  } catch (e: any) {
    console.error("Screenshot failed:", e);
    showToast(`Export failed: ${e.message}`, true);
  } finally {
    clone.remove();
    overrideStyle.remove();
  }
}

async function _exportTitleSlide(
  clone: HTMLElement,
  sourceCanvas: HTMLCanvasElement,
  title: string,
  sourceWidth: number,
): Promise<void> {
  const scale = window.devicePixelRatio || 2;
  const slideW = sourceWidth;
  const slideH = Math.round(sourceWidth * 9 / 16);

  // Measure overhead area (header + hero + KPIs) - everything above the chart grid
  const cloneRect = clone.getBoundingClientRect();
  const chartGrid = clone.querySelector<HTMLElement>(".chart-grid");
  const gridRect = chartGrid?.getBoundingClientRect();
  const overheadH = gridRect ? gridRect.top - cloneRect.top : slideH;

  const out = document.createElement("canvas");
  out.width = Math.round(slideW * scale);
  out.height = Math.round(slideH * scale);
  const ctx = out.getContext("2d")!;
  ctx.scale(scale, scale);

  ctx.fillStyle = getCSSVar("--bg-base") || "#0D1117";
  ctx.fillRect(0, 0, slideW, slideH);

  // Draw the overhead region (header + hero + KPIs), clamped to slide height
  const drawH = Math.min(overheadH, slideH);
  const srcH = Math.round(drawH * scale);
  ctx.drawImage(
    sourceCanvas,
    0, 0, sourceCanvas.width, srcH,
    0, 0, slideW, drawH,
  );

  await saveCanvasViaServer(out, `${title} - Title Slide`);
  showToast("Title slide exported - download individual charts for content slides");
}

async function _exportBackground(
  clone: HTMLElement,
  sourceCanvas: HTMLCanvasElement,
  title: string,
  sourceWidth: number,
): Promise<void> {
  const scale = window.devicePixelRatio || 2;
  const slideW = sourceWidth;
  const slideH = Math.round(sourceWidth * 9 / 16);

  // Measure header bar height
  const header = clone.querySelector<HTMLElement>(".header");
  const headerH = header ? header.offsetHeight : 0;

  const out = document.createElement("canvas");
  out.width = Math.round(slideW * scale);
  out.height = Math.round(slideH * scale);
  const ctx = out.getContext("2d")!;
  ctx.scale(scale, scale);

  ctx.fillStyle = getCSSVar("--bg-base") || "#0D1117";
  ctx.fillRect(0, 0, slideW, slideH);

  // Draw just the header bar from the source
  if (headerH > 0) {
    const srcH = Math.round(headerH * scale);
    ctx.drawImage(
      sourceCanvas,
      0, 0, sourceCanvas.width, srcH,
      0, 0, slideW, headerH,
    );
  }

  await saveCanvasViaServer(out, `${title} - Background`);
  showToast("Background slide exported");
}

async function _exportPaginated(
  clone: HTMLElement,
  sourceCanvas: HTMLCanvasElement,
  title: string,
  sourceWidth: number,
): Promise<void> {
  const scale = window.devicePixelRatio || 2;

  // Page dimensions in CSS pixels (A4 portrait only)
  const pageW = sourceWidth;
  const pageH = Math.round(sourceWidth * 297 / 210);

  // Measure positions using getBoundingClientRect for accuracy
  const cloneRect = clone.getBoundingClientRect();
  const header = clone.querySelector<HTMLElement>(".header");
  const chartGrid = clone.querySelector<HTMLElement>(".chart-grid");

  const headerH = header ? header.offsetHeight : 0;

  // Everything above the chart grid is "overhead" (header + hero + KPI row + gaps)
  const gridRect = chartGrid?.getBoundingClientRect();
  const gridTopInClone = gridRect ? gridRect.top - cloneRect.top : headerH;
  const overheadH = gridTopInClone;

  // For repeated pages, we only repeat the header bar (not hero/KPI)
  const repeatH = headerH;

  const gridTotalH = chartGrid ? chartGrid.scrollHeight : 0;

  // First page gets full overhead, subsequent pages get just the header
  const firstPageChartArea = pageH - overheadH;
  const laterPageChartArea = pageH - repeatH;

  if (firstPageChartArea <= 50 || laterPageChartArea <= 50) {
    showToast("Dashboard too tall for paginated export", true);
    return;
  }

  // Measure card boundaries (top + bottom) RELATIVE TO THE GRID
  const cards = chartGrid?.querySelectorAll<HTMLElement>(':scope > .card, :scope > [id^="dash-css-chart-"]') ?? [];
  const cardBounds: Array<{ top: number; bottom: number }> = [];
  if (gridRect) {
    cards.forEach(card => {
      const r = card.getBoundingClientRect();
      cardBounds.push({
        top: Math.round(r.top - gridRect.top),
        bottom: Math.round(r.bottom - gridRect.top),
      });
    });
  }
  const uniqueBottoms = [...new Set(cardBounds.map(c => c.bottom))].sort((a, b) => a - b);

  // A break is safe only if no card straddles it (top < y AND bottom > y)
  const isSafeBreak = (y: number): boolean =>
    !cardBounds.some(c => c.top < y && c.bottom > y);

  // Calculate page breaks (positions within the chart grid, relative to grid top)
  const breaks: number[] = [0];
  let cursor = 0;
  let isFirst = true;
  while (cursor < gridTotalH) {
    const available = isFirst ? firstPageChartArea : laterPageChartArea;
    const target = cursor + available;
    if (target >= gridTotalH) break;
    // Find the highest SAFE card bottom that doesn't exceed target
    let best = cursor;
    for (const b of uniqueBottoms) {
      if (b > cursor && b <= target && isSafeBreak(b)) best = b;
    }
    // If no safe break fits, force break at page boundary (may bisect oversized card)
    if (best <= cursor) best = target;
    breaks.push(best);
    cursor = best;
    isFirst = false;
  }
  if (breaks[breaks.length - 1] < gridTotalH) {
    const remaining = gridTotalH - breaks[breaks.length - 1];
    if (remaining < 50 && breaks.length >= 2) {
      breaks[breaks.length - 1] = gridTotalH;  // Extend last page (just grid padding)
    } else {
      breaks.push(gridTotalH);
    }
  }

  const pageCount = breaks.length - 1;
  showToast(`Exporting ${pageCount} pages...`);

  // Source canvas pixel coordinates for the grid area
  const gridTopPx = Math.round(gridTopInClone * scale);

  for (let p = 0; p < pageCount; p++) {
    const headerOnThisPage = p === 0 ? overheadH : repeatH;
    const sliceH = breaks[p + 1] - breaks[p];
    const contentH = headerOnThisPage + sliceH;

    const out = document.createElement("canvas");
    out.width = Math.round(pageW * scale);
    out.height = Math.round(contentH * scale);
    const ctx = out.getContext("2d")!;
    ctx.scale(scale, scale);

    // Fill background (trimmed to content height)
    ctx.fillStyle = getCSSVar("--bg-base") || "#0D1117";
    ctx.fillRect(0, 0, pageW, contentH);

    if (p === 0) {
      // First page: draw full overhead (header + hero + KPI) + chart slice
      const overheadSrcH = Math.round(overheadH * scale);
      ctx.drawImage(
        sourceCanvas,
        0, 0, sourceCanvas.width, overheadSrcH,
        0, 0, pageW, overheadH,
      );
    } else {
      // Later pages: draw just the header bar
      const headerSrcH = Math.round(repeatH * scale);
      ctx.drawImage(
        sourceCanvas,
        0, 0, sourceCanvas.width, headerSrcH,
        0, 0, pageW, repeatH,
      );
    }

    // Chart slice from grid area
    if (sliceH > 0) {
      const sliceStart = breaks[p];
      ctx.drawImage(
        sourceCanvas,
        0, gridTopPx + Math.round(sliceStart * scale), sourceCanvas.width, Math.round(sliceH * scale),
        0, headerOnThisPage, pageW, sliceH,
      );
    }

    const filename = `${title}_${p + 1}of${pageCount}`;
    await saveCanvasViaServer(out, filename);
  }

  showToast(`Exported ${pageCount} pages`);
}

registerChart("dashboard", "render_dashboard", renderDashboard);