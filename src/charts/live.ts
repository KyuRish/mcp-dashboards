import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { getCSSVar, tooltipStyle, escapeHtml, resolveColors, deferResize, registerChart, getAppInstance } from "./shared.js";
import { resolveTheme, applyTheme } from "../themes.js";

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Filler, Tooltip, Legend);

interface LiveValue {
  label: string;
  path: string;
}

interface LiveData {
  title: string;
  pollTool: string;
  pollArgs?: Record<string, unknown>;
  values: LiveValue[];
  interval?: number;
  maxPoints?: number;
  yLabel?: string;
  yMin?: number;
  yMax?: number;
  colors?: string[];
  theme?: string;
  palette?: string;
  typography?: string;
  effects?: string;
}

/** Walk a dot-path on an object and return the numeric value, or null */
function walkPath(obj: any, path: string): number | null {
  if (!obj || !path) return null;
  const parts = path.split(".");
  let val: any = obj;
  for (const part of parts) {
    val = val?.[part];
    if (val === undefined || val === null) return null;
  }
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const n = parseFloat(val);
    if (!isNaN(n)) return n;
  }
  return null;
}

/** Try to parse a JSON object from a string that may contain non-JSON text */
function tryParseJSON(text: string): any {
  // Direct parse
  try { return JSON.parse(text); } catch { /* continue */ }
  // Extract first JSON object from within text (e.g., description + JSON)
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch { /* skip */ }
  }
  return null;
}

/** Extract a numeric value from a tool result using a dot-path */
function extractValue(result: any, valuePath: string): number | null {
  // 1. Try result directly as data object (some clients unwrap content)
  const direct = walkPath(result, valuePath);
  if (direct !== null) return direct;

  // 2. Try structuredContent
  const sc = walkPath(result?.structuredContent, valuePath);
  if (sc !== null) return sc;

  // 3. Parse JSON from text content blocks
  const texts = result?.content?.filter((c: any) => c.type === "text") ?? [];
  for (const t of texts) {
    const obj = tryParseJSON(t.text);
    if (obj) {
      const val = walkPath(obj, valuePath);
      if (val !== null) return val;
    }
  }

  // 4. Fallback: plain number from first text
  const text = texts[0]?.text;
  if (text) {
    const n = parseFloat(text.trim());
    if (!isNaN(n)) return n;
  }

  if (_pollDebug) {
    console.warn("[Live chart] extractValue failed for path:", valuePath, "result:", result);
  }
  return null;
}

// Log first 3 poll results for debugging, then go silent
let _pollDebug = 3;

function timeLabel(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
}

