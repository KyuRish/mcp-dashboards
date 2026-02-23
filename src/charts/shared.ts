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
