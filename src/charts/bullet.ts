import { escapeHtml, sendClickMessage, addHtmlExportButton, addRefreshButton, registerChart } from "./shared.js";
import { resolveTheme, applyTheme } from "../themes.js";

interface BulletItem {
  label: string;
  actual: number;
  target: number;
  zones?: number[];
  unit?: string;
  subtitle?: string;
  tooltip?: string;
}

interface BulletData {
  type: "bullet";
  title: string;
  data: BulletItem[];
  zoneLabels?: string[];
  zoneColors?: string[];
  theme?: string;
  palette?: string;
  typography?: string;
  effects?: string;
}

/** Interpolate between two hex colors. t in [0, 1]. */
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

/** Generate N zone colors from red through amber to green. */
function defaultZoneColors(count: number): string[] {
  if (count === 1) return ["#ef4444"];
  const colors: string[] = [];
  const stops = ["#ef4444", "#f59e0b", "#22c55e"]; // red, amber, green
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1); // 0 to 1
    if (t <= 0.5) {
      colors.push(lerpColor(stops[0], stops[1], t * 2));
    } else {
      colors.push(lerpColor(stops[1], stops[2], (t - 0.5) * 2));
    }
  }
  return colors;
}

export function renderBulletChart(container: HTMLElement, payload: BulletData): void {
  const theme = resolveTheme(payload.theme, {
    palette: payload.palette,
    typography: payload.typography,
    effects: payload.effects,
  });
  if (theme) applyTheme(container, theme);

  const shimmer = theme?.effects.shimmerTitle ? " shimmer-text" : "";

  const rows = payload.data.map((item, i) => {
    const zones = item.zones || [];
    const max = Math.max(item.actual, item.target, ...(zones.length ? zones : [item.target * 1.2]));
    const actualPct = (item.actual / max) * 100;
    const targetPct = (item.target / max) * 100;

    // Build zone HTML dynamically
    let zonesHtml = "";
    if (zones.length >= 2) {
      const zoneCount = zones.length + 1; // N thresholds = N+1 bands
      const colors = payload.zoneColors?.length === zoneCount
        ? payload.zoneColors
        : defaultZoneColors(zoneCount);
      const labels = payload.zoneLabels || [];

      // First band: 0 to zones[0]
      let prevPct = 0;
      for (let z = 0; z <= zones.length; z++) {
        const endPct = z < zones.length ? (zones[z] / max) * 100 : 100;
        const widthPct = endPct - prevPct;
        const color = colors[z % colors.length];
        const label = labels[z] || "";
        const opacity = 0.18 - (z * 0.015); // slight fade from first to last
        zonesHtml += `<div class="bullet__zone" style="left:${prevPct}%;width:${widthPct}%;background:${color};opacity:${Math.max(opacity, 0.06)}">`;
        if (label && widthPct > 8) {
          zonesHtml += `<span class="bullet__zone-label">${escapeHtml(label)}</span>`;
        }
        zonesHtml += `</div>`;
        prevPct = endPct;
      }
    } else {
      // Default 3 equal zones
      zonesHtml = `
        <div class="bullet__zone bullet__zone--poor" style="width:33%"></div>
        <div class="bullet__zone bullet__zone--ok" style="width:66%"></div>
        <div class="bullet__zone bullet__zone--good" style="width:100%"></div>
      `;
    }

    const subtitleHtml = item.subtitle
      ? `<div class="bullet__subtitle">${escapeHtml(item.subtitle)}</div>`
      : "";

    const tooltipAttr = item.tooltip ? ` title="${escapeHtml(item.tooltip)}"` : "";

    return `
      <div class="bullet__row" data-idx="${i}"${tooltipAttr}>
        <div class="bullet__label-wrap">
          <div class="bullet__label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</div>
          ${subtitleHtml}
        </div>
        <div class="bullet__track">
          ${zonesHtml}
          <div class="bullet__bar" style="width:${actualPct}%"></div>
          <div class="bullet__target" style="left:${targetPct}%"></div>
        </div>
        <div class="bullet__val">${item.actual}${item.unit ? " " + item.unit : ""}</div>
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
        <div class="bullet">${rows}</div>
      </div>
    </div>
  `;

  container.querySelectorAll<HTMLElement>(".bullet__row").forEach((el) => {
    el.style.cursor = "pointer";
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.idx ?? "0", 10);
      const item = payload.data[idx];
      sendClickMessage(`[Bullet] "${payload.title}" - ${item.label}: ${item.actual}/${item.target}`);
    });
  });

  const card = container.querySelector<HTMLElement>(".chart-card")!;
  addHtmlExportButton(card, payload.title);
  addRefreshButton(card, () => (window as any).__mcpRefresh?.());
}

registerChart("bullet", "render_bullet_chart", renderBulletChart);
