import type { App } from "@modelcontextprotocol/ext-apps";

// -- App instance for bidirectional communication --
let _app: App | null = null;

export function setAppInstance(app: App): void {
  _app = app;
}

export function getAppInstance(): App | null {
  return _app;
}

/** True when running in browser preview mode (no MCP host available) */
export function isStandaloneMode(): boolean {
  return typeof window !== "undefined" && !!(window as any).__CHART_DATA__;
}

/** Sanitize a filename - replace path separators and Windows-reserved chars. */
function sanitizeFilename(name: string): string {
  const INVALID = /[\\/:*?"<>|\x00-\x1f]/g;
  const extMatch = name.match(/\.[A-Za-z0-9]{1,5}$/);
  const ext = extMatch ? extMatch[0] : "";
  const base = ext ? name.slice(0, -ext.length) : name;
  let out = (base.replace(INVALID, "-").trim() || "chart") + ext;
  if (out.length > 200) out = out.slice(0, 200 - ext.length) + ext;
  return out;
}

/** Trigger a native browser download using a data URL. Works when there's no MCP host. */
function browserDownload(filename: string, data: string, mimeType: string, isBase64: boolean): void {
  const href = isBase64
    ? `data:${mimeType};base64,${data}`
    : `data:${mimeType};charset=utf-8,${encodeURIComponent(data)}`;
  const link = document.createElement("a");
  link.href = href;
  link.download = sanitizeFilename(filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// -- Click position tracking --
// MCP Apps iframes are sized to full content height (no internal scroll).
// `position: fixed` equals `position: absolute` in this context, so we
// track the actual click coordinates and show feedback there instead.
let _lastClickX = 0;
let _lastClickY = 0;

document.addEventListener("click", (e) => {
  _lastClickX = e.pageX;
  _lastClickY = e.pageY;
}, true); // capture phase - runs before chart handlers

// -- Click selection tray --
// Clicks accumulate as visual chips. User sends when ready via "Ask" button.
const _selections: string[] = [];
let _tray: HTMLElement | null = null;

function ensureTray(): HTMLElement {
  if (_tray && document.body.contains(_tray)) return _tray;

  _tray = document.createElement("div");
  _tray.className = "selection-tray";
  _tray.innerHTML = `
    <div class="selection-tray__chips"></div>
    <div class="selection-tray__actions">
      <button class="selection-tray__ask" title="Ask about selected items">Ask</button>
      <button class="selection-tray__clear" title="Clear selection">&times;</button>
    </div>
  `;

  _tray.querySelector(".selection-tray__ask")!.addEventListener("click", () => {
    if (_selections.length === 0) return;
    const message = _selections.length === 1
      ? `Tell me more about: ${_selections[0]}`
      : `Tell me about these:\n${_selections.map((s) => `- ${s}`).join("\n")}`;

    // Standalone preview: no chat to send to - copy to clipboard instead
    if (isStandaloneMode()) {
      navigator.clipboard?.writeText(message)
        .then(() => showToast("Copied to clipboard - paste into your AI chat"))
        .catch(() => showToast("Clipboard blocked - select text manually", true));
      clearSelections();
      return;
    }

    if (!_app) return;
    _app.sendMessage({
      role: "user",
      content: [{ type: "text", text: message }],
    }).catch((e) => console.warn("Failed to send:", e));

    clearSelections();
  });

  _tray.querySelector(".selection-tray__clear")!.addEventListener("click", clearSelections);

  document.body.appendChild(_tray);
  return _tray;
}

function clearSelections(): void {
  _selections.length = 0;
  if (_tray) {
    _tray.classList.remove("selection-tray--visible");
    const chips = _tray.querySelector(".selection-tray__chips");
    if (chips) chips.innerHTML = "";
  }
}

function renderChips(): void {
  const tray = ensureTray();
  const chips = tray.querySelector(".selection-tray__chips")!;
  chips.innerHTML = _selections.map((s, i) => `<span class="selection-chip">${escapeHtml(s)}<button data-idx="${i}" class="selection-chip__remove">&times;</button></span>`).join("");

  chips.querySelectorAll<HTMLButtonElement>(".selection-chip__remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx ?? "0", 10);
      _selections.splice(idx, 1);
      if (_selections.length === 0) clearSelections();
      else renderChips();
    });
  });

  tray.classList.toggle("selection-tray--visible", _selections.length > 0);
}

