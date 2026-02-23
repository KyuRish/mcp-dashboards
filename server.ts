import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CallToolResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Works both from source (server.ts) and compiled (dist/server.js)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = __filename.endsWith(".ts")
  ? path.join(__dirname, "dist")
  : __dirname;

const RESOURCE_URI = "ui://dashboard/mcp-app.html";

// -- Zod schemas --

const PieDataItem = z.object({
  label: z.string(),
  value: z.number(),
});

const ColorsOption = z.array(z.string()).optional().describe("Custom color palette as hex codes (e.g. ['#FF6384', '#36A2EB']). Uses default palette if omitted.");

const PieOptions = z.object({
  donut: z.boolean().optional().describe("Render as donut chart (hollow center). Default: false"),
  showLegend: z.boolean().optional().describe("Show legend. Default: true"),
  colors: ColorsOption,
}).optional();

const DatasetSchema = z.object({
  label: z.string().describe("Name of this data series"),
  data: z.array(z.number()).describe("Array of numeric values"),
});

const BarOptions = z.object({
  horizontal: z.boolean().optional().describe("Horizontal bars instead of vertical. Default: false"),
  stacked: z.boolean().optional().describe("Stack datasets. Default: false"),
  colors: ColorsOption,
}).optional();

const LineOptions = z.object({
  fill: z.boolean().optional().describe("Fill area under the line. Default: true"),
  smooth: z.boolean().optional().describe("Smooth curve interpolation. Default: true"),
  showPoints: z.boolean().optional().describe("Show data points. Default: false"),
  colors: ColorsOption,
}).optional();

const ScatterPointSchema = z.object({
  x: z.number().describe("X coordinate"),
  y: z.number().describe("Y coordinate"),
});

const ScatterDatasetSchema = z.object({
  label: z.string().describe("Name of this data series"),
  data: z.array(ScatterPointSchema).describe("Array of {x, y} coordinate pairs"),
});

const ScatterOptions = z.object({
  xLabel: z.string().optional().describe("Label for x-axis"),
  yLabel: z.string().optional().describe("Label for y-axis"),
  showLine: z.boolean().optional().describe("Connect points with lines. Default: false"),
  colors: ColorsOption,
}).optional();

const KpiSchema = z.object({
  label: z.string().describe("KPI name"),
  value: z.union([z.string(), z.number()]).describe("KPI value"),
  change: z.number().optional().describe("Percentage change (positive = up, negative = down)"),
  prefix: z.string().optional().describe("Prefix like $ or Rs."),
  suffix: z.string().optional().describe("Suffix like % or units"),
});

const DashboardChart = z.object({
  type: z.enum(["pie", "bar", "line"]).describe("Chart type"),
  title: z.string().optional(),
  data: z.any().describe("Chart data matching the chart type's data format"),
  labels: z.array(z.string()).optional(),
  datasets: z.array(DatasetSchema).optional(),
  options: z.any().optional(),
});

