import { App } from "@modelcontextprotocol/ext-apps";
import { setAppInstance, storeLastToolCall, getLastToolCall, getAppInstance, getChartEntry, getTypeToToolMap, escapeHtml } from "./charts/shared.js";
import "./styles.css";

// Side-effect imports: each chart file self-registers via registerChart()
import "./charts/pie.js";
import "./charts/bar.js";
import "./charts/line.js";
import "./charts/radar.js";
import "./charts/treemap.js";
import "./charts/sankey.js";
import "./charts/wordcloud.js";
import "./charts/boxplot.js";
import "./charts/live.js";
import "./charts/scatter.js";
import "./charts/candlestick.js";
import "./charts/dashboard.js";
import "./charts/table.js";
import "./charts/auto.js";
import "./charts/hero.js";
import "./charts/bullet.js";
import "./charts/lollipop.js";
import "./charts/dumbbell.js";
import "./charts/variance.js";
import "./charts/funnel.js";
import "./charts/slope.js";
import "./charts/waffle.js";
import "./charts/sparkline.js";
import "./charts/radial-cluster.js";
import "./charts/waterfall.js";
import "./charts/heatmap.js";
import "./charts/timeline.js";
import "./charts/geo.js";
import "./charts/theme-catalog.js";

const root = document.getElementById("app")!;

// Show loading state
root.innerHTML = `
  <div class="loading">
    <div class="loading__spinner"></div>
    Waiting for data...
  </div>
`;

// Connect to host via MCP Apps protocol
// autoResize disabled - we manually report size after each render to avoid
// the fit-content measurement bug with CSS Grid + absolute canvases.
const app = new App(
  { name: "MCP Dashboards", version: "2.1.1" },
  {},
  { autoResize: false },
);

// Make app accessible to chart renderers for bidirectional messaging
setAppInstance(app);

// Measure actual content height and report to host.
// Runs multiple times to catch Chart.js async layout settling.
function reportSize(): void {
  const send = () => {
    const rect = root.getBoundingClientRect();
    app.sendSizeChanged({
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
    });
  };
  // Immediate + delayed passes for Chart.js render settling
  requestAnimationFrame(send);
  setTimeout(send, 200);
  setTimeout(send, 600);
  setTimeout(send, 1500);
}

function renderFromData(data: any): void {
  if (!data?.type) {
    root.innerHTML = `<div class="loading">No chart data received.</div>`;
    reportSize();
    return;
  }

  try {
    const entry = getChartEntry(data.type);
    if (entry) {
      entry.render(root, data);
    } else {
      root.innerHTML = `<div class="loading">Unknown chart type: ${escapeHtml(String(data.type))}</div>`;
    }
    reportSize();
  } catch (err) {
    console.error("Render error:", err);
    root.innerHTML = `<div class="loading">Error rendering chart. Check console.</div>`;
    reportSize();
  }
}

// ontoolinput only provides arguments (no tool name per spec).
// We store the args here and resolve the tool name from the result's type.
let _pendingArgs: Record<string, unknown> | null = null;

app.ontoolinput = (params) => {
  _pendingArgs = (params as any).arguments ?? null;
};

app.ontoolresult = (result) => {
  // Try structuredContent first, fall back to parsing JSON from content
  let data = (result as any).structuredContent;
  if (!data?.type) {
    const texts = (result as any).content?.filter(
      (c: any) => c.type === "text"
    ) ?? [];
    for (const t of texts) {
      try {
        const parsed = JSON.parse(t.text);
        if (parsed?.type) { data = parsed; break; }
      } catch { /* not JSON, skip */ }
    }
  }

  // Store for refresh: resolve tool name from content type + pending args
  if (data?.type && _pendingArgs) {
    const toolMap = getTypeToToolMap();
    const toolName = toolMap[data.type];
    if (toolName) {
      storeLastToolCall(toolName, _pendingArgs);
    }
  }
  _pendingArgs = null;

  renderFromData(data);
};

// Expose refresh handler for chart renderers
(window as any).__mcpRefresh = async () => {
  const last = getLastToolCall();
  const appInstance = getAppInstance();
  if (!last || !appInstance) return;

  try {
    const result = await appInstance.callServerTool({
      name: last.name,
      arguments: last.args,
    });

    let data = (result as any).structuredContent;
    if (!data?.type) {
      const texts = (result as any).content?.filter(
        (c: any) => c.type === "text"
      ) ?? [];
      for (const t of texts) {
        try {
          const parsed = JSON.parse(t.text);
          if (parsed?.type) { data = parsed; break; }
        } catch { /* skip */ }
      }
    }

    renderFromData(data);
  } catch (e) {
    console.warn("Refresh failed:", e);
  }
};

// Standalone preview mode: if chart data is pre-injected (browser preview fallback),
// render immediately without connecting to the MCP host.
if ((window as any).__CHART_DATA__) {
  renderFromData((window as any).__CHART_DATA__);
} else {
  app.connect().catch((err) => {
    console.error("Failed to connect to host:", err);
    root.innerHTML = `<div class="loading">Connection failed. Please retry.</div>`;
  });
}
