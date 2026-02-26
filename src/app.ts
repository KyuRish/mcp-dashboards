import { App } from "@modelcontextprotocol/ext-apps";
import { renderPieChart } from "./charts/pie.js";
import { renderBarChart } from "./charts/bar.js";
import { renderLineChart } from "./charts/line.js";
import { renderDashboard } from "./charts/dashboard.js";
import { renderScatterChart } from "./charts/scatter.js";
import { renderCandlestickChart } from "./charts/candlestick.js";
import { renderTable } from "./charts/table.js";
import { renderAutoChart } from "./charts/auto.js";
import { setAppInstance, storeLastToolCall, getLastToolCall, getAppInstance } from "./charts/shared.js";
import "./styles.css";

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
  { name: "MCP Dashboard", version: "1.0.0" },
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
    switch (data.type) {
      case "pie":
        renderPieChart(root, data);
        break;
      case "bar":
        renderBarChart(root, data);
        break;
      case "line":
        renderLineChart(root, data);
        break;
      case "scatter":
        renderScatterChart(root, data);
        break;
      case "candlestick":
        renderCandlestickChart(root, data);
        break;
      case "dashboard":
        renderDashboard(root, data);
        break;
      case "table":
        renderTable(root, data);
        break;
      case "auto":
        renderAutoChart(root, data);
        break;
      default:
        root.innerHTML = `<div class="loading">Unknown chart type: ${data.type}</div>`;
    }
    reportSize();
  } catch (err) {
    console.error("Render error:", err);
    root.innerHTML = `<div class="loading">Error rendering chart. Check console.</div>`;
    reportSize();
  }
}

// Map structuredContent.type to server tool names
const TYPE_TO_TOOL: Record<string, string> = {
  pie: "render_pie_chart",
  bar: "render_bar_chart",
  line: "render_line_chart",
  scatter: "render_scatter_chart",
  candlestick: "render_candlestick_chart",
  dashboard: "render_dashboard",
  table: "render_table",
  auto: "render_from_json",
};

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
    const toolName = TYPE_TO_TOOL[data.type];
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

app.connect().catch((err) => {
  console.error("Failed to connect to host:", err);
  root.innerHTML = `<div class="loading">Connection failed. Please retry.</div>`;
});