/** Show a count badge at click position that flies toward bottom-center */
function showClickFeedback(): void {
  const existing = document.querySelector(".click-feedback");
  if (existing) existing.remove();

  const count = _selections.length;
  const badge = document.createElement("div");
  badge.className = "click-feedback";
  badge.textContent = String(count);

  badge.style.left = `${_lastClickX}px`;
  badge.style.top = `${_lastClickY - 20}px`;

  // Compute direction toward bottom-center of the document
  const targetX = document.documentElement.scrollWidth / 2;
  const targetY = document.documentElement.scrollHeight;
  const dx = targetX - _lastClickX;
  const dy = targetY - (_lastClickY - 20);
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const fly = 100; // travel distance in px
  badge.style.setProperty("--fly-x", `${(dx / dist) * fly}px`);
  badge.style.setProperty("--fly-y", `${(dy / dist) * fly}px`);

  document.body.appendChild(badge);

  requestAnimationFrame(() => {
    badge.classList.add("click-feedback--visible");
  });

  setTimeout(() => {
    badge.classList.add("click-feedback--fly");
  }, 350);

  setTimeout(() => badge.remove(), 1000);
}

/** Add a clicked item to the selection tray */
export function sendClickMessage(item: string): void {
  if (!_app) return;
  _selections.push(item);
  renderChips();
  showClickFeedback();
}

// -- Last tool call storage for live refresh --
let _lastToolName: string | null = null;
let _lastToolArgs: Record<string, unknown> | null = null;

export function storeLastToolCall(name: string, args: Record<string, unknown>): void {
  _lastToolName = name;
  _lastToolArgs = args;
}

export function getLastToolCall(): { name: string; args: Record<string, unknown> } | null {
  if (!_lastToolName || !_lastToolArgs) return null;
  return { name: _lastToolName, args: _lastToolArgs };
}

// Refresh handler registered by app.ts. Kept as a module-scoped reference
// (not window.__mcpRefresh) so other scripts in the iframe can't reach it.
let _refreshHandler: (() => void | Promise<void>) | null = null;

export function setRefreshHandler(fn: (() => void | Promise<void>) | null): void {
  _refreshHandler = fn;
}

export function triggerRefresh(): void {
  void _refreshHandler?.();
}

// -- Chart Registry --
// Each chart file self-registers via registerChart() as a side-effect import.
// app.ts dispatches rendering and tool-name lookups through this registry.

interface ChartEntry {
  toolName: string;
  render: (root: HTMLElement, data: any) => void;
}

const CHART_REGISTRY: Record<string, ChartEntry> = {};

export function registerChart(
  type: string,
  toolName: string,
  render: (root: HTMLElement, data: any) => void,
): void {
  CHART_REGISTRY[type] = { toolName, render };
}

export function getChartEntry(type: string): ChartEntry | undefined {
  return CHART_REGISTRY[type];
}

export function getTypeToToolMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [type, entry] of Object.entries(CHART_REGISTRY)) {
    map[type] = entry.toolName;
  }
  return map;
}

export const CHART_COLORS = [
  "#3B82F6", // blue
  "#10B981", // emerald
  "#F59E0B", // amber
  "#8B5CF6", // violet
  "#F43F5E", // rose
  "#06B6D4", // cyan
  "#84CC16", // lime
];

