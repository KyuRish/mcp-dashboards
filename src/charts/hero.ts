import { escapeHtml, sendClickMessage, addRefreshButton, getCSSVar, registerChart, addHtmlExportButton, sanitizeColor } from "./shared.js";
import { resolveTheme, applyTheme } from "../themes.js";
import { renderGem } from "./gem.js";

type HeroVariant = "big_number" | "progress_ring" | "status" | "comparison"
  | "rank" | "countdown" | "threshold" | "breakdown" | "nps" | "orb" | "gem";

interface HeroPayload {
  type: "hero_metric";
  variant?: HeroVariant;
  title?: string;
  theme?: string;
  palette?: string;
  typography?: string;
  effects?: string;

  // big_number
  value?: string | number;
  unit?: string;
  label?: string;
  change?: number;
  changePeriod?: string;
  sparkline?: number[];

  // progress_ring (absorbed speedometer)
  progress?: number;
  color?: string;
  size?: "sm" | "md" | "lg" | "xl";
  style?: "ring" | "gauge";

  // status (absorbed live_counter)
  statusLevel?: "good" | "warn" | "bad";
  subsystems?: Array<{ name: string; status: "good" | "warn" | "bad" }>;
  count?: number;
  peak?: number;

  // comparison
  before?: number | string;
  after?: number | string;
  improvement?: number | string;
  beforeLabel?: string;
  afterLabel?: string;

  // rank
  rank?: number;
  total?: number;
  percentile?: number;
  rankChange?: number;

  // countdown
  segments?: Array<{ value: number; label: string }>;
  deadline?: string;

  // threshold
  max?: number;
  threshold?: number;
  zones?: Array<{ label: string; from: number; to: number; color: string }>;

  // breakdown
  items?: Array<{ label: string; value: number; color?: string }>;

  // nps
  rating?: "good" | "neutral" | "bad";

  // orb (uses value, label, color)

  // events (for ticker - not used, kept for future)
  events?: Array<{ text: string; time?: string; type?: string }>;
}

// ── Ring constants ──────────────────────────────────────────────────────

const SIZE_MAP = {
  sm: { box: 120, r: 45, stroke: 6, fontSize: 20 },
  md: { box: 180, r: 70, stroke: 8, fontSize: 28 },
  lg: { box: 240, r: 95, stroke: 8, fontSize: 36 },
  xl: { box: 320, r: 125, stroke: 10, fontSize: 48 },
};

function uid(): string {
  return Math.random().toString(36).slice(2, 8);
}

// ── Variant: progress_ring (ring + gauge) ───────────────────────────────

function buildRingSVG(
  size: "sm" | "md" | "lg" | "xl",
  progress: number,
  color?: string,
): string {
  const s = SIZE_MAP[size];
  const cx = s.box / 2;
  const cy = s.box / 2;
  const circumference = 2 * Math.PI * s.r;
  const clampedProgress = Math.max(0, Math.min(100, progress));
  const offset = circumference - (clampedProgress / 100) * circumference;

  const id = uid();
  const gradId = "ring-grad-" + id;
  const glowId = "ring-glow-" + id;
  const pulseGlowId = "pulse-glow-" + id;

  const gradStart = color || "var(--gradient-start, var(--accent))";
  const gradEnd = color || "var(--gradient-end, var(--accent))";
  const glowColor = color || "var(--glow-color, rgba(59,130,246,0.3))";

  const pulseR = s.r + s.stroke / 2;

  return `<svg viewBox="0 0 ${s.box} ${s.box}" width="${s.box}" height="${s.box}">
    <defs>
      <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${gradStart}" />
        <stop offset="100%" stop-color="${gradEnd}" />
      </linearGradient>
      <filter id="${glowId}">
        <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="${glowColor}" flood-opacity="0.6" />
      </filter>
      <filter id="${pulseGlowId}">
        <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="${glowColor}" flood-opacity="0.5" />
      </filter>
    </defs>
    <circle cx="${cx}" cy="${cy}" r="${pulseR}" fill="none"
      stroke="${gradStart}" stroke-width="1.5"
      filter="url(#${pulseGlowId})"
      class="hero-ring__pulse" />
    <circle cx="${cx}" cy="${cy}" r="${s.r}" fill="none"
      stroke="var(--border-md, rgba(255,255,255,0.14))" stroke-width="${s.stroke}" />
    <circle cx="${cx}" cy="${cy}" r="${s.r}" fill="none"
      stroke="url(#${gradId})" stroke-width="${s.stroke}"
      stroke-linecap="round"
      stroke-dasharray="${circumference}"
      stroke-dashoffset="${circumference}"
      filter="url(#${glowId})"
      class="hero-ring__progress"
      transform="rotate(-90 ${cx} ${cy})"
      data-target-offset="${offset}" />
  </svg>`;
}