/**
 * Creates a new MCP Dashboard server instance.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "MCP Dashboard",
    version: "1.0.0",
  });

  // -- Shared HTML resource --
  registerAppResource(
    server,
    RESOURCE_URI,
    RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(
        path.join(DIST_DIR, "mcp-app.html"),
        "utf-8"
      );
      return {
        contents: [{ uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: html }],
      };
    }
  );

  // -- Tool: render_pie_chart --
  registerAppTool(
    server,
    "render_pie_chart",
    {
      title: "Pie Chart",
      description:
        "Render an interactive pie or donut chart from key-value data. Provide an array of {label, value} pairs.",
      inputSchema: {
        title: z.string().describe("Chart title"),
        data: z.array(PieDataItem).describe("Array of {label, value} pairs"),
        options: PieOptions,
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async (args: {
      title: string;
      data: Array<{ label: string; value: number }>;
      options?: { donut?: boolean; showLegend?: boolean; colors?: string[] };
    }): Promise<CallToolResult> => {
      const chartData = {
        type: "pie" as const,
        title: args.title,
        data: args.data,
        options: args.options ?? {},
      };
      const total = args.data.reduce((s, d) => s + d.value, 0);
      const summary = args.data
        .map((d) => `${d.label}: ${d.value} (${((d.value / total) * 100).toFixed(1)}%)`)
        .join(", ");

      return {
        content: [
          { type: "text", text: `${args.title}: ${summary}` },
          { type: "text", text: JSON.stringify(chartData) },
        ],
        structuredContent: chartData,
      };
    }
  );

  // -- Tool: render_bar_chart --
  registerAppTool(
    server,
    "render_bar_chart",
    {
      title: "Bar Chart",
      description:
        "Render an interactive bar chart. Supports vertical/horizontal, stacked, and multi-series datasets.",
      inputSchema: {
        title: z.string().describe("Chart title"),
        labels: z.array(z.string()).describe("Category labels for the x-axis"),
        datasets: z.array(DatasetSchema).describe("One or more data series"),
        options: BarOptions,
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async (args: {
      title: string;
      labels: string[];
      datasets: Array<{ label: string; data: number[] }>;
      options?: { horizontal?: boolean; stacked?: boolean; colors?: string[] };
    }): Promise<CallToolResult> => {
      const chartData = {
        type: "bar" as const,
        title: args.title,
        labels: args.labels,
        datasets: args.datasets,
        options: args.options ?? {},
      };
      const summary = args.datasets
        .map((ds) => `${ds.label}: [${ds.data.join(", ")}]`)
        .join("; ");

      return {
        content: [
          { type: "text", text: `${args.title} - ${summary}` },
          { type: "text", text: JSON.stringify(chartData) },
        ],
        structuredContent: chartData,
      };
    }
  );

  // -- Tool: render_line_chart --
  registerAppTool(
    server,
    "render_line_chart",
    {
      title: "Line Chart",
      description:
        "Render an interactive line or area chart. Supports smooth curves, gradient fill, and multiple series.",
      inputSchema: {
        title: z.string().describe("Chart title"),
        labels: z.array(z.string()).describe("X-axis labels (e.g. dates, categories)"),
        datasets: z.array(DatasetSchema).describe("One or more data series"),
        options: LineOptions,
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async (args: {
      title: string;
      labels: string[];
      datasets: Array<{ label: string; data: number[] }>;
      options?: { fill?: boolean; smooth?: boolean; showPoints?: boolean; colors?: string[] };
    }): Promise<CallToolResult> => {
      const chartData = {
        type: "line" as const,
        title: args.title,
        labels: args.labels,
        datasets: args.datasets,
        options: args.options ?? {},
      };
      const summary = args.datasets
        .map((ds) => `${ds.label}: [${ds.data.join(", ")}]`)
        .join("; ");

      return {
        content: [
          { type: "text", text: `${args.title} - ${summary}` },
          { type: "text", text: JSON.stringify(chartData) },
        ],
        structuredContent: chartData,
      };
    }
  );

  // -- Tool: render_dashboard --
  registerAppTool(
    server,
    "render_dashboard",
    {
      title: "Dashboard",
      description:
        "Render a full dashboard with KPI cards and multiple charts in a responsive grid layout.",
      inputSchema: {
        title: z.string().describe("Dashboard title"),
        kpis: z.array(KpiSchema).optional().describe("KPI metrics shown as cards at the top"),
        charts: z.array(DashboardChart).describe("Array of charts to display in the grid"),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async (args: {
      title: string;
      kpis?: Array<{
        label: string;
        value: string | number;
        change?: number;
        prefix?: string;
        suffix?: string;
      }>;
      charts: Array<{
        type: string;
        title?: string;
        data?: unknown;
        labels?: string[];
        datasets?: Array<{ label: string; data: number[] }>;
        options?: unknown;
      }>;
    }): Promise<CallToolResult> => {
      const chartData = {
        type: "dashboard" as const,
        title: args.title,
        kpis: args.kpis ?? [],
        charts: args.charts,
      };
      const parts: string[] = [`Dashboard: ${args.title}`];
      if (args.kpis) {
        parts.push(
          `KPIs: ${args.kpis.map((k) => `${k.label}=${k.prefix ?? ""}${k.value}${k.suffix ?? ""}`).join(", ")}`
        );
      }
      parts.push(`Charts: ${args.charts.length} widgets`);

      return {
        content: [
          { type: "text", text: parts.join(" | ") },
          { type: "text", text: JSON.stringify(chartData) },
        ],
        structuredContent: chartData,
      };
    }
  );

  // -- Tool: render_scatter_chart --
  registerAppTool(
    server,
    "render_scatter_chart",
    {
      title: "Scatter Chart",
      description:
        "Render an interactive scatter plot with x/y coordinate data. Supports multiple series and optional connecting lines.",
      inputSchema: {
        title: z.string().describe("Chart title"),
        datasets: z.array(ScatterDatasetSchema).describe("One or more data series with {x, y} points"),
        options: ScatterOptions,
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async (args): Promise<CallToolResult> => {
      const chartData = {
        type: "scatter" as const,
        title: args.title,
        datasets: args.datasets,
        options: args.options ?? {},
      };
      const summary = args.datasets
        .map((ds) => `${ds.label}: ${ds.data.length} points`)
        .join("; ");

      return {
        content: [
          { type: "text", text: `${args.title} - ${summary}` },
          { type: "text", text: JSON.stringify(chartData) },
        ],
        structuredContent: chartData,
      };
    }
  );

  // -- Tool: render_table --
  registerAppTool(
    server,
    "render_table",
    {
      title: "Data Table",
      description:
        "Render a sortable, interactive data table. Click column headers to sort.",
      inputSchema: {
        title: z.string().describe("Table title"),
        columns: z.array(z.string()).describe("Column names in display order"),
        rows: z.array(z.record(z.string(), z.union([z.string(), z.number()]))).describe(
          "Array of row objects. Keys must match column names."
        ),
        options: z.object({
          sortable: z.boolean().optional().describe("Enable column sorting. Default: true"),
          striped: z.boolean().optional().describe("Alternating row colors. Default: false"),
        }).optional(),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async (args): Promise<CallToolResult> => {
      const chartData = {
        type: "table" as const,
        title: args.title,
        columns: args.columns,
        rows: args.rows,
        options: args.options ?? {},
      };

      return {
        content: [
          { type: "text", text: `${args.title}: ${args.rows.length} rows, ${args.columns.length} columns` },
          { type: "text", text: JSON.stringify(chartData) },
        ],
        structuredContent: chartData,
      };
    }
  );

  // -- Tool: render_from_json --
  registerAppTool(
    server,
    "render_from_json",
    {
      title: "Auto Chart",
      description:
        "Automatically detect the best chart type for arbitrary JSON data. Pass any JSON - arrays, objects, nested structures - and get the most appropriate visualization.",
      inputSchema: {
        title: z.string().describe("Chart title"),
        data: z.any().describe("Any JSON data - arrays, objects, key-value pairs, nested structures"),
        options: z.object({
          preferredType: z.enum(["pie", "bar", "line", "scatter", "table"]).optional().describe(
            "Force a specific chart type instead of auto-detecting"
          ),
        }).optional(),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async (args): Promise<CallToolResult> => {
      const chartData = {
        type: "auto" as const,
        title: args.title,
        data: args.data,
        options: args.options ?? {},
      };

      return {
        content: [
          { type: "text", text: `Auto-visualizing: ${args.title}` },
          { type: "text", text: JSON.stringify(chartData) },
        ],
        structuredContent: chartData,
      };
    }
  );

  return server;
}