import type { App } from "@modelcontextprotocol/ext-apps";

// -- App instance for bidirectional communication --
let _app: App | null = null;

export function setAppInstance(app: App): void {
  _app = app;
}

export function getAppInstance(): App | null {
  return _app;
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
    if (!_app || _selections.length === 0) return;
    const message = _selections.length === 1
      ? `Tell me more about: ${_selections[0]}`
      : `Tell me about these:\n${_selections.map((s) => `- ${s}`).join("\n")}`;

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

/** Parse hex color to [r, g, b] */
function hexToRGB(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
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
    // Composite: fill card background behind the transparent Chart.js canvas
    const srcCanvas = (chart as any).canvas as HTMLCanvasElement;
    const out = document.createElement("canvas");
    out.width = srcCanvas.width;
    out.height = srcCanvas.height;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = getCSSVar("--bg-card") || "#1C2333";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(srcCanvas, 0, 0);
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
      ].join("");
      document.head.appendChild(overrideStyle);

      // Hide action buttons in clone
      clone.querySelectorAll<HTMLElement>(".chart-card__actions").forEach((el) => {
        el.style.display = "none";
      });

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

/** Add a refresh button to a chart card header */
export function addRefreshButton(
  container: HTMLElement,
  onRefresh: () => void
): void {
  const header = container.querySelector(".chart-card__header");
  if (!header) return;

  const btn = document.createElement("button");
  btn.className = "export-btn";
  btn.title = "Refresh data";
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;
  btn.addEventListener("click", () => {
    btn.style.animation = "spin 0.6s linear";
    btn.addEventListener("animationend", () => { btn.style.animation = ""; }, { once: true });
    onRefresh();
  });
  getOrCreateActions(header).appendChild(btn);
}

// -- Global: make chart titles clickable via event delegation --
// Runs once on load. Clicks on any `.chart-card__title` send a selection message.
document.addEventListener("click", (e) => {
  const titleEl = (e.target as HTMLElement).closest<HTMLElement>(".chart-card__title");
  if (!titleEl) return;
  const text = titleEl.textContent?.trim() ?? "";
  // Find the chart-view container to infer chart type from registry
  const chartView = titleEl.closest<HTMLElement>(".chart-view");
  const chartType = chartView?.className.match(/chart-view/)?.[0] ? "" : "";
  if (text) sendClickMessage(`[Chart] "${text}" - selected`);
});