function buildGaugeSVG(
  size: "sm" | "md" | "lg" | "xl",
  progress: number,
  color?: string,
): string {
  const s = SIZE_MAP[size];
  const cx = s.box / 2;
  const cy = s.box * 0.6;
  const r = s.r;
  const halfCircumference = Math.PI * r;
  const clampedProgress = Math.max(0, Math.min(100, progress));
  const offset = halfCircumference - (clampedProgress / 100) * halfCircumference;

  const id = uid();
  const gradId = "gauge-grad-" + id;
  const glowId = "gauge-glow-" + id;
  const gradStart = color || "var(--gradient-start, var(--accent))";
  const gradEnd = color || "var(--gradient-end, var(--accent))";
  const glowColor = color || "var(--glow-color, rgba(59,130,246,0.3))";

  return `<svg viewBox="0 0 ${s.box} ${s.box * 0.65}" width="${s.box}" height="${s.box * 0.65}">
    <defs>
      <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${gradStart}" />
        <stop offset="100%" stop-color="${gradEnd}" />
      </linearGradient>
      <filter id="${glowId}">
        <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="${glowColor}" flood-opacity="0.6" />
      </filter>
    </defs>
    <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none"
      stroke="var(--border-md, rgba(255,255,255,0.14))" stroke-width="${s.stroke}" stroke-linecap="round" />
    <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none"
      stroke="url(#${gradId})" stroke-width="${s.stroke}" stroke-linecap="round"
      stroke-dasharray="${halfCircumference}"
      stroke-dashoffset="${halfCircumference}"
      filter="url(#${glowId})"
      class="hero-ring__progress"
      data-target-offset="${offset}" />
  </svg>`;
}

export function renderHeroRing(
  container: HTMLElement,
  data: { value: string | number; unit?: string; label?: string; progress?: number; color?: string; size?: "sm" | "md" | "lg" | "xl"; style?: "ring" | "gauge" },
): void {
  const size = data.size || "md";
  const progress = data.progress ?? 0;
  const s = SIZE_MAP[size];
  const isGauge = data.style === "gauge";

  container.innerHTML = `
    <div class="hero-ring hero-ring--${size}${isGauge ? " hero-ring--gauge" : ""}">
      ${isGauge ? buildGaugeSVG(size, progress, data.color) : buildRingSVG(size, progress, data.color)}
      <div class="hero-ring__center">
        <span class="hero-ring__value" style="font-size:${s.fontSize}px">${escapeHtml(String(data.value))}</span>
        ${data.unit ? `<span class="hero-ring__unit">${escapeHtml(data.unit)}</span>` : ""}
        ${data.label ? `<span class="hero-ring__label">${escapeHtml(data.label)}</span>` : ""}
      </div>
    </div>
  `;

  requestAnimationFrame(() => {
    const progressEl = container.querySelector<SVGElement>(".hero-ring__progress");
    if (progressEl) {
      const targetOffset = progressEl.getAttribute("data-target-offset") || "0";
      setTimeout(() => {
        progressEl.style.strokeDashoffset = targetOffset;
      }, 100);
    }
  });

  container.style.cursor = "pointer";
  container.addEventListener("click", () => {
    sendClickMessage(`${data.label || "Metric"}: ${data.value}${data.unit ? " " + data.unit : ""}`);
  });
}

// ── Variant: big_number ─────────────────────────────────────────────────

function renderBigNumber(body: HTMLElement, p: HeroPayload): void {
  const val = String(p.value ?? "");
  const changeDir = (p.change ?? 0) > 0 ? "up" : (p.change ?? 0) < 0 ? "down" : "flat";
  const arrow = changeDir === "up" ? "\u25B2" : changeDir === "down" ? "\u25BC" : "";
  const changeClass = changeDir === "up" ? "hero-bn__change--up" : changeDir === "down" ? "hero-bn__change--down" : "";

  let sparkHtml = "";
  if (p.sparkline && p.sparkline.length > 0) {
    const max = Math.max(...p.sparkline);
    const bars = p.sparkline.map((v) => {
      const h = max > 0 ? Math.max(4, (v / max) * 40) : 4;
      return `<div class="hero-bn__bar" style="height:${h}px"></div>`;
    }).join("");
    sparkHtml = `<div class="hero-bn__sparkline">${bars}</div>`;
  }

  body.innerHTML = `
    <div class="hero-bn">
      <div class="hero-bn__main">
        <span class="hero-bn__value">${escapeHtml(val)}</span>
        ${p.unit ? `<span class="hero-bn__unit">${escapeHtml(p.unit)}</span>` : ""}
      </div>
      ${p.change !== undefined ? `
        <div class="hero-bn__change ${changeClass}">
          ${arrow} ${Math.abs(p.change).toFixed(1)}%
          ${p.changePeriod ? `<span class="hero-bn__period">${escapeHtml(p.changePeriod)}</span>` : ""}
        </div>
      ` : ""}
      ${p.label ? `<div class="hero-bn__label">${escapeHtml(p.label)}</div>` : ""}
      ${sparkHtml}
    </div>
  `;

  body.style.cursor = "pointer";
  body.addEventListener("click", () => {
    sendClickMessage(`[Big Number] "${p.title}" - ${val}${p.unit ? " " + p.unit : ""}`);
  });
}

