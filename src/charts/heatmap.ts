import { escapeHtml, sendClickMessage, addHtmlExportButton, addRefreshButton, registerChart, addCanvasZoom } from "./shared.js";
import { resolveTheme, applyTheme } from "../themes.js";

interface HeatmapData {
  type: "heatmap";
  title: string;
  rows: string[];
  columns: string[];
  values: number[][];
  colorScale?: string;
  theme?: string;
  palette?: string;
  typography?: string;
  effects?: string;
}

function heatColor(value: number, min: number, max: number, scale?: string): string {
  const t = max === min ? 0.5 : (value - min) / (max - min);

  switch (scale) {
    case "red-green":
      // Red (low) to Green (high)
      return `hsl(${t * 120}, 70%, 45%)`;
    case "blue":
      // Light blue to dark blue
      return `hsl(210, 80%, ${90 - t * 55}%)`;
    case "heat":
      // Blue -> Cyan -> Yellow -> Red
      return `hsl(${(1 - t) * 240}, 80%, ${50 + (1 - t) * 15}%)`;
    default:
      // Default: cool to warm (blue -> purple -> orange)
      return `hsl(${(1 - t) * 240}, 70%, ${55 - t * 10}%)`;
  }
}

export function renderHeatmapChart(container: HTMLElement, payload: HeatmapData): void {
  const theme = resolveTheme(payload.theme, {
    palette: payload.palette,
    typography: payload.typography,
    effects: payload.effects,
  });
  if (theme) applyTheme(container, theme);

  const shimmer = theme?.effects.shimmerTitle ? " shimmer-text" : "";

  // Find global min/max
  const allVals = payload.values.flat();
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);

  // Column headers
  const colHeaders = payload.columns
    .map((c) => `<div class="heatmap__col-label">${escapeHtml(c)}</div>`)
    .join("");

  // Grid rows
  const rows = payload.rows.map((rowLabel, ri) => {
    const cells = payload.columns.map((colLabel, ci) => {
      const val = payload.values[ri]?.[ci] ?? 0;
      const bg = heatColor(val, minVal, maxVal, payload.colorScale);
      // Choose text color based on luminance
      const t = maxVal === minVal ? 0.5 : (val - minVal) / (maxVal - minVal);
      const textColor = t > 0.4 && t < 0.8 ? "#000" : "#fff";
      return `<div class="heatmap__cell" style="background:${bg};color:${textColor}"
                   title="${escapeHtml(rowLabel)} / ${escapeHtml(colLabel)}: ${val}"
                   data-row="${ri}" data-col="${ci}">${val}</div>`;
    }).join("");

    return `
      <div class="heatmap__row-label">${escapeHtml(rowLabel)}</div>
      ${cells}
    `;
  }).join("");

  const cols = payload.columns.length;

  container.className = "chart-view";
  container.innerHTML = `
    <div class="card chart-card">
      <div class="chart-card__header">
        <div><div class="chart-card__title${shimmer}">${escapeHtml(payload.title)}</div></div>
      </div>
      <div class="chart-card__body chart-card__body--css">
        <div class="heatmap">
          <div class="heatmap__grid" style="grid-template-columns: auto repeat(${cols}, 1fr)">
            <div class="heatmap__corner"></div>
            ${colHeaders}
            ${rows}
          </div>
          <div class="heatmap__scale">
            <span>${minVal}</span>
            <div class="heatmap__scale-bar" style="background:linear-gradient(to right, ${heatColor(minVal, minVal, maxVal, payload.colorScale)}, ${heatColor((minVal + maxVal) / 2, minVal, maxVal, payload.colorScale)}, ${heatColor(maxVal, minVal, maxVal, payload.colorScale)})"></div>
            <span>${maxVal}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll<HTMLElement>(".heatmap__cell").forEach((el) => {
    el.style.cursor = "pointer";
    el.addEventListener("click", () => {
      const ri = parseInt(el.dataset.row ?? "0", 10);
      const ci = parseInt(el.dataset.col ?? "0", 10);
      const val = payload.values[ri]?.[ci] ?? 0;
      sendClickMessage(`[Heatmap] "${payload.title}" - ${payload.rows[ri]} / ${payload.columns[ci]}: ${val}`);
    });
  });

  const card = container.querySelector<HTMLElement>(".chart-card")!;
  addHtmlExportButton(card, payload.title);
  addRefreshButton(card);

  const body = container.querySelector<HTMLElement>(".chart-card__body");
  const heatmapEl = container.querySelector<HTMLElement>(".heatmap");
  if (body && heatmapEl) addCanvasZoom(body, heatmapEl);
}

registerChart("heatmap", "render_heatmap_chart", renderHeatmapChart);
