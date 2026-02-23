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
const app = new App({ name: "MCP Dashboard", version: "1.0.0" });

// Make app accessible to chart renderers for bidirectional messaging
setAppInstance(app);

function renderFromData(data: any): void {
  if (!data?.type) {
    root.innerHTML = `<div class="loading">No chart data received.</div>`;
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
  } catch (err) {
    console.error("Render error:", err);
    root.innerHTML = `<div class="loading">Error rendering chart. Check console.</div>`;
  }
}

// Capture tool input for live refresh
app.ontoolinput = (params) => {
  const toolName = (params as any).name;
  const toolArgs = (params as any).arguments;
  if (toolName && toolArgs) {
    storeLastToolCall(toolName, toolArgs);
  }
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

app.connect();
