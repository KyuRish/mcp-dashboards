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
import html2canvas from "html2canvas-pro";
import { getCSSVar, tooltipStyle, escapeHtml, deferResize, sendClickMessage, addExportButton, addHtmlExportButton, addRefreshButton, saveCanvasViaServer, resolveColors, registerChart, getChartEntry, showToast } from "./shared.js";
import { resolveTheme, applyTheme } from "../themes.js";
import { renderHeroRing, renderHeroWidget } from "./hero.js";

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

  const canvasTypes = new Set(["pie", "bar", "line"]);
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
          <button class="export-btn" id="dash-download" title="Download all charts as PNG">${downloadSvg}</button>
          <button class="export-btn" id="dash-refresh" title="Refresh data">${refreshSvg}</button>
        </div>
      </div>
      <div class="dashboard-main">
        ${mainContent}
        ${footerHtml}
      </div>
    </div>
  `;

  // Overall dashboard download - clone off-screen, prep the clone, screenshot it
  container.querySelector("#dash-download")?.addEventListener("click", async () => {
    const dashEl = container.querySelector<HTMLElement>(".dashboard");
    if (!dashEl) return;

    // Clone the dashboard so the live DOM is never touched
    const clone = dashEl.cloneNode(true) as HTMLElement;

    // Match exact dimensions of the original (scrollWidth captures overflow that getBoundingClientRect misses)
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

    // 2. Freeze animations/transitions (no blanket transform/opacity kill)
    const overrideStyle = document.createElement("style");
    overrideStyle.textContent = [
      `[data-mcp-clone] *,[data-mcp-clone] *::before,[data-mcp-clone] *::after{animation:none!important;transition:none!important;}`,
      `[data-mcp-clone] .card,[data-mcp-clone] .chart-wrapper{opacity:1!important;}`,
      `[data-mcp-clone] .card::before{display:none!important;}`,
    ].join("");
    clone.setAttribute("data-mcp-clone", "");
    document.head.appendChild(overrideStyle);

    // 3. Resolve color-mix() to inline rgba() (browser returns color(srgb) which html2canvas can't parse)
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

    // 4. Hide action buttons in the clone
    clone.querySelectorAll<HTMLElement>(".header__right .export-btn, .chart-card__actions").forEach((el) => {
      el.style.display = "none";
    });

    try {
      const canvas = await html2canvas(clone, {
        backgroundColor: getCSSVar("--bg-base") || "#0D1117",
        scale: window.devicePixelRatio || 2,
        useCORS: true,
        logging: false,
        windowWidth: fullW,
        windowHeight: clone.scrollHeight,
      });
      await saveCanvasViaServer(canvas, title);
    } catch (e: any) {
      console.error("Screenshot failed:", e);
      showToast(`Export failed: ${e.message}`, true);
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
    });
  });

  // Masonry layout - each card spans exactly its content height in 1px rows
  const chartGrid = container.querySelector<HTMLElement>(".chart-grid");
  if (chartGrid) {
    let masonryRAF = 0;
    function applyMasonry(grid: HTMLElement): void {
      const gap = parseFloat(getComputedStyle(grid).rowGap) || 0;
      const items = grid.querySelectorAll<HTMLElement>(':scope > .card, :scope > [id^="dash-css-chart-"]');
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
        datasets: datasets.map((ds, i) => ({
          label: ds.label,
          data: ds.data,
          backgroundColor: palette[i % palette.length] + "CC",
          borderColor: palette[i % palette.length],
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
  }
}

registerChart("dashboard", "render_dashboard", renderDashboard);