// ── Variant: status ─────────────────────────────────────────────────────

function renderStatus(body: HTMLElement, p: HeroPayload): void {
  const level = p.statusLevel || "good";
  const statusLabel = level === "good" ? "Operational" : level === "warn" ? "Degraded" : "Critical";

  let subsHtml = "";
  if (p.subsystems && p.subsystems.length > 0) {
    subsHtml = `<div class="hero-status__subs">${p.subsystems.map((s) =>
      `<span class="hero-status__badge hero-status__badge--${s.status}">${escapeHtml(s.name)}</span>`
    ).join("")}</div>`;
  }

  let countHtml = "";
  if (p.count !== undefined) {
    countHtml = `<div class="hero-status__count">${p.count.toLocaleString()}${p.peak !== undefined ? ` <span class="hero-status__peak">peak ${p.peak.toLocaleString()}</span>` : ""}</div>`;
  }

  body.innerHTML = `
    <div class="hero-status hero-status--${level}">
      <div class="hero-status__dot"></div>
      <div class="hero-status__label">${escapeHtml(p.label || statusLabel)}</div>
      ${countHtml}
      ${subsHtml}
    </div>
  `;

  body.style.cursor = "pointer";
  body.addEventListener("click", () => {
    sendClickMessage(`[Status] "${p.title}" - ${statusLabel}`);
  });
}

// ── Variant: comparison ─────────────────────────────────────────────────

function renderComparison(body: HTMLElement, p: HeroPayload): void {
  const beforeLabel = p.beforeLabel || "Before";
  const afterLabel = p.afterLabel || "After";
  const improvement = p.improvement !== undefined ? String(p.improvement) : "";

  body.innerHTML = `
    <div class="hero-compare">
      <div class="hero-compare__col">
        <span class="hero-compare__label">${escapeHtml(beforeLabel)}</span>
        <span class="hero-compare__value">${escapeHtml(String(p.before ?? ""))}</span>
      </div>
      <div class="hero-compare__arrow">\u2192</div>
      <div class="hero-compare__col">
        <span class="hero-compare__label">${escapeHtml(afterLabel)}</span>
        <span class="hero-compare__value hero-compare__value--after">${escapeHtml(String(p.after ?? ""))}</span>
      </div>
      ${improvement ? `<div class="hero-compare__improvement">${escapeHtml(improvement)}</div>` : ""}
    </div>
  `;

  body.style.cursor = "pointer";
  body.addEventListener("click", () => {
    sendClickMessage(`[Comparison] "${p.title}" - ${p.before} -> ${p.after}`);
  });
}

// ── Variant: rank ───────────────────────────────────────────────────────

function renderRank(body: HTMLElement, p: HeroPayload): void {
  const rank = p.rank ?? 1;
  const total = p.total ?? 100;
  const percentile = p.percentile ?? Math.round((1 - rank / total) * 100);
  const change = p.rankChange ?? 0;
  const changeDir = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const changeArrow = change > 0 ? "\u25B2" : change < 0 ? "\u25BC" : "";

  body.innerHTML = `
    <div class="hero-rank">
      <div class="hero-rank__badge">#${rank}</div>
      <div class="hero-rank__of">of ${total}</div>
      <div class="hero-rank__percentile">Top ${percentile}%</div>
      ${change !== 0 ? `
        <div class="hero-rank__change hero-rank__change--${changeDir}">
          ${changeArrow} ${Math.abs(change)} position${Math.abs(change) !== 1 ? "s" : ""}
        </div>
      ` : ""}
    </div>
  `;

  body.style.cursor = "pointer";
  body.addEventListener("click", () => {
    sendClickMessage(`[Rank] "${p.title}" - #${rank} of ${total}`);
  });
}

// ── Variant: countdown ──────────────────────────────────────────────────

