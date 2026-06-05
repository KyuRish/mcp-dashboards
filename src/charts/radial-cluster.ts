import { escapeHtml, sendClickMessage, addHtmlExportButton, addRefreshButton, registerChart } from "./shared.js";
import { resolveTheme, applyTheme } from "../themes.js";

interface RadialMetric {
  label: string;
  value: number;
  status?: "good" | "warn" | "bad";
}

interface RadialClusterData {
  type: "radial_cluster";
  title: string;
  metrics: RadialMetric[];
  alert?: string;
  theme?: string;
  palette?: string;
  typography?: string;
  effects?: string;
}

function statusColor(status?: string): string {
  switch (status) {
    case "good": return "var(--positive)";
    case "warn": return "var(--neutral)";
    case "bad": return "var(--negative)";
    default: return "var(--accent)";
  }
}

export function renderRadialCluster(container: HTMLElement, payload: RadialClusterData): void {
  const theme = resolveTheme(payload.theme, {
    palette: payload.palette,
    typography: payload.typography,
    effects: payload.effects,
  });
  if (theme) applyTheme(container, theme);

  const shimmer = theme?.effects.shimmerTitle ? " shimmer-text" : "";

  const rings = payload.metrics.map((m, i) => {
    const r = 24;
    const circumference = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(100, m.value));
    const offset = circumference - (pct / 100) * circumference;
    const color = statusColor(m.status);
    const uid = `rc-${Math.random().toString(36).slice(2, 6)}`;

    return `
      <div class="radial-cluster__item" data-idx="${i}" style="cursor:pointer">
        <div class="radial-cluster__ring">
          <svg viewBox="0 0 56 56">
            <circle class="radial-cluster__ring-track" cx="28" cy="28" r="${r}" />
            <circle class="radial-cluster__ring-fill" cx="28" cy="28" r="${r}"
              stroke="${color}"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="${circumference}"
              transform="rotate(-90 28 28)"
              data-target-offset="${offset}"
              id="${uid}" />
          </svg>
          <div class="radial-cluster__ring-val">${pct}%</div>
        </div>
        <div class="radial-cluster__label">${escapeHtml(m.label)}</div>
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
        <div class="radial-cluster">
          <div class="radial-cluster__rings">${rings}</div>
          ${payload.alert ? `<div class="radial-cluster__alert">${escapeHtml(payload.alert)}</div>` : ""}
        </div>
      </div>
    </div>
  `;

  // Animate ring fills
  requestAnimationFrame(() => {
    container.querySelectorAll<SVGCircleElement>(".radial-cluster__ring-fill").forEach((el) => {
      const offset = el.getAttribute("data-target-offset") || "0";
      setTimeout(() => {
        el.style.strokeDashoffset = offset;
      }, 100);
    });
  });

  container.querySelectorAll<HTMLElement>(".radial-cluster__item").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.idx ?? "0", 10);
      const m = payload.metrics[idx];
      sendClickMessage(`[Radial] "${payload.title}" - ${m.label}: ${m.value}% (${m.status || "ok"})`);
    });
  });

  const card = container.querySelector<HTMLElement>(".chart-card")!;
  addHtmlExportButton(card, payload.title);
  addRefreshButton(card);
}

registerChart("radial_cluster", "render_radial_cluster", renderRadialCluster);