/** Convert our annotation schema to chartjs-plugin-annotation format */
export function buildAnnotations(annotations?: any[]): Record<string, any> | undefined {
  if (!annotations || annotations.length === 0) return undefined;
  const result: Record<string, any> = {};
  annotations.forEach((a: any, i: number) => {
    const key = `a${i}`;
    if (a.type === "line") {
      result[key] = {
        type: "line",
        scaleID: a.axis === "x" ? "x" : "y",
        value: a.value,
        borderColor: a.color ?? getCSSVar("--text-muted"),
        borderWidth: 1.5,
        borderDash: a.style === "solid" ? [] : [6, 4],
        label: a.label ? {
          display: true,
          content: a.label,
          position: "start",
          backgroundColor: "transparent",
          color: a.color ?? getCSSVar("--text-secondary"),
          font: { size: 10 },
        } : undefined,
      };
    } else if (a.type === "box") {
      result[key] = {
        type: "box",
        xMin: a.xMin,
        xMax: a.xMax,
        yMin: a.yMin,
        yMax: a.yMax,
        backgroundColor: colorWithAlpha(a.color ?? getCSSVar("--accent"), 0.09),
        borderColor: colorWithAlpha(a.color ?? getCSSVar("--accent"), 0.25),
        borderWidth: 1,
        label: a.label ? {
          display: true,
          content: a.label,
          color: getCSSVar("--text-secondary"),
          font: { size: 10 },
        } : undefined,
      };
    } else if (a.type === "label") {
      result[key] = {
        type: "label",
        xValue: a.x,
        yValue: a.y,
        content: a.content,
        color: a.color ?? getCSSVar("--text-secondary"),
        font: { size: 11 },
        backgroundColor: "transparent",
      };
    }
  });
  return result;
}

export function getCSSVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function tooltipStyle() {
  return {
    backgroundColor: getCSSVar("--bg-card-2") || "#1C2333",
    titleColor: getCSSVar("--text-primary") || "#F1F5F9",
    bodyColor: getCSSVar("--text-secondary") || "#94A3B8",
    borderColor: getCSSVar("--border-md") || "rgba(255,255,255,0.14)",
    borderWidth: 1,
    padding: 10,
    cornerRadius: 8,
    displayColors: true,
    boxWidth: 8,
    boxHeight: 8,
    titleFont: { size: 12, weight: "bold" as const, family: getCSSVar("--font-body") || undefined },
    bodyFont: { size: 11, family: getCSSVar("--font-body") || undefined },
  };
}

export function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

/**
 * Validate a user-provided color string before interpolation into a style
 * attribute. Accepts: #RGB, #RRGGBB, #RRGGBBAA, rgb(...), rgba(...), and
 * CSS var(--name) references. Anything else returns the fallback - prevents
 * style-attribute breakout attacks like `red;background:url(...)` that could
 * exfiltrate via CSS-loaded URLs.
 */
const _HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const _RGB = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/;
const _VAR = /^var\(--[a-z0-9_-]+\)$/i;
export function sanitizeColor(input: unknown, fallback = "#888888"): string {
  if (typeof input !== "string") return fallback;
  const s = input.trim();
  if (!s) return fallback;
  if (_HEX.test(s) || _VAR.test(s)) return s;
  if (_RGB.test(s)) {
    const nums = s.match(/\d{1,3}/g) ?? [];
    if (nums.slice(0, 3).every((n) => +n <= 255)) return s;
  }
  return fallback;
}

