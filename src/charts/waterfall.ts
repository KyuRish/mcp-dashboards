import { escapeHtml, sendClickMessage, addHtmlExportButton, addRefreshButton, registerChart, resolveColors } from "./shared.js";
import { resolveTheme, applyTheme } from "../themes.js";

interface WaterfallItem {
  label: string;
  value: number;
  type?: "total" | "add" | "sub";
}

interface WaterfallData {
  type: "waterfall";
  title: string;
  unit?: string;
  data: WaterfallItem[];
  theme?: string;
  palette?: string;
  typography?: string;
  effects?: string;
}

export function renderWaterfallChart(container: HTMLElement, payload: WaterfallData): void {
  const theme = resolveTheme(payload.theme, {
    palette: payload.palette,
    typography: payload.typography,
    effects: payload.effects,
  });
  if (theme) applyTheme(container, theme);

  const shimmer = theme?.effects.shimmerTitle ? " shimmer-text" : "";
  const unit = payload.unit || "";

  // Auto-infer types if not provided
  const items = payload.data.map((d, i, arr) => {
    let itemType = d.type;
    if (!itemType) {
      if (i === 0 || i === arr.length - 1) itemType = "total";
      else if (d.value >= 0) itemType = "add";
      else itemType = "sub";
    }
    return { ...d, type: itemType };
  });

  // Calculate running totals and positions
  let running = 0;
  const bars: { label: string; value: number; type: string; bottom: number; height: number }[] = [];
  for (const item of items) {
    if (item.type === "total") {
      const totalVal = item.type === "total" && item === items[items.length - 1] ? running : item.value;
      if (item === items[0]) {
        running = item.value;
        bars.push({ label: item.label, value: item.value, type: "total", bottom: 0, height: item.value });
      } else {
        bars.push({ label: item.label, value: running, type: "total", bottom: 0, height: running });
      }
    } else {
      const absVal = Math.abs(item.value);
      if (item.type === "sub") {
        running -= absVal;
        bars.push({ label: item.label, value: item.value, type: "sub", bottom: running, height: absVal });
      } else {
        bars.push({ label: item.label, value: item.value, type: "add", bottom: running, height: absVal });
        running += absVal;
      }
    }
  }

  const allTops = bars.map((b) => b.bottom + b.height);
  const allBottoms = bars.map((b) => b.bottom);
  const maxVal = Math.max(...allTops, 0);
  const minVal = Math.min(...allBottoms, 0);
  const range = maxVal - minVal || 1;

  function pct(val: number): number {
    return ((val - minVal) / range) * 100;
  }

  const barsHtml = bars.map((b, i) => {
    const bottomPct = pct(b.bottom);
    const heightPct = pct(b.bottom + b.height) - bottomPct;
    const cls = `waterfall__bar waterfall__bar--${b.type}`;
    const displayVal = b.type === "total" ? b.value : b.value;
    const sign = b.type === "add" ? "+" : b.type === "sub" ? "" : "";

    // Connector line to next bar
    const connector = i < bars.length - 1
      ? `<div class="waterfall__connector" style="bottom:${pct(bars[i].bottom + bars[i].height)}%"></div>`
      : "";

    return `
      <div class="waterfall__col" data-idx="${i}">
        <div class="waterfall__bar-area">
          <div class="${cls}" style="bottom:${bottomPct}%;height:${heightPct}%"
               title="${escapeHtml(b.label)}: ${sign}${displayVal}${unit}">
            <span class="waterfall__val">${sign}${displayVal}${unit}</span>
          </div>
          ${connector}
        </div>
        <div class="waterfall__label">${escapeHtml(b.label)}</div>
      </div>
    `;
  }).join("");

  container.className = "chart-view";
  container.innerHTML = `
    <div class="card chart-card">
      <div class="chart-card__header">
        <div><div class="chart-card__title${shimmer}">${escapeHtml(payload.title)}</div></div>
      </div>
      <div class="chart-card__body chart-card__body--css">
        <div class="waterfall">
          <div class="waterfall__chart">${barsHtml}</div>
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll<HTMLElement>(".waterfall__col").forEach((el) => {
    el.style.cursor = "pointer";
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.idx ?? "0", 10);
      const b = bars[idx];
      sendClickMessage(`[Waterfall] "${payload.title}" - ${b.label}: ${b.value}${unit} (${b.type})`);
    });
  });

  const card = container.querySelector<HTMLElement>(".chart-card")!;
  addHtmlExportButton(card, payload.title);
  addRefreshButton(card, () => (window as any).__mcpRefresh?.());
}

registerChart("waterfall", "render_waterfall_chart", renderWaterfallChart);
