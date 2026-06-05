import { escapeHtml, sendClickMessage, addHtmlExportButton, addRefreshButton, registerChart, resolveColors, sanitizeColor } from "./shared.js";
import { resolveTheme, applyTheme } from "../themes.js";

interface FunnelItem {
  label: string;
  value: number;
  color?: string;
}

interface FunnelData {
  type: "funnel";
  title: string;
  data: FunnelItem[];
  showConversion?: boolean;
  theme?: string;
  palette?: string;
  typography?: string;
  effects?: string;
}

export function renderFunnelChart(container: HTMLElement, payload: FunnelData): void {
  const theme = resolveTheme(payload.theme, {
    palette: payload.palette,
    typography: payload.typography,
    effects: payload.effects,
  });
  if (theme) applyTheme(container, theme);

  const shimmer = theme?.effects.shimmerTitle ? " shimmer-text" : "";
  const showConversion = payload.showConversion !== false;
  const max = payload.data[0]?.value || 1;
  const colors = resolveColors(undefined, payload.data.length);

  const rows = payload.data.map((item, i) => {
    const widthPct = Math.max(20, (item.value / max) * 100);
    const color = item.color || colors[i % colors.length];
    const prev = i > 0 ? payload.data[i - 1].value : null;
    const convPct = prev ? ((item.value / prev) * 100).toFixed(1) : null;

    return `
      ${showConversion && convPct ? `<div class="funnel__conv">${convPct}%</div>` : ""}
      <div class="funnel__stage" data-idx="${i}" style="--funnel-width:${widthPct}%;--funnel-color:${sanitizeColor(color)}">
        <div class="funnel__bar"></div>
        <div class="funnel__info">
          <span class="funnel__name">${escapeHtml(item.label)}</span>
          <span class="funnel__val">${item.value.toLocaleString()}</span>
        </div>
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
        <div class="funnel">${rows}</div>
      </div>
    </div>
  `;

  container.querySelectorAll<HTMLElement>(".funnel__stage").forEach((el) => {
    el.style.cursor = "pointer";
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.idx ?? "0", 10);
      const item = payload.data[idx];
      const overallPct = ((item.value / max) * 100).toFixed(1);
      sendClickMessage(`[Funnel] "${payload.title}" - ${item.label}: ${item.value.toLocaleString()} (${overallPct}% of top)`);
    });
  });

  const card = container.querySelector<HTMLElement>(".chart-card")!;
  addHtmlExportButton(card, payload.title);
  addRefreshButton(card);
}

registerChart("funnel", "render_funnel_chart", renderFunnelChart);