/** Parse hex color to [r, g, b] */
function hexToRGB(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/** Apply alpha to any CSS color (hex, rgb, rgba, named) */
function colorWithAlpha(color: string, alpha: number): string {
  if (color.startsWith("#")) {
    const [r, g, b] = hexToRGB(color);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  const m = color.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
  if (m) return `rgba(${m[1]},${m[2]},${m[3]},${alpha})`;
  return color;
}

/** Convert RGB to hex */
function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, "0")).join("")}`;
}

/** Generate a lighter or darker variant of a hex color */
function shiftLightness(hex: string, amount: number): string {
  const [r, g, b] = hexToRGB(hex);
  // Shift toward white (positive) or black (negative)
  if (amount > 0) {
    return rgbToHex(
      r + (255 - r) * amount,
      g + (255 - g) * amount,
      b + (255 - b) * amount,
    );
  }
  return rgbToHex(r * (1 + amount), g * (1 + amount), b * (1 + amount));
}

/** Resolve user-provided colors or fall back to theme CSS vars, then default palette.
 *  When count exceeds the base palette, auto-generates additional distinct colors
 *  by shifting lightness - the LLM never needs to know the palette size. */
export function resolveColors(custom?: string[], count?: number): string[] {
  let base: string[];

  if (custom && custom.length > 0) {
    base = custom;
  } else {
    // Try reading theme CSS variables first
    const themed: string[] = [];
    for (let i = 1; i <= 7; i++) {
      const v = getCSSVar(`--c${i}`);
      if (v) themed.push(v);
    }
    base = themed.length >= 7 ? themed : CHART_COLORS;
  }

  // If we have enough colors, return as-is
  if (!count || count <= base.length) return base;

  // Generate extra colors by cycling through base with lightness shifts
  const extended = [...base];
  const shifts = [0.3, -0.25, 0.55, -0.45]; // lighter, darker, even lighter, even darker
  let shiftIdx = 0;
  while (extended.length < count) {
    const sourceColor = base[extended.length % base.length];
    extended.push(shiftLightness(sourceColor, shifts[shiftIdx % shifts.length]));
    // Advance shift level after each full cycle through base colors
    if (extended.length % base.length === 0) shiftIdx++;
  }
  return extended;
}

/** Nudge Chart.js to recalculate at key intervals after creation.
 *  The SDK's autoResize handles host communication; Chart.js has its own
 *  internal ResizeObserver. These timed nudges cover edge cases where the
 *  iframe grows between Chart.js observer ticks. */
export function deferResize(chart: { resize: () => void }): void {
  for (const ms of [300, 600, 1500, 3000]) {
    setTimeout(() => { try { chart.resize(); } catch {} }, ms);
  }
}

/** Ensure a grouped actions container exists inside a header element */
function getOrCreateActions(header: Element): HTMLElement {
  let actions = header.querySelector<HTMLElement>(".chart-card__actions");
  if (!actions) {
    actions = document.createElement("div");
    actions.className = "chart-card__actions";
    header.appendChild(actions);
  }
  return actions;
}

/** Show a brief toast notification anchored below the header */
export function showToast(message: string, isError = false): void {
  // Find the header to anchor below it; fall back to top of viewport
  const header = document.querySelector<HTMLElement>(".header, .chart-card__header");
  const topPx = header ? header.getBoundingClientRect().bottom + 8 : 12;

  const toast = document.createElement("div");
  toast.style.cssText = `
    position:fixed;top:${topPx}px;right:12px;
    padding:8px 16px;border-radius:8px;font-size:12px;font-weight:500;
    color:#fff;z-index:999;opacity:0;transform:translateY(-8px);
    transition:opacity 0.25s ease,transform 0.25s ease;
    background:${isError ? "var(--negative,#DC2626)" : "var(--positive,#16A34A)"};
  `;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Slide in
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  // Fade out and remove
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-8px)";
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  }, 2500);
}

/** Save a file via the server-side save_file tool (bypasses iframe sandbox) */
async function saveViaServer(filename: string, data: string, encoding: "base64" | "utf-8"): Promise<void> {
  // Standalone preview: no MCP host - use native browser download
  if (isStandaloneMode()) {
    const mimeType = filename.endsWith(".csv") ? "text/csv"
      : filename.endsWith(".png") ? "image/png"
      : "application/octet-stream";
    browserDownload(filename, data, mimeType, encoding === "base64");
    showToast(`Downloaded ${filename}`);
    return;
  }

  if (!_app) { showToast("Not connected", true); return; }
  try {
    const result = await _app.callServerTool({
      name: "save_file",
      arguments: { filename, data, encoding },
    });
    const text = (result as any)?.content?.[0]?.text ?? "";
    if ((result as any)?.isError) {
      showToast(text || "Save failed", true);
    } else {
      showToast(text || `Saved ${filename}`);
    }
  } catch (e: any) {
    showToast(`Save failed: ${e.message}`, true);
  }
}

/**
 * Replace shimmer gradient text with canvas-rendered gradient images in an export clone.
 * html2canvas doesn't support background-clip:text, so the gradient renders as a visible
 * block behind text instead of through it. This function draws the gradient text onto a
 * canvas and swaps the element content with the resulting image, preserving the look.
 */
export function resolveShimmerForExport(container: HTMLElement): void {
  const accent = getCSSVar("--accent") || "#6366f1";
  const textPrimary = getCSSVar("--text-primary") || "#ffffff";
  const gradientEnd = getCSSVar("--gradient-end") || accent;
  const scale = window.devicePixelRatio || 2;

  container.querySelectorAll<HTMLElement>(
    ".shimmer-text, .fx-shimmer .header__brand, .fx-shimmer .chart-card__title.shimmer-text, .ec-card.fx-shimmer .ec-card__name"
  ).forEach(el => {
    const text = el.textContent?.trim();
    if (!text) return;

    const cs = getComputedStyle(el);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w === 0 || h === 0) return;

    // Create hi-DPI canvas
    const cvs = document.createElement("canvas");
    cvs.width = Math.ceil(w * scale);
    cvs.height = Math.ceil(h * scale);
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);

    // Gradient matching the frozen shimmer (bg-size:200%, bg-pos:0% shows left half)
    // Visible stops: text-primary → accent → gradient-end
    const pl = parseFloat(cs.paddingLeft) || 0;
    const grad = ctx.createLinearGradient(pl, 0, w, 0);
    grad.addColorStop(0, textPrimary);
    grad.addColorStop(0.5, accent);
    grad.addColorStop(1, gradientEnd);

    // Draw text centered vertically (matching CSS line-height behavior)
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    ctx.fillStyle = grad;
    ctx.textBaseline = "alphabetic";
    const metrics = ctx.measureText(text);
    const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
    const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
    const textH = ascent + descent;
    const y = (h - textH) / 2 + ascent;
    ctx.fillText(text, pl, y);

    // Swap: clear shimmer CSS, replace content with rendered image
    el.style.background = "none";
    el.style.webkitTextFillColor = "unset";
    el.style.backgroundClip = "unset";
    (el.style as any).webkitBackgroundClip = "unset";
    el.textContent = "";
    const img = document.createElement("img");
    img.src = cvs.toDataURL("image/png");
    img.style.cssText = `width:${w}px;height:${h}px;display:block;`;
    el.appendChild(img);
  });
}

/** Add a PNG export button to a chart card header */
export function addExportButton(
  container: HTMLElement,
  chart: { toBase64Image: () => string },
  filename: string
): void {
  const header = container.querySelector(".chart-card__header");
  if (!header) return;

  const btn = document.createElement("button");
  btn.className = "export-btn";
  btn.title = "Download as PNG";
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
  btn.addEventListener("click", () => {
    const srcCanvas = (chart as any).canvas as HTMLCanvasElement;
    const scale = window.devicePixelRatio || 2;

    // Read title from the card header
    const titleEl = container.querySelector<HTMLElement>(".chart-card__title");
    const titleText = titleEl?.textContent?.trim() || "";
    const titleH = titleText ? 40 : 0;

    const out = document.createElement("canvas");
    out.width = srcCanvas.width;
    out.height = srcCanvas.height + Math.round(titleH * scale);
    const ctx = out.getContext("2d")!;

    // Fill background
    ctx.fillStyle = getCSSVar("--bg-card") || "#1C2333";
    ctx.fillRect(0, 0, out.width, out.height);

    // Draw title above chart
    if (titleText) {
      ctx.fillStyle = getCSSVar("--text-primary") || "#F1F5F9";
      ctx.font = `bold ${Math.round(14 * scale)}px ${getCSSVar("--font-heading") || "system-ui"}`;
      ctx.fillText(titleText, Math.round(16 * scale), Math.round(26 * scale));
    }

    // Draw chart below title
    ctx.drawImage(srcCanvas, 0, Math.round(titleH * scale));
    const dataUrl = out.toDataURL("image/png");
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    saveViaServer(`${filename}.png`, base64, "base64");
  });
  getOrCreateActions(header).appendChild(btn);
}

/** Add a CSV export button to a table card header */
export function addCsvExportButton(
  container: HTMLElement,
  columns: string[],
  rows: Array<Record<string, string | number>>,
  filename: string
): void {
  const header = container.querySelector(".chart-card__header");
  if (!header) return;

  const btn = document.createElement("button");
  btn.className = "export-btn";
  btn.title = "Download as CSV";
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
  btn.addEventListener("click", () => {
    const csvRows = [columns.join(",")];
    for (const row of rows) {
      csvRows.push(columns.map((col) => {
        const val = String(row[col] ?? "");
        return val.includes(",") || val.includes('"') || val.includes("\n")
          ? `"${val.replace(/"/g, '""')}"`
          : val;
      }).join(","));
    }
    saveViaServer(`${filename}.csv`, csvRows.join("\n"), "utf-8");
  });
  getOrCreateActions(header).appendChild(btn);
}

