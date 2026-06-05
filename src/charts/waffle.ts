import { escapeHtml, sendClickMessage, addHtmlExportButton, addRefreshButton, registerChart, resolveColors, sanitizeColor } from "./shared.js";
import { resolveTheme, applyTheme } from "../themes.js";

interface WaffleItem {
  label: string;
  value: number;
  color?: string;
}

interface WaffleData {
  type: "waffle";
  title: string;
  data: WaffleItem[];
  theme?: string;
  palette?: string;
  typography?: string;
  effects?: string;
}

export function renderWaffleChart(container: HTMLElement, payload: WaffleData): void {
  const theme = resolveTheme(payload.theme, {
    palette: payload.palette,
    typography: payload.typography,
    effects: payload.effects,
  });
  if (theme) applyTheme(container, theme);

  const shimmer = theme?.effects.shimmerTitle ? " shimmer-text" : "";
  const colors = resolveColors(undefined, payload.data.length);
  const total = payload.data.reduce((s, d) => s + d.value, 0);

  // Build 100-cell grid
  const cells: { color: string; label: string }[] = [];
  let remaining = 100;
  payload.data.forEach((item, i) => {
    const count = Math.round((item.value / total) * 100);
    const actualCount = Math.min(count, remaining);
    const color = item.color || colors[i % colors.length];
    for (let j = 0; j < actualCount; j++) {
      cells.push({ color, label: item.label });
    }
    remaining -= actualCount;
  });
  // Fill any rounding gap with last color
  while (cells.length < 100 && payload.data.length > 0) {
    const last = payload.data[payload.data.length - 1];
    cells.push({ color: last.color || colors[(payload.data.length - 1) % colors.length], label: last.label });
  }

  const cellsHtml = cells.map((c, i) =>
    `<div class="waffle__cell" style="background:${sanitizeColor(c.color)}" title="${escapeHtml(c.label)}" data-idx="${i}"></div>`
  ).join("");

  const legendHtml = payload.data.map((item, i) => {
    const color = item.color || colors[i % colors.length];
    const pct = total > 0 ? ((item.value / total) * 100).toFixed(0) : "0";
    return `
      <span class="waffle__legend-item">
        <span class="waffle__legend-dot" style="background:${sanitizeColor(color)}"></span>
        ${escapeHtml(item.label)} (${pct}%)
      </span>
    `;
  }).join("");

  container.className = "chart-view";
  container.innerHTML = `
    <div class="card chart-card">
      <div class="chart-card__header">
        <div><div class="chart-card__title${shimmer}">${escapeHtml(payload.title)}</div></div>
      </div>
      <div class="chart-card__body chart-card__body--css">
        <div class="waffle">
          <div class="waffle__grid">${cellsHtml}</div>
          <div class="waffle__legend">${legendHtml}</div>
        </div>
      </div>
    </div>
  `;

  container.querySelector(".waffle__grid")?.addEventListener("click", (e) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>(".waffle__cell");
    if (!cell) return;
    sendClickMessage(`[Waffle] "${payload.title}" - ${cell.title}`);
  });

  const card = container.querySelector<HTMLElement>(".chart-card")!;
  addHtmlExportButton(card, payload.title);
  addRefreshButton(card);
}

registerChart("waffle", "render_waffle_chart", renderWaffleChart);