function renderCountdown(body: HTMLElement, p: HeroPayload): void {
  let segments = p.segments;
  if (!segments && p.deadline) {
    const diff = new Date(p.deadline).getTime() - Date.now();
    if (diff > 0) {
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      segments = [
        { value: d, label: "days" },
        { value: h, label: "hrs" },
        { value: m, label: "min" },
      ];
    } else {
      segments = [{ value: 0, label: "expired" }];
    }
  }
  if (!segments) segments = [];

  body.innerHTML = `
    <div class="hero-countdown">
      ${segments.map((s) => `
        <div class="hero-countdown__seg">
          <span class="hero-countdown__val">${String(s.value).padStart(2, "0")}</span>
          <span class="hero-countdown__lbl">${escapeHtml(s.label)}</span>
        </div>
      `).join('<span class="hero-countdown__sep">:</span>')}
    </div>
  `;

  body.style.cursor = "pointer";
  body.addEventListener("click", () => {
    const text = segments!.map((s) => `${s.value} ${s.label}`).join(", ");
    sendClickMessage(`[Countdown] "${p.title}" - ${text}`);
  });
}

// ── Variant: threshold ──────────────────────────────────────────────────

function renderThreshold(body: HTMLElement, p: HeroPayload): void {
  const value = typeof p.value === "number" ? p.value : parseFloat(String(p.value)) || 0;
  const max = p.max ?? 100;
  const threshold = p.threshold ?? max * 0.8;
  const pct = Math.min(100, (value / max) * 100);
  const thresholdPct = Math.min(100, (threshold / max) * 100);
  const isOver = value >= threshold;

  let zonesHtml = "";
  if (p.zones && p.zones.length > 0) {
    zonesHtml = p.zones.map((z) => {
      const left = (z.from / max) * 100;
      const width = ((z.to - z.from) / max) * 100;
      return `<div class="hero-threshold__zone" style="left:${left}%;width:${width}%;background:${sanitizeColor(z.color)}" title="${escapeHtml(z.label)}"></div>`;
    }).join("");
  }

  body.innerHTML = `
    <div class="hero-threshold">
      <div class="hero-threshold__value ${isOver ? "hero-threshold__value--over" : ""}">${escapeHtml(String(p.value ?? ""))}${p.unit ? ` <span class="hero-threshold__unit">${escapeHtml(p.unit)}</span>` : ""}</div>
      <div class="hero-threshold__track">
        ${zonesHtml}
        <div class="hero-threshold__fill" style="width:${pct}%"></div>
        <div class="hero-threshold__marker" style="left:${thresholdPct}%"></div>
      </div>
      <div class="hero-threshold__labels">
        <span>0</span>
        <span class="hero-threshold__limit">${threshold}${p.unit ? " " + p.unit : ""}</span>
        <span>${max}</span>
      </div>
    </div>
  `;

  body.style.cursor = "pointer";
  body.addEventListener("click", () => {
    sendClickMessage(`[Threshold] "${p.title}" - ${value}/${max} (limit: ${threshold})`);
  });
}

// ── Variant: breakdown ──────────────────────────────────────────────────

function renderBreakdown(body: HTMLElement, p: HeroPayload): void {
  const items = p.items ?? [];
  const total = items.reduce((s, i) => s + i.value, 0);
  const defaultColors = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)", "var(--c7)"];

  const segments = items.map((item, i) => {
    const pct = total > 0 ? (item.value / total) * 100 : 0;
    const color = item.color || defaultColors[i % defaultColors.length];
    return { ...item, pct, color };
  });

  body.innerHTML = `
    <div class="hero-breakdown">
      <div class="hero-breakdown__bar">
        ${segments.map((s) => `<div class="hero-breakdown__seg" style="width:${s.pct}%;background:${sanitizeColor(s.color)}" title="${escapeHtml(s.label)}: ${s.value}"></div>`).join("")}
      </div>
      <div class="hero-breakdown__legend">
        ${segments.map((s) => `
          <div class="hero-breakdown__item">
            <span class="hero-breakdown__dot" style="background:${sanitizeColor(s.color)}"></span>
            <span class="hero-breakdown__name">${escapeHtml(s.label)}</span>
            <span class="hero-breakdown__val">${s.pct.toFixed(0)}%</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  body.style.cursor = "pointer";
  body.addEventListener("click", () => {
    sendClickMessage(`[Breakdown] "${p.title}" - ${items.map((i) => `${i.label}: ${i.value}`).join(", ")}`);
  });
}

// ── Variant: nps ────────────────────────────────────────────────────────

