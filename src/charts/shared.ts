import type { App } from "@modelcontextprotocol/ext-apps";

// -- App instance for bidirectional communication --
let _app: App | null = null;

export function setAppInstance(app: App): void {
  _app = app;
}

export function getAppInstance(): App | null {
  return _app;
}

/** Send a click event as a user message into the chat */
export async function sendClickMessage(message: string): Promise<void> {
  if (!_app) return;
  try {
    await _app.sendMessage({
      role: "user",
      content: [{ type: "text", text: message }],
    });
  } catch (e) {
    console.warn("Failed to send click message:", e);
  }
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
    titleFont: { size: 12, weight: "600" as const },
    bodyFont: { size: 11 },
  };
}

export function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

/** Resolve user-provided colors or fall back to default palette */
export function resolveColors(custom?: string[], count?: number): string[] {
  if (custom && custom.length > 0) return custom;
  return CHART_COLORS;
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
    const link = document.createElement("a");
    link.download = `${filename}.png`;
    link.href = chart.toBase64Image();
    link.click();
  });
  header.appendChild(btn);
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
  header.appendChild(btn);
}