/** Save a composite canvas as PNG via the server */
export async function saveCanvasViaServer(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  const name = filename.endsWith(".png") ? filename : `${filename}.png`;
  await saveViaServer(name, base64, "base64");
}

/** Add a PNG export button for CSS/SVG charts (uses html2canvas on an off-screen clone) */
export function addHtmlExportButton(
  container: HTMLElement,
  filename: string,
): void {
  const header = container.querySelector(".chart-card__header");
  if (!header) return;

  const btn = document.createElement("button");
  btn.className = "export-btn";
  btn.title = "Download as PNG";
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
  btn.addEventListener("click", async () => {
    const card = container.querySelector<HTMLElement>(".chart-card") ?? container;
    try {
      const { default: html2canvas } = await import("html2canvas-pro");

      // Clone off-screen so the live DOM is never touched (no flash)
      const clone = card.cloneNode(true) as HTMLElement;
      const fullW = Math.max(card.getBoundingClientRect().width, card.scrollWidth);
      clone.style.cssText = `position:fixed;left:-99999px;top:0;width:${fullW}px;pointer-events:none;`;
      document.body.appendChild(clone);

      // Freeze animations, force visibility on .card/.chart-wrapper only
      const tag = "data-mcp-clone";
      clone.setAttribute(tag, "");
      const overrideStyle = document.createElement("style");
      overrideStyle.textContent = [
        `[${tag}],[${tag}] *,[${tag}] *::before,[${tag}] *::after{animation:none!important;transition:none!important;}`,
        `[${tag}].card,[${tag}] .card,[${tag}] .chart-wrapper{opacity:1!important;}`,
        `[${tag}].card::before,[${tag}] .card::before{display:none!important;}`,
        // Effects catalog glass cards: backdrop-filter doesn't render in html2canvas
        // -pro (GitHub issue #2406 on niklasvh/html2canvas). Previous workaround
        // was a colored gradient bg, but that created visible rectangular outline
        // against the dark dashboard (the contrast between colored card bg and
        // neutral dashboard bg shows as a card-shaped edge regardless of border
        // width). Fix: use the SAME neutral bg as non-glass cards (#161B22 =
        // default --bg-card), killing the outline by construction. The glass
        // character is supplied by the .ec-card__glass SVG (top-anchored radial
        // highlight that fades to transparent at edges).
        `[${tag}] .ec-card.fx-glass .ec-card__bg{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;background:#161B22!important;border-color:rgba(255,255,255,0.06)!important;}`,
        // Reveal the glass-sheen SVG in export (invisible in live where the real
        // backdrop-filter does the work).
        `[${tag}] .ec-card__glass{opacity:1!important;}`,
        // Halo is an inline SVG inside .ec-card__halo (emitted by effects-catalog
        // .ts). html2canvas-pro serializes the SVG to a data URI and the browser
        // rasterizes it natively, so no special export rendering is needed - we
        // just force the wrapper opacity to 1 since the live state hides it.
        `[${tag}] .ec-card__halo{opacity:1!important;}`,
        // Particles animate from opacity 0 -> 0.85 -> 0; export freezes animations
        // at frame 0 so all 5 land invisible. Pin them to fixed positions across
        // the card height with full opacity so the static export shows them as
        // a snapshot of "particles in flight".
        `[${tag}] .ec-card__particles .ec-particle{animation:none!important;opacity:0.9!important;}`,
        `[${tag}] .ec-card__particles .ec-particle:nth-child(1){bottom:auto!important;top:18%!important;}`,
        `[${tag}] .ec-card__particles .ec-particle:nth-child(2){bottom:auto!important;top:42%!important;}`,
        `[${tag}] .ec-card__particles .ec-particle:nth-child(3){bottom:auto!important;top:30%!important;}`,
        `[${tag}] .ec-card__particles .ec-particle:nth-child(4){bottom:auto!important;top:65%!important;}`,
        `[${tag}] .ec-card__particles .ec-particle:nth-child(5){bottom:auto!important;top:52%!important;}`,
      ].join("");
      document.head.appendChild(overrideStyle);

      // Hide action buttons in clone
      clone.querySelectorAll<HTMLElement>(".chart-card__actions").forEach((el) => {
        el.style.display = "none";
      });

      // Resolve shimmer gradient text to canvas images
      resolveShimmerForExport(clone);

      const canvas = await html2canvas(clone, {
        backgroundColor: getCSSVar("--bg-card") || "#1C2333",
        scale: window.devicePixelRatio || 2,
        useCORS: true,
        logging: false,
        windowWidth: fullW,
        windowHeight: clone.scrollHeight,
      });

      clone.remove();
      overrideStyle.remove();

      await saveCanvasViaServer(canvas, filename);
    } catch (e: any) {
      console.error("HTML export failed:", e);
      showToast(`Export failed: ${e.message}`, true);
    }
  });
  getOrCreateActions(header).appendChild(btn);
}