function renderNps(body: HTMLElement, p: HeroPayload): void {
  const value = typeof p.value === "number" ? p.value : parseFloat(String(p.value)) || 0;
  const max = p.max ?? 100;
  const rating = p.rating || (value >= 70 ? "good" : value >= 40 ? "neutral" : "bad");
  const ratingLabel = rating === "good" ? "Excellent" : rating === "neutral" ? "Average" : "Poor";

  const scaleSteps = 10;
  const filled = Math.round((value / max) * scaleSteps);

  body.innerHTML = `
    <div class="hero-nps">
      <div class="hero-nps__score hero-nps__score--${rating}">${value}</div>
      <div class="hero-nps__scale">
        ${Array.from({ length: scaleSteps }, (_, i) =>
          `<div class="hero-nps__step ${i < filled ? "hero-nps__step--filled" : ""}" style="${i < filled ? `background:var(--${rating === "good" ? "positive" : rating === "bad" ? "negative" : "neutral"})` : ""}"></div>`
        ).join("")}
      </div>
      <div class="hero-nps__rating hero-nps__rating--${rating}">${ratingLabel}</div>
      ${p.label ? `<div class="hero-nps__label">${escapeHtml(p.label)}</div>` : ""}
    </div>
  `;

  body.style.cursor = "pointer";
  body.addEventListener("click", () => {
    sendClickMessage(`[NPS] "${p.title}" - ${value}/${max} (${ratingLabel})`);
  });
}

// ── Variant: orb ────────────────────────────────────────────────────────

function renderOrb(body: HTMLElement, p: HeroPayload): void {
  const val = String(p.value ?? "");
  const color = p.color || "var(--accent, #3B82F6)";
  const id = uid();

  body.innerHTML = `
    <div class="hero-orb" style="--orb-color:${sanitizeColor(color)}">
      <div class="hero-orb__wrap">
        <div class="hero-orb__aura"></div>
        <div class="hero-orb__sphere"></div>
        <div class="hero-orb__content">
          <span class="hero-orb__value">${escapeHtml(val)}</span>
          ${p.unit ? `<span class="hero-orb__unit">${escapeHtml(p.unit)}</span>` : ""}
        </div>
      </div>
      ${p.label ? `<div class="hero-orb__label">${escapeHtml(p.label)}</div>` : ""}
    </div>
  `;

  body.style.cursor = "pointer";
  body.addEventListener("click", () => {
    sendClickMessage(`[Orb] "${p.title}" - ${val}${p.unit ? " " + p.unit : ""}`);
  });
}

// ── Variant router ──────────────────────────────────────────────────────

export function renderHeroWidget(body: HTMLElement, p: any): void {
  const variant = p.variant || "big_number";
  switch (variant) {
    case "big_number":
      renderBigNumber(body, p);
      break;
    case "progress_ring":
      renderHeroRing(body, {
        value: p.value ?? "",
        unit: p.unit,
        label: p.label,
        progress: p.progress,
        color: p.color,
        size: p.size,
        style: p.style,
      });
      break;
    case "status":
      renderStatus(body, p);
      break;
    case "comparison":
      renderComparison(body, p);
      break;
    case "rank":
      renderRank(body, p);
      break;
    case "countdown":
      renderCountdown(body, p);
      break;
    case "threshold":
      renderThreshold(body, p);
      break;
    case "breakdown":
      renderBreakdown(body, p);
      break;
    case "nps":
      renderNps(body, p);
      break;
    case "orb":
      renderOrb(body, p);
      break;
    case "gem":
      renderGem(body, p);
      break;
    default:
      renderBigNumber(body, p);
  }
}

// ── Main renderer ───────────────────────────────────────────────────────

export function renderHeroMetric(container: HTMLElement, payload: HeroPayload): void {
  const theme = resolveTheme(payload.theme, {
    palette: payload.palette,
    typography: payload.typography,
    effects: payload.effects,
  });
  if (theme) applyTheme(container, theme);

  container.className = "chart-view";
  container.innerHTML = `
    <div class="card chart-card hero-metric">
      <div class="chart-card__header">
        <div>
          <div class="chart-card__title${theme?.effects.shimmerTitle ? " shimmer-text" : ""}">${escapeHtml(payload.title || "Metric")}</div>
        </div>
      </div>
      <div class="hero-metric__body"></div>
    </div>
  `;

  const body = container.querySelector<HTMLElement>(".hero-metric__body")!;
  renderHeroWidget(body, payload);

  const card = container.querySelector<HTMLElement>(".chart-card")!;
  addHtmlExportButton(card, payload.title || "hero-metric");
  addRefreshButton(card);
}

registerChart("hero_metric", "render_hero_metric", renderHeroMetric);
