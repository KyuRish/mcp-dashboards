import { escapeHtml, sendClickMessage, addHtmlExportButton, addRefreshButton, registerChart, resolveColors, sanitizeColor } from "./shared.js";
import { resolveTheme, applyTheme } from "../themes.js";

interface LollipopItem {
  label: string;
  value: number;
  color?: string;
  target?: number;
  tooltip?: string;
}

interface LollipopData {
  type: "lollipop";
  title: string;
  data: LollipopItem[];
  theme?: string;
  palette?: string;
  typography?: string;
  effects?: string;
}

export function renderLollipopChart(container: HTMLElement, payload: LollipopData): void {
  const theme = resolveTheme(payload.theme, {
    palette: payload.palette,
    typography: payload.typography,
    effects: payload.effects,
  });
  if (theme) applyTheme(container, theme);

  const shimmer = theme?.effects.shimmerTitle ? " shimmer-text" : "";
  const allVals = payload.data.flatMap(d => d.target != null ? [d.value, d.target] : [d.value]);
  const max = Math.max(...allVals, 1);
  const colors = resolveColors(undefined, payload.data.length);
  const hasTargets = payload.data.some(d => d.target != null);

  const rows = payload.data.map((item, i) => {
    const pct = (item.value / max) * 100;
    const color = item.color || colors[i % colors.length];
    const tooltipAttr = item.tooltip ? ` title="${escapeHtml(item.tooltip)}"` : "";

    let targetHtml = "";
    if (item.target != null) {
      const targetPct = (item.target / max) * 100;
      targetHtml = `<div class="lollipop__target" style="left:${targetPct}%" title="Target: ${item.target.toLocaleString()}"></div>`;
    }

    return `
      <div class="lollipop__row" data-idx="${i}"${tooltipAttr}>
        <div class="lollipop__label">${escapeHtml(item.label)}</div>
        <div class="lollipop__track">
          <div class="lollipop__line" style="width:${pct}%;background:${sanitizeColor(color)}"></div>
          <div class="lollipop__dot" style="left:${pct}%;background:${sanitizeColor(color)}"></div>
          ${targetHtml}
        </div>
        <div class="lollipop__val">${item.value.toLocaleString()}</div>
      </div>
    `;
  }).join("");

  const legendHtml = hasTargets
    ? `<div class="lollipop__legend"><span class="lollipop__legend-item"><span class="lollipop__legend-dot" style="background:var(--accent)"></span>Actual</span><span class="lollipop__legend-item"><span class="lollipop__legend-target"></span>Target</span></div>`
    : "";

  container.className = "chart-view";
  container.innerHTML = `
    <div class="card chart-card">
      <div class="chart-card__header">
        <div><div class="chart-card__title${shimmer}">${escapeHtml(payload.title)}</div></div>
      </div>
      <div class="chart-card__body chart-card__body--css">
        ${legendHtml}
        <div class="lollipop">${rows}</div>
      </div>
    </div>
  `;

  container.querySelectorAll<HTMLElement>(".lollipop__row").forEach((el) => {
    el.style.cursor = "pointer";
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.idx ?? "0", 10);
      const item = payload.data[idx];
      const targetInfo = item.target != null ? ` (target: ${item.target})` : "";
      sendClickMessage(`[Lollipop] "${payload.title}" - ${item.label}: ${item.value}${targetInfo}`);
    });
  });

  const card = container.querySelector<HTMLElement>(".chart-card")!;
  addHtmlExportButton(card, payload.title);
  addRefreshButton(card);
}

registerChart("lollipop", "render_lollipop_chart", renderLollipopChart);