/** Add a refresh button to a chart card header. Hidden in standalone preview
 * mode. Triggers the refresh handler registered by app.ts via
 * setRefreshHandler() - no longer reached via window.__mcpRefresh. */
export function addRefreshButton(container: HTMLElement): void {
  // Standalone preview has no MCP host to re-invoke the tool against
  if (isStandaloneMode()) return;

  const header = container.querySelector(".chart-card__header");
  if (!header) return;

  const btn = document.createElement("button");
  btn.className = "export-btn";
  btn.title = "Refresh data";
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;
  btn.addEventListener("click", () => {
    btn.style.animation = "spin 0.6s linear";
    btn.addEventListener("animationend", () => { btn.style.animation = ""; }, { once: true });
    triggerRefresh();
  });
  getOrCreateActions(header).appendChild(btn);
}

// -- Canvas Zoom & Pan (CSS transform, zero dependencies) --

interface ZoomableChart {
  options: any;
  resize(): void;
  update(mode?: "none" | "default" | "reset" | "resize" | "hide" | "show" | "active"): void;
}

export function addCanvasZoom(body: HTMLElement, target: HTMLElement, chart?: ZoomableChart, onZoom?: (scale: number) => void): void {
  // For HTML charts (no fixed viewport), lock height and clip
  if (!chart) {
    const h = body.offsetHeight;
    if (h > 0) body.style.height = `${h}px`;
    body.style.overflow = "hidden";
  }
  let scale = 1, tx = 0, ty = 0;
  const MIN_SCALE = 1, MAX_SCALE = 12, ZOOM_FACTOR = 1.15;
  const baseRatio = window.devicePixelRatio || 2;
  let settleTimer = 0;

  target.style.transformOrigin = "0 0";

  // Switch to HTML external tooltip so it doesn't scale with CSS transform
  if (chart) {
    const tip = document.createElement("div");
    tip.className = "geo-tooltip";
    body.appendChild(tip);

    const tooltipPlugin = (chart.options.plugins as any).tooltip;
    tooltipPlugin.enabled = false;
    tooltipPlugin.external = (context: any) => {
      const { tooltip } = context;
      if (tooltip.opacity === 0) { tip.style.opacity = "0"; return; }

      const lines = (tooltip.body || []).flatMap((b: any) => b.lines || []);
      tip.innerHTML = lines.map((l: string) => `<span>${l}</span>`).join("");

      // Convert canvas coords to body-relative coords using zoom state
      const x = tooltip.caretX * scale + tx;
      const y = tooltip.caretY * scale + ty;

      // Keep tooltip within body bounds
      const bw = body.clientWidth, bh = body.clientHeight;
      const tipW = tip.offsetWidth, tipH = tip.offsetHeight;
      const left = Math.min(Math.max(0, x + 10), bw - tipW - 4);
      const top = Math.min(Math.max(0, y - tipH - 8), bh - tipH - 4);
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
      tip.style.opacity = "1";
    };
    chart.update("none");
  }

  // After zoom settles, re-render chart at higher resolution so it stays crisp
  function scheduleHiRes(): void {
    clearTimeout(settleTimer);
    if (!chart) return;
    settleTimer = window.setTimeout(() => {
      onZoom?.(scale);
      const targetRatio = Math.min(baseRatio * scale, baseRatio * 6);
      (chart.options as any).devicePixelRatio = targetRatio;
      chart.resize();
    }, 200);
  }

  function resetResolution(): void {
    clearTimeout(settleTimer);
    if (!chart) return;
    onZoom?.(1);
    (chart.options as any).devicePixelRatio = baseRatio;
    chart.resize();
  }

  function applyTransform(): void {
    target.style.transform = scale <= 1
      ? ""
      : `translate(${tx}px, ${ty}px) scale(${scale})`;
    body.style.cursor = scale > 1 ? "grab" : "";
    scheduleHiRes();
  }

  function clampPan(): void {
    const bw = body.clientWidth, bh = body.clientHeight;
    const cw = bw * scale, ch = bh * scale;
    tx = Math.min(0, Math.max(tx, bw - cw));
    ty = Math.min(0, Math.max(ty, bh - ch));
  }

  function zoomAt(cx: number, cy: number, newScale: number): void {
    newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
    const ratio = newScale / scale;
    tx = cx - (cx - tx) * ratio;
    ty = cy - (cy - ty) * ratio;
    scale = newScale;
    clampPan();
    applyTransform();
  }

  // Scroll wheel zoom
  body.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = body.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const direction = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    zoomAt(cx, cy, scale * direction);
  }, { passive: false });

  // Double-click zoom
  body.addEventListener("dblclick", (e) => {
    e.preventDefault();
    const rect = body.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    if (scale >= MAX_SCALE) {
      scale = 1; tx = 0; ty = 0;
      resetResolution();
      applyTransform();
    } else {
      zoomAt(cx, cy, scale * 2);
    }
  });

  // Mouse drag to pan
  let dragging = false, startX = 0, startY = 0;
  body.addEventListener("mousedown", (e) => {
    if (scale <= 1) return;
    dragging = true;
    startX = e.clientX - tx;
    startY = e.clientY - ty;
    body.style.cursor = "grabbing";
    e.preventDefault();
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    tx = e.clientX - startX;
    ty = e.clientY - startY;
    clampPan();
    applyTransform();
  });
  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    body.style.cursor = scale > 1 ? "grab" : "";
  });

  // Touch: pinch-to-zoom + drag-to-pan
  let lastTouchDist = 0, lastTouchCenter = { x: 0, y: 0 };
  body.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist = Math.sqrt(dx * dx + dy * dy);
      const rect = body.getBoundingClientRect();
      lastTouchCenter = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
      };
    } else if (e.touches.length === 1 && scale > 1) {
      dragging = true;
      startX = e.touches[0].clientX - tx;
      startY = e.touches[0].clientY - ty;
    }
  }, { passive: true });
  body.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastTouchDist > 0) {
        zoomAt(lastTouchCenter.x, lastTouchCenter.y, scale * (dist / lastTouchDist));
      }
      lastTouchDist = dist;
    } else if (e.touches.length === 1 && dragging) {
      e.preventDefault();
      tx = e.touches[0].clientX - startX;
      ty = e.touches[0].clientY - startY;
      clampPan();
      applyTransform();
    }
  }, { passive: false });
  body.addEventListener("touchend", () => { dragging = false; lastTouchDist = 0; }, { passive: true });

  // Zoom control buttons
  const controls = document.createElement("div");
  controls.className = "geo-zoom-controls";
  controls.innerHTML = `
    <button class="geo-zoom-btn" data-action="in" title="Zoom in">+</button>
    <button class="geo-zoom-btn" data-action="out" title="Zoom out">&minus;</button>
    <button class="geo-zoom-btn" data-action="reset" title="Reset zoom">&#8634;</button>
  `;
  controls.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const cx = body.clientWidth / 2, cy = body.clientHeight / 2;
    if (action === "in") zoomAt(cx, cy, scale * ZOOM_FACTOR * ZOOM_FACTOR);
    else if (action === "out") zoomAt(cx, cy, scale / (ZOOM_FACTOR * ZOOM_FACTOR));
    else { scale = 1; tx = 0; ty = 0; resetResolution(); applyTransform(); }
  });
  body.appendChild(controls);
}

// -- Global: make chart titles clickable via event delegation --
// Runs once on load. Clicks on any `.chart-card__title` send a selection message.
document.addEventListener("click", (e) => {
  const titleEl = (e.target as HTMLElement).closest<HTMLElement>(".chart-card__title");
  if (!titleEl) return;
  const text = titleEl.textContent?.trim() ?? "";
  if (text) sendClickMessage(`[Chart] "${text}" - selected`);
});
