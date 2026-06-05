import { escapeHtml, sendClickMessage, addHtmlExportButton, addRefreshButton, registerChart, sanitizeColor } from "./shared.js";
import { resolveTheme, applyTheme } from "../themes.js";

interface DumbbellItem {
  label: string;
  before: number;
  after: number;
  tooltip?: string;
}

interface DumbbellData {
  type: "dumbbell";
  title: string;
  data: DumbbellItem[];
  beforeLabel?: string;
  afterLabel?: string;
  unit?: string;
  scaleLabels?: Record<string, string>;
  zones?: number[];
  zoneColors?: string[];
  zoneLabels?: string[];
  theme?: string;
  palette?: string;
  typography?: string;
  effects?: string;
}

/** Interpolate between two hex colors. */
function lerpColor(a: string, b: string, t: number): string {
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

function defaultZoneColors(count: number): string[] {
  if (count === 1) return ["#ef4444"];
  const colors: string[] = [];
  const stops = ["#ef4444", "#f59e0b", "#22c55e"];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    if (t <= 0.5) colors.push(lerpColor(stops[0], stops[1], t * 2));
    else colors.push(lerpColor(stops[1], stops[2], (t - 0.5) * 2));
  }
  return colors;
}

export function renderDumbbellChart(container: HTMLElement, payload: DumbbellData): void {
  const theme = resolveTheme(payload.theme, {
    palette: payload.palette,
    typography: payload.typography,
    effects: payload.effects,
  });
  if (theme) applyTheme(container, theme);

  const shimmer = theme?.effects.shimmerTitle ? " shimmer-text" : "";
  const allVals = payload.data.flatMap((d) => [d.before, d.after]);
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;
  // Keep raw* for sendClickMessage (chat host re-escapes); use escaped versions
  // for everything else that lands in innerHTML (title="" attributes + bodies).
  const rawBeforeLabel = payload.beforeLabel || "Before";
  const rawAfterLabel = payload.afterLabel || "After";
  const rawUnit = payload.unit || "";
  const beforeLabel = escapeHtml(rawBeforeLabel);
  const afterLabel = escapeHtml(rawAfterLabel);
  const unit = escapeHtml(rawUnit);

  // Map a value to percentage position (10% - 90% range)
  const toPct = (v: number) => ((v - min) / range) * 80 + 10;

  // Build zone HTML for tracks
  const zones = payload.zones || [];
  let zonesBgHtml = "";
  if (zones.length >= 2) {
    const zoneCount = zones.length + 1;
    const colors = payload.zoneColors?.length === zoneCount
      ? payload.zoneColors
      : defaultZoneColors(zoneCount);
    const labels = payload.zoneLabels || [];
    let prevPct = 0;
    for (let z = 0; z <= zones.length; z++) {
      const endPct = z < zones.length ? toPct(zones[z]) : 100;
      const widthPct = endPct - prevPct;
      const color = colors[z % colors.length];
      const label = labels[z] || "";
      const opacity = 0.12 - (z * 0.01);
      zonesBgHtml += `<div class="dumbbell__zone" style="left:${prevPct}%;width:${widthPct}%;background:${sanitizeColor(color)};opacity:${Math.max(opacity, 0.04)}">`;
      if (label && widthPct > 6) {
        zonesBgHtml += `<span class="dumbbell__zone-label">${escapeHtml(label)}</span>`;
      }
      zonesBgHtml += `</div>`;
      prevPct = endPct;
    }
  }

  // Build scale labels
  let scaleHtml = "";
  if (payload.scaleLabels && Object.keys(payload.scaleLabels).length > 0) {
    const markers = Object.entries(payload.scaleLabels).map(([valStr, label]) => {
      const val = parseFloat(valStr);
      const pct = toPct(val);
      return `<div class="dumbbell__scale-mark" style="left:${pct}%"><span class="dumbbell__scale-label">${escapeHtml(label)}</span></div>`;
    }).join("");
    scaleHtml = `<div class="dumbbell__row dumbbell__row--scale"><div class="dumbbell__label-wrap"></div><div class="dumbbell__track dumbbell__track--scale">${markers}</div><div></div></div>`;
  }

  const rows = payload.data.map((item, i) => {
    const bPct = toPct(item.before);
    const aPct = toPct(item.after);
    const leftPct = Math.min(bPct, aPct);
    const widthPct = Math.abs(aPct - bPct);
    const tooltipAttr = item.tooltip ? ` title="${escapeHtml(item.tooltip)}"` : "";

    return `
      <div class="dumbbell__row" data-idx="${i}"${tooltipAttr}>
        <div class="dumbbell__label-wrap">
          <div class="dumbbell__label">${escapeHtml(item.label)}</div>
        </div>
        <div class="dumbbell__track">
          ${zonesBgHtml}
          <div class="dumbbell__bar" style="left:${leftPct}%;width:${widthPct}%"></div>
          <div class="dumbbell__dot dumbbell__dot--before" style="left:${bPct}%" title="${beforeLabel}: ${item.before}${unit}"></div>
          <div class="dumbbell__dot dumbbell__dot--after" style="left:${aPct}%" title="${afterLabel}: ${item.after}${unit}"></div>
        </div>
        <div class="dumbbell__gap">${item.after > item.before ? "+" : ""}${(item.after - item.before).toLocaleString()}${unit}</div>
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
        <div class="dumbbell">
          <div class="dumbbell__legend">
            <span class="dumbbell__legend-item"><span class="dumbbell__dot-sm dumbbell__dot--before"></span>${beforeLabel}</span>
            <span class="dumbbell__legend-item"><span class="dumbbell__dot-sm dumbbell__dot--after"></span>${afterLabel}</span>
          </div>
          ${rows}
          ${scaleHtml}
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll<HTMLElement>(".dumbbell__row[data-idx]").forEach((el) => {
    el.style.cursor = "pointer";
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.idx ?? "0", 10);
      const item = payload.data[idx];
      sendClickMessage(`[Dumbbell] "${payload.title}" - ${item.label}: ${item.before}${rawUnit} -> ${item.after}${rawUnit}`);
    });
  });

  const card = container.querySelector<HTMLElement>(".chart-card")!;
  addHtmlExportButton(card, payload.title);
  addRefreshButton(card);
}

registerChart("dumbbell", "render_dumbbell_chart", renderDumbbellChart);
