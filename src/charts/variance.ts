import { escapeHtml, sendClickMessage, addHtmlExportButton, addRefreshButton, registerChart } from "./shared.js";
import { resolveTheme, applyTheme } from "../themes.js";

interface VarianceItem {
  label: string;
  budget: number;
  actual: number;
}

interface VarianceData {
  type: "variance";
  title: string;
  data: VarianceItem[];
  unit?: string;
  theme?: string;
  palette?: string;
  typography?: string;
  effects?: string;
}

export function renderVarianceChart(container: HTMLElement, payload: VarianceData): void {
  const theme = resolveTheme(payload.theme, {
    palette: payload.palette,
    typography: payload.typography,
    effects: payload.effects,
  });
  if (theme) applyTheme(container, theme);

  const shimmer = theme?.effects.shimmerTitle ? " shimmer-text" : "";
  const unit = payload.unit || "";
  const maxVal = Math.max(...payload.data.flatMap((d) => [d.budget, d.actual]), 1);

  const rows = payload.data.map((item, i) => {
    const budgetPct = (item.budget / maxVal) * 100;
    const actualPct = (item.actual / maxVal) * 100;
    const diff = item.actual - item.budget;
    const isOver = diff > 0;
    const diffLabel = `${isOver ? "+" : ""}${diff.toLocaleString()}${unit}`;
    const diffClass = isOver ? "variance__diff--over" : "variance__diff--under";

    return `
      <div class="variance__row" data-idx="${i}">
        <div class="variance__label">${escapeHtml(item.label)}</div>
        <div class="variance__track">
          <div class="variance__bar ${isOver ? "variance__bar--over" : "variance__bar--under"}" style="width:${actualPct}%"></div>
          <div class="variance__budget-marker" style="left:${budgetPct}%"></div>
        </div>
        <div class="variance__diff ${diffClass}">${diffLabel}</div>
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
        <div class="variance">${rows}</div>
      </div>
    </div>
  `;

  container.querySelectorAll<HTMLElement>(".variance__row").forEach((el) => {
    el.style.cursor = "pointer";
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.idx ?? "0", 10);
      const item = payload.data[idx];
      const diff = item.actual - item.budget;
      sendClickMessage(`[Variance] "${payload.title}" - ${item.label}: actual ${item.actual}${unit} vs budget ${item.budget}${unit} (${diff > 0 ? "+" : ""}${diff}${unit})`);
    });
  });

  const card = container.querySelector<HTMLElement>(".chart-card")!;
  addHtmlExportButton(card, payload.title);
  addRefreshButton(card, () => (window as any).__mcpRefresh?.());
}

registerChart("variance", "render_variance_chart", renderVarianceChart);