export function renderLiveChart(container: HTMLElement, payload: LiveData): void {
  const { title, pollTool, pollArgs, values } = payload;
  const interval = Math.max((payload.interval ?? 2) * 1000, 500);
  const maxPoints = payload.maxPoints ?? 30;

  const theme = resolveTheme(payload.theme, {
    palette: payload.palette,
    typography: payload.typography,
    effects: payload.effects,
  });
  if (theme) applyTheme(container, theme);

  const shimmerClass = theme?.effects.shimmerTitle ? " shimmer-text" : "";

  container.innerHTML = `
    <div class="chart-view">
      <div class="card chart-card">
        <div class="chart-card__header">
          <div>
            <div class="chart-card__title${shimmerClass}">${escapeHtml(title)}</div>
            <div class="chart-card__subtitle">
              <span class="live-dot"></span>
              <span class="live-label">LIVE</span>
              <span class="live-meta">polling ${escapeHtml(pollTool)} every ${(interval / 1000).toFixed(0)}s</span>
            </div>
          </div>
          <div class="chart-card__actions">
            <button class="export-btn live-toggle" title="Pause/Resume">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="6" y="4" width="4" height="16" rx="1"/>
                <rect x="14" y="4" width="4" height="16" rx="1"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="chart-card__body">
          <canvas id="chart-canvas"></canvas>
        </div>
      </div>
    </div>
  `;

  const canvas = container.querySelector<HTMLCanvasElement>("#chart-canvas")!;
  const palette = resolveColors(payload.colors, values.length);
  const labels: string[] = [];
  const seriesData: number[][] = values.map(() => []);

  const chartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: values.map((v, i) => {
        const color = palette[i % palette.length];
        return {
          label: v.label,
          data: seriesData[i],
          borderColor: color,
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          backgroundColor: color + "20",
          pointRadius: 0,
          pointHoverRadius: 4,
          pointBackgroundColor: color,
          pointBorderColor: getCSSVar("--bg-card"),
          pointBorderWidth: 2,
        };
      }),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: {
          border: { display: false },
          grid: { display: false },
          ticks: { color: getCSSVar("--text-muted"), font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
        },
        y: {
          border: { display: false },
          grid: { color: getCSSVar("--border"), drawTicks: false },
          ticks: { color: getCSSVar("--text-secondary"), font: { size: 11 }, padding: 8 },
          min: payload.yMin,
          max: payload.yMax,
          title: payload.yLabel ? {
            display: true,
            text: payload.yLabel,
            color: getCSSVar("--text-secondary"),
            font: { size: 11, weight: "600" as const },
          } : undefined,
        },
      },
      plugins: {
        legend: {
          display: values.length > 1,
          position: "top",
          align: "end",
          labels: { color: getCSSVar("--text-secondary"), boxWidth: 10, padding: 12, font: { size: 11 } },
        },
        tooltip: tooltipStyle(),
      },
    },
  });

  deferResize(chartInstance);

  // Polling logic
  let running = true;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  async function poll(): Promise<void> {
    if (!running) return;
    const app = getAppInstance();
    if (!app) {
      scheduleNext();
      return;
    }

    try {
      const result = await app.callServerTool({
        name: pollTool,
        arguments: pollArgs ?? {},
      });

      if (_pollDebug > 0) {
        console.log("[Live chart] poll result:", JSON.stringify(result, null, 2)?.slice(0, 2000));
        _pollDebug--;
      }

      // Extract values for each series
      for (let i = 0; i < values.length; i++) {
        const val = extractValue(result, values[i].path);
        if (val !== null) {
          seriesData[i].push(val);
        } else {
          seriesData[i].push(NaN);
        }
      }

      // Add timestamp label
      labels.push(timeLabel());

      // Trim to max points
      while (labels.length > maxPoints) {
        labels.shift();
        for (const s of seriesData) s.shift();
      }

      chartInstance.update("none");
    } catch (e) {
      console.warn("Live chart poll failed:", e);
    }

    scheduleNext();
  }

  function scheduleNext(): void {
    if (running) {
      timerId = setTimeout(poll, interval);
    }
  }

  // Pause/resume toggle
  const toggleBtn = container.querySelector<HTMLElement>(".live-toggle");
  const liveDot = container.querySelector<HTMLElement>(".live-dot");
  const liveLabel = container.querySelector<HTMLElement>(".live-label");

  toggleBtn?.addEventListener("click", () => {
    running = !running;
    if (running) {
      liveDot?.classList.remove("live-dot--paused");
      if (liveLabel) liveLabel.textContent = "LIVE";
      toggleBtn.title = "Pause";
      toggleBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`;
      poll();
    } else {
      liveDot?.classList.add("live-dot--paused");
      if (liveLabel) liveLabel.textContent = "PAUSED";
      toggleBtn.title = "Resume";
      toggleBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
      if (timerId) clearTimeout(timerId);
    }
  });

  // Start polling
  poll();

  // Cleanup on container removal (MutationObserver)
  const observer = new MutationObserver(() => {
    if (!document.body.contains(container)) {
      running = false;
      if (timerId) clearTimeout(timerId);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

registerChart("live", "render_live_chart", renderLiveChart);
