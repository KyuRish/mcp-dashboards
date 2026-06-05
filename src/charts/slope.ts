import { escapeHtml, sendClickMessage, addHtmlExportButton, addRefreshButton, registerChart, resolveColors } from "./shared.js";
import { resolveTheme, applyTheme } from "../themes.js";

interface SlopeItem {
  label: string;
  start: number;
  end: number;
  color?: string;
}

interface SlopeData {
  type: "slope";
  title: string;
  periodStart: string;
  periodEnd: string;
  data: SlopeItem[];
  theme?: string;
  palette?: string;
  typography?: string;
  effects?: string;
}

export function renderSlopeChart(container: HTMLElement, payload: SlopeData): void {
  const theme = resolveTheme(payload.theme, {
    palette: payload.palette,
    typography: payload.typography,
    effects: payload.effects,
  });
  if (theme) applyTheme(container, theme);

  const shimmer = theme?.effects.shimmerTitle ? " shimmer-text" : "";
  const colors = resolveColors(undefined, payload.data.length);
  const allVals = payload.data.flatMap((d) => [d.start, d.end]);
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const range = maxVal - minVal || 1;

  const svgW = 460;
  const svgH = Math.max(120, payload.data.length * 28 + 20);
  const padX = 90;
  const padY = 10;
  const lineX1 = padX;
  const lineX2 = svgW - padX;

  function yPos(val: number): number {
    return padY + ((maxVal - val) / range) * (svgH - 2 * padY);
  }

  const groups = payload.data.map((item, i) => {
    const color = item.color || colors[i % colors.length];
    const y1 = yPos(item.start);
    const y2 = yPos(item.end);
    return `
      <g class="slope__group" data-idx="${i}" style="cursor:pointer">
        <line class="slope__line" x1="${lineX1}" y1="${y1}" x2="${lineX2}" y2="${y2}" stroke="${color}" />
        <circle class="slope__dot" cx="${lineX1}" cy="${y1}" fill="${color}" />
        <circle class="slope__dot" cx="${lineX2}" cy="${y2}" fill="${color}" />
        <text class="slope__label-left" x="${lineX1 - 6}" y="${y1 + 4}">${escapeHtml(item.label)} ${item.start}</text>
        <text class="slope__label-right" x="${lineX2 + 6}" y="${y2 + 4}">${item.end} ${escapeHtml(item.label)}</text>
      </g>
    `;
  }).join("");

  container.className = "chart-view";
  container.innerHTML = `
    <div class="card chart-card">
      <div class="chart-card__header">
        <div><div class="chart-card__title${shimmer}">${escapeHtml(payload.title)}</div></div>
      </div>
      <div class="chart-card__body chart-card__body--css">
        <div class="slope">
          <div class="slope__labels">
            <span>${escapeHtml(payload.periodStart)}</span>
            <span>${escapeHtml(payload.periodEnd)}</span>
          </div>
          <svg class="slope__svg" viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="xMidYMid meet">
            ${groups}
          </svg>
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll<SVGGElement>(".slope__group").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.idx ?? "0", 10);
      const item = payload.data[idx];
      sendClickMessage(`[Slope] "${payload.title}" - ${item.label}: ${item.start} -> ${item.end}`);
    });
  });

  const card = container.querySelector<HTMLElement>(".chart-card")!;
  addHtmlExportButton(card, payload.title);
  addRefreshButton(card);
}

registerChart("slope", "render_slope_chart", renderSlopeChart);
