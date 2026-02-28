import { escapeHtml, sendClickMessage, addHtmlExportButton, addRefreshButton, registerChart, resolveColors } from "./shared.js";
import { resolveTheme, applyTheme } from "../themes.js";

interface SparklineItem {
  label: string;
  value: string | number;
  change?: string;
  sparkline: number[];
  good?: boolean;
}

interface SparklineData {
  type: "sparkline";
  title: string;
  data: SparklineItem[];
  theme?: string;
  palette?: string;
  typography?: string;
  effects?: string;
}

function buildSparkSVG(data: number[], color: string): string {
  if (data.length === 0) return "";
  const w = 120;
  const h = 32;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  });

  const linePath = `M${points.join(" L")}`;
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`;

  return `
    <svg class="sparkline-card__svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <path class="sparkline-card__area" d="${areaPath}" fill="${color}" />
      <path class="sparkline-card__path" d="${linePath}" stroke="${color}" />
    </svg>
  `;
}

export function renderSparklineChart(container: HTMLElement, payload: SparklineData): void {
  const theme = resolveTheme(payload.theme, {
    palette: payload.palette,
    typography: payload.typography,
    effects: payload.effects,
  });
  if (theme) applyTheme(container, theme);

  const shimmer = theme?.effects.shimmerTitle ? " shimmer-text" : "";
  const colors = resolveColors(undefined, payload.data.length);

  const cards = payload.data.map((item, i) => {
    const color = colors[i % colors.length];
    const isGood = item.good !== undefined ? item.good : true;
    const changeClass = isGood ? "sparkline-card__change--good" : "sparkline-card__change--bad";

    return `
      <div class="sparkline-card" data-idx="${i}">
        <div class="sparkline-card__header">
          <span class="sparkline-card__label">${escapeHtml(item.label)}</span>
          ${item.change ? `<span class="sparkline-card__change ${changeClass}">${escapeHtml(item.change)}</span>` : ""}
        </div>
        <div class="sparkline-card__value">${escapeHtml(String(item.value))}</div>
        ${buildSparkSVG(item.sparkline, color)}
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
        <div class="sparkline-grid">${cards}</div>
      </div>
    </div>
  `;

  container.querySelectorAll<HTMLElement>(".sparkline-card").forEach((el) => {
    el.style.cursor = "pointer";
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.idx ?? "0", 10);
      const item = payload.data[idx];
      sendClickMessage(`[Sparkline] "${payload.title}" - ${item.label}: ${item.value}`);
    });
  });

  const card = container.querySelector<HTMLElement>(".chart-card")!;
  addHtmlExportButton(card, payload.title);
  addRefreshButton(card, () => (window as any).__mcpRefresh?.());
}

registerChart("sparkline", "render_sparkline_chart", renderSparklineChart);
