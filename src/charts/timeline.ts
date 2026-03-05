import { escapeHtml, sendClickMessage, addHtmlExportButton, addRefreshButton, registerChart } from "./shared.js";
import { resolveTheme, applyTheme } from "../themes.js";

interface Milestone {
  label: string;
  status: "done" | "active" | "pending" | "blocked";
  date?: string;
}

interface TimelineData {
  type: "timeline";
  title: string;
  subtitle?: string;
  milestones: Milestone[];
  orientation?: "vertical" | "horizontal";
  theme?: string;
  palette?: string;
  typography?: string;
  effects?: string;
}

function statusClass(status: string): string {
  switch (status) {
    case "done": return "timeline__dot--done";
    case "active": return "timeline__dot--active";
    case "blocked": return "timeline__dot--blocked";
    default: return "timeline__dot--pending";
  }
}

function statusIcon(status: string): string {
  switch (status) {
    case "done": return "&#10003;";
    case "active": return "&#9679;";
    case "blocked": return "&#10007;";
    default: return "";
  }
}

function renderVertical(milestones: Milestone[]): string {
  return milestones.map((m, i) => {
    const dotCls = statusClass(m.status);
    const icon = statusIcon(m.status);
    const isLast = i === milestones.length - 1;

    return `
      <div class="timeline__item${isLast ? " timeline__item--last" : ""}" data-idx="${i}">
        <div class="timeline__track">
          <div class="timeline__dot ${dotCls}">${icon}</div>
          ${!isLast ? '<div class="timeline__line"></div>' : ""}
        </div>
        <div class="timeline__content">
          <div class="timeline__label">${escapeHtml(m.label)}</div>
          ${m.date ? `<div class="timeline__date">${escapeHtml(m.date)}</div>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

function renderHorizontal(milestones: Milestone[]): string {
  const items = milestones.slice(0, 8);
  return items.map((m, i) => {
    const dotCls = statusClass(m.status);
    const icon = statusIcon(m.status);
    const isFirst = i === 0;
    const isLast = i === items.length - 1;

    return `
      <div class="timeline__item timeline__item--h" data-idx="${i}">
        <div class="timeline__track timeline__track--h">
          <div class="timeline__line--h${isFirst ? " timeline__line--hidden" : ""}"></div>
          <div class="timeline__dot ${dotCls}">${icon}</div>
          <div class="timeline__line--h${isLast ? " timeline__line--hidden" : ""}"></div>
        </div>
        <div class="timeline__content timeline__content--h">
          <div class="timeline__label">${escapeHtml(m.label)}</div>
          ${m.date ? `<div class="timeline__date">${escapeHtml(m.date)}</div>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

export function renderTimelineChart(container: HTMLElement, payload: TimelineData): void {
  const theme = resolveTheme(payload.theme, {
    palette: payload.palette,
    typography: payload.typography,
    effects: payload.effects,
  });
  if (theme) applyTheme(container, theme);

  const shimmer = theme?.effects.shimmerTitle ? " shimmer-text" : "";
  const isHorizontal = payload.orientation === "horizontal";
  const timelineCls = isHorizontal ? "timeline timeline--horizontal" : "timeline";
  const milestonesHtml = isHorizontal
    ? renderHorizontal(payload.milestones)
    : renderVertical(payload.milestones);

  container.className = "chart-view";
  container.innerHTML = `
    <div class="card chart-card">
      <div class="chart-card__header">
        <div>
          <div class="chart-card__title${shimmer}">${escapeHtml(payload.title)}</div>
          ${payload.subtitle ? `<div class="chart-card__subtitle">${escapeHtml(payload.subtitle)}</div>` : ""}
        </div>
      </div>
      <div class="chart-card__body chart-card__body--css">
        <div class="${timelineCls}">${milestonesHtml}</div>
      </div>
    </div>
  `;

  container.querySelectorAll<HTMLElement>(".timeline__item").forEach((el) => {
    el.style.cursor = "pointer";
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.idx ?? "0", 10);
      const m = payload.milestones[idx];
      sendClickMessage(`[Timeline] "${payload.title}" - ${m.label}: ${m.status}${m.date ? ` (${m.date})` : ""}`);
    });
  });

  const card = container.querySelector<HTMLElement>(".chart-card")!;
  addHtmlExportButton(card, payload.title);
  addRefreshButton(card, () => (window as any).__mcpRefresh?.());
}

registerChart("timeline", "render_timeline_chart", renderTimelineChart);
