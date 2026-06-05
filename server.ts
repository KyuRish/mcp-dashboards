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
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { getPreviewUrls, evictChartFromCache, TEMP_DIR, CHART_FILENAME_RE } from "./preview-server.js";
import { assertSafeUrl, acquireOutbound, UrlSafetyError } from "./url-safety.js";

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

// Shared theme parameters for all chart tools
const ThemeParam = z.string().optional().describe("Theme preset: boardroom, corporate, sales-floor, golden-treasury, clinical, startup, ops-control, tokyo-midnight, zen-garden, consultant, black-tron, black-elegance, black-matrix, forest-amber, forest-earth, sky-light, sky-ocean, sky-twilight, gray-hf, gray-copilot, office-red");
const PaletteParam = z.string().optional().describe("Override palette only (mix-and-match)");
const TypographyParam = z.string().optional().describe("Override typography: professional, luxury, cyberpunk, editorial, mono, bold, system, techno");
const EffectsParam = z.string().optional().describe("Override effects: none, subtle, shimmer, neon, energetic");

const PieOptions = z.object({
  donut: z.boolean().optional().describe("Render as donut chart (hollow center). Default: false"),
  showLegend: z.boolean().optional().describe("Show legend. Default: true"),
  colors: ColorsOption,
}).optional();

const DatasetSchema = z.object({
  label: z.string().describe("Name of this data series"),
  data: z.array(z.any()).describe("Data values: numbers for bar/line, {x,y} for scatter, {x,o,h,l,c} for candlestick"),
  colors: z.array(z.string()).optional().describe("Per-point colors (e.g. one color per bar). Overrides theme palette for this series"),
});

const AnnotationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("line"),
    axis: z.enum(["x", "y"]).describe("Which axis the line is on"),
    value: z.number().describe("Position on the axis"),
    label: z.string().optional().describe("Label text"),
    color: z.string().optional().describe("Line color"),
    style: z.enum(["solid", "dashed"]).optional().describe("Line style. Default: dashed"),
  }),
  z.object({
    type: z.literal("box"),
    xMin: z.number().optional(),
    xMax: z.number().optional(),
    yMin: z.number().optional(),
    yMax: z.number().optional(),
    label: z.string().optional(),
    color: z.string().optional().describe("Background color"),
  }),
  z.object({
    type: z.literal("label"),
    x: z.union([z.number(), z.string()]).describe("X position (number or category label)"),
    y: z.number().describe("Y position"),
    content: z.string().describe("Label text"),
    color: z.string().optional(),
  }),
]);

const AnnotationsOption = z.array(AnnotationSchema).optional().describe("Annotations: reference lines, highlighted regions, or labels on the chart");

const DrilldownLevel = z.object({
  labels: z.array(z.string()),
  datasets: z.array(z.object({ label: z.string(), data: z.array(z.number()) })),
});

const BarOptions = z.object({
  horizontal: z.boolean().optional().describe("Horizontal bars instead of vertical. Default: false"),
  stacked: z.boolean().optional().describe("Stack datasets. Default: false"),
  colors: ColorsOption,
  annotations: AnnotationsOption,
  drilldown: z.record(z.string(), DrilldownLevel).optional().describe("Click-to-drill sub-charts. Keys must match labels. Example: { 'North America': { labels: ['US','Canada'], datasets: [{ label: 'Revenue', data: [350,100] }] } }"),
}).optional();

const LineOptions = z.object({
  fill: z.boolean().optional().describe("Fill area under the line. Default: true"),
  smooth: z.boolean().optional().describe("Smooth curve interpolation. Default: true"),
  showPoints: z.boolean().optional().describe("Show data points. Default: false"),
  colors: ColorsOption,
  annotations: AnnotationsOption,
}).optional();

const ScatterPointSchema = z.object({
  x: z.number().describe("X coordinate"),
  y: z.number().describe("Y coordinate"),
  label: z.string().optional().describe("Label rendered next to the point on the chart"),
  tooltip: z.string().optional().describe("Custom detail text shown on hover"),
});

const ReferenceLineSchema = z.object({
  value: z.number().describe("Position on the axis"),
  label: z.string().optional().describe("Label for the reference line"),
  style: z.enum(["solid", "dashed"]).optional().describe("Line style. Default: dashed"),
});

const ScatterDatasetSchema = z.object({
  label: z.string().describe("Name of this data series"),
  data: z.array(ScatterPointSchema).describe("Array of {x, y} coordinate pairs with optional labels"),
});

const ScatterOptions = z.object({
  xLabel: z.string().optional().describe("Label for x-axis"),
  yLabel: z.string().optional().describe("Label for y-axis"),
  showLine: z.boolean().optional().describe("Connect points with lines. Default: false"),
  showLabels: z.boolean().optional().describe("Show per-point labels on chart. Default: true if any point has a label"),
  colors: ColorsOption,
  annotations: AnnotationsOption,
  referenceLines: z.object({
    horizontal: z.array(ReferenceLineSchema).optional().describe("Horizontal reference lines (y-axis values)"),
    vertical: z.array(ReferenceLineSchema).optional().describe("Vertical reference lines (x-axis values)"),
  }).optional().describe("(Deprecated - use annotations instead) Reference lines for context"),
}).optional();

const CandlestickPointSchema = z.object({
  date: z.string().describe("Date string (ISO 8601 or any parseable format)"),
  o: z.number().describe("Opening price"),
  h: z.number().describe("High price"),
  l: z.number().describe("Low price"),
  c: z.number().describe("Closing price"),
  v: z.number().optional().describe("Volume (optional)"),
});

const CandlestickOptions = z.object({
  type: z.enum(["candlestick", "ohlc"]).optional().describe("Chart style: candlestick (default) or OHLC bars"),
  showVolume: z.boolean().optional().describe("Show volume bars below chart. Default: false"),
}).optional();

const KpiSchema = z.object({
  label: z.string().describe("KPI name"),
  value: z.union([z.string(), z.number()]).describe("KPI value"),
  change: z.number().optional().describe("Percentage change (positive = up, negative = down)"),
  prefix: z.string().optional().describe("Prefix like $ or Rs."),
  suffix: z.string().optional().describe("Suffix like % or units"),
  sparkline: z.array(z.number()).optional().describe("Mini trend line (5-20 values). Always include when the metric has a trend or % change"),
});

const DashboardChart = z.object({
  type: z.enum([
    "pie", "bar", "line", "scatter", "candlestick", "radar", "treemap", "sankey", "wordcloud", "boxplot", "hero_ring", "hero",
    "bullet", "lollipop", "dumbbell", "variance", "funnel",
    "slope", "waffle", "sparkline", "radial_cluster",
    "waterfall", "heatmap", "timeline", "geo", "bubble_map",
  ]).describe("Chart type"),
  title: z.string().optional(),
  data: z.any().describe("Chart data matching the chart type's data format"),
  labels: z.array(z.string()).optional(),
  datasets: z.array(DatasetSchema).optional(),
  options: z.any().optional(),
  span: z.number().int().min(1).max(4).optional().describe("Grid column span (1 = default, 2 = full width in 2-col grid)"),
});

// -- Tool registration helper --
// Reduces boilerplate for chart tools that follow the standard pattern:
// themed input -> build chartData -> return text summary + structuredContent

function _registerChartTool(
  server: McpServer,
  name: string,
  meta: { title: string; description: string },
  inputSchema: Record<string, z.ZodType>,
  buildResult: (args: Record<string, any>) => { type: string; [key: string]: any },
  summarize: (args: Record<string, any>) => string,
): void {
  registerAppTool(
    server,
    name,
    {
      title: meta.title,
      description: meta.description,
      inputSchema: {
        ...inputSchema,
        theme: ThemeParam,
        palette: PaletteParam,
        typography: TypographyParam,
        effects: EffectsParam,
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args: Record<string, any>): Promise<CallToolResult> => {
      const chartData = {
        ...buildResult(args),
        theme: args.theme,
        palette: args.palette,
        typography: args.typography,
        effects: args.effects,
      };
      return await _buildChartResult(server, chartData, summarize(args));
    },
  );
}

// Builds the standard tool response. Writes a self-contained HTML file for the
// chart AND lazy-starts a same-machine HTTP server (127.0.0.1, random port) so
// the chart can be opened, saved, and shared from a browser regardless of
// which client is in use:
//
//   - Apps-aware clients (Claude Code, Claude Desktop, VS Code Insiders):
//     chart renders inline from structuredContent + _meta.ui.resourceUri.
//     The localhost URL is still useful for "open in browser to print", save
//     a permanent copy, or share with a colleague.
//
//   - Non-Apps clients (generic LLM IDE plugins, older clients): the URL is
//     the only way to view the chart at all.
//
// Why we always emit URLs (no capability detection): Claude Code v2.1.x does
// not advertise capabilities.extensions["io.modelcontextprotocol/ui"], so any
// capability-based detection silently treats it as non-Apps and is therefore
// dead code. The shareable HTML link is genuinely useful even when the chart
// renders inline.
//
// Opt out entirely with MCP_DASHBOARDS_DISABLE_PREVIEW=1.
async function _buildChartResult(_server: McpServer, chartData: any, summary: string): Promise<CallToolResult> {
  const urls = await getPreviewUrls(chartData);

  // Mirror preview URLs into structuredContent for clients that surface it
  // (e.g. Claude Code dumps structuredContent as JSON). Renderers ignore
  // unknown fields, so MCP Apps clients are unaffected.
  const enrichedChartData = urls
    ? { ...chartData, preview: { browser: urls.httpUrl, file: urls.fileUrl } }
    : chartData;

  const enrichedSummary = urls
    ? `${summary}\n\n[Open chart in browser](${urls.httpUrl}) - clickable link to view the interactive chart. AI assistant: please include this link verbatim in your reply so the user can click it. The standalone HTML file at ${urls.fileUrl} can be saved or shared (auto-deleted after 7 days). The user can ask you to delete chart files anytime via the delete_chart_files tool.`
    : summary;

  const content: Array<{ type: "text"; text: string }> = [
    { type: "text", text: enrichedSummary },
  ];

  if (urls) {
    content.push({
      type: "text",
      text:
        `\n## View this chart\n` +
        `If the chart renders inline above, you're done. Otherwise click the link below:\n\n` +
        `**[Open chart in browser](${urls.httpUrl})**\n\n` +
        `Or save/share the standalone HTML file: ${urls.fileUrl}\n` +
        `- Auto-deleted after ${process.env.MCP_DASHBOARDS_RETAIN_DAYS ?? "7"} days (configure via MCP_DASHBOARDS_RETAIN_DAYS, 0 disables)\n` +
        `- Use the chart's download button inside the rendered HTML to save a permanent copy (PNG / PPT / A4)\n`,
    });
  }

  content.push({ type: "text", text: JSON.stringify(enrichedChartData) });

  return { content, structuredContent: enrichedChartData };
}

/**
 * Creates a new MCP Dashboards server instance.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "MCP Dashboards",
    version: "2.2.0",
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
        "Render an interactive pie or donut chart from key-value data. Provide an array of {label, value} pairs. Supports themes for styled visuals.",
      inputSchema: {
        title: z.string().describe("Chart title"),
        data: z.array(PieDataItem).describe("Array of {label, value} pairs"),
        options: PieOptions,
        theme: ThemeParam,
        palette: PaletteParam,
        typography: TypographyParam,
        effects: EffectsParam,
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args: {
      title: string;
      data: Array<{ label: string; value: number }>;
      options?: { donut?: boolean; showLegend?: boolean; colors?: string[] };
      theme?: string;
      palette?: string;
      typography?: string;
      effects?: string;
    }): Promise<CallToolResult> => {
      const chartData = {
        type: "pie" as const,
        title: args.title,
        data: args.data,
        options: args.options ?? {},
        theme: args.theme,
        palette: args.palette,
        typography: args.typography,
        effects: args.effects,
      };
      const total = args.data.reduce((s, d) => s + d.value, 0);
      const summary = args.data
        .map((d) => `${d.label}: ${d.value} (${total > 0 ? ((d.value / total) * 100).toFixed(1) : "0.0"}%)`)
        .join(", ");

      return await _buildChartResult(server, chartData, `${args.title}: ${summary}`);
    }
  );

  // -- Tool: render_bar_chart --
  registerAppTool(
    server,
    "render_bar_chart",
    {
      title: "Bar Chart",
      description:
        "Render an interactive bar chart. Supports vertical/horizontal, stacked, multi-series, and click-to-drill-down (options.drilldown). Supports themes for styled visuals.",
      inputSchema: {
        title: z.string().describe("Chart title"),
        labels: z.array(z.string()).describe("Category labels for the x-axis"),
        datasets: z.array(DatasetSchema).describe("One or more data series"),
        options: BarOptions,
        theme: ThemeParam,
        palette: PaletteParam,
        typography: TypographyParam,
        effects: EffectsParam,
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args: {
      title: string;
      labels: string[];
      datasets: Array<{ label: string; data: (number | null)[] }>;
      options?: { horizontal?: boolean; stacked?: boolean; colors?: string[] };
      theme?: string;
      palette?: string;
      typography?: string;
      effects?: string;
    }): Promise<CallToolResult> => {
      const chartData = {
        type: "bar" as const,
        title: args.title,
        labels: args.labels,
        datasets: args.datasets,
        options: args.options ?? {},
        theme: args.theme,
        palette: args.palette,
        typography: args.typography,
        effects: args.effects,
      };
      const summary = args.datasets
        .map((ds) => `${ds.label}: [${ds.data.join(", ")}]`)
        .join("; ");

      return await _buildChartResult(server, chartData, `${args.title} - ${summary}`);
    }
  );

  // -- Tool: render_line_chart --
  registerAppTool(
    server,
    "render_line_chart",
    {
      title: "Line Chart",
      description:
        "Render an interactive line or area chart. Supports smooth curves, gradient fill, and multiple series. Supports themes for styled visuals.",
      inputSchema: {
        title: z.string().describe("Chart title"),
        labels: z.array(z.string()).describe("X-axis labels (e.g. dates, categories)"),
        datasets: z.array(DatasetSchema).describe("One or more data series"),
        options: LineOptions,
        theme: ThemeParam,
        palette: PaletteParam,
        typography: TypographyParam,
        effects: EffectsParam,
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args: {
      title: string;
      labels: string[];
      datasets: Array<{ label: string; data: (number | null)[] }>;
      options?: { fill?: boolean; smooth?: boolean; showPoints?: boolean; colors?: string[] };
      theme?: string;
      palette?: string;
      typography?: string;
      effects?: string;
    }): Promise<CallToolResult> => {
      const chartData = {
        type: "line" as const,
        title: args.title,
        labels: args.labels,
        datasets: args.datasets,
        options: args.options ?? {},
        theme: args.theme,
        palette: args.palette,
        typography: args.typography,
        effects: args.effects,
      };
      const summary = args.datasets
        .map((ds) => `${ds.label}: [${ds.data.join(", ")}]`)
        .join("; ");

      return await _buildChartResult(server, chartData, `${args.title} - ${summary}`);
    }
  );

  // -- Tool: render_hero_metric --
  const GemTypeEnum = z.enum([
    "diamond", "ruby", "sapphire", "emerald",
    "golden_pearl", "white_pearl", "black_pearl", "crystal",
  ]);

  const HeroVariantEnum = z.enum([
    "big_number", "progress_ring", "status", "comparison",
    "rank", "countdown", "threshold", "breakdown", "nps", "orb", "gem",
  ]);

  const SubsystemSchema = z.object({
    name: z.string(),
    status: z.enum(["good", "warn", "bad"]),
  });

  const BreakdownItemSchema = z.object({
    label: z.string(),
    value: z.number(),
    color: z.string().optional(),
  });

  const CountdownSegmentSchema = z.object({
    value: z.number(),
    label: z.string(),
  });

  const ThresholdZoneSchema = z.object({
    label: z.string(),
    from: z.number(),
    to: z.number(),
    color: z.string(),
  });

  registerAppTool(
    server,
    "render_hero_metric",
    {
      title: "Hero Metric",
      description: [
        "Render a purpose-driven hero metric widget. Pick the variant that answers your question:",
        "- big_number: 'How much? Which direction?' Default hero metric - clean, professional, works in any context. Large value + trend arrow + optional sparkline. Params: value, unit, change, changePeriod, sparkline[]",
        "- progress_ring: 'How close to goal?' Animated ring or half-gauge. Params: value, unit, label, progress (0-100), style ('ring'|'gauge'), size, color",
        "- status: 'Good or bad?' Pulsing dot + subsystem badges. Params: label, statusLevel ('good'|'warn'|'bad'), subsystems[{name,status}], count, peak",
        "- comparison: 'How do we compare?' Before/after + improvement. Params: before, after, improvement, beforeLabel, afterLabel",
        "- rank: 'Where do I stand?' Badge + percentile. Params: rank, total, percentile, rankChange",
        "- countdown: 'How long left?' Time segment boxes. Params: segments[{value,label}] OR deadline (ISO date)",
        "- threshold: 'Above or below limit?' Gradient bar + marker. Params: value, max, threshold, unit, zones[{label,from,to,color}]",
        "- breakdown: 'What is the split?' Stacked bar + legend. Params: items[{label,value,color?}]",
        "- nps: 'How satisfied?' Score + rating scale. Params: value, max (default 100), rating ('good'|'neutral'|'bad')",
        "- orb: 'What is the headline?' Dramatic glowing sphere. Use golden orb for resumes/portfolios. For tech meetings use only black, white, or crystal-colored orbs as subtle flair. Best with dark themes (tokyo-midnight, ops-control, startup). Avoid for formal contexts (boardroom, clinical, consultant). Params: value, unit, label, color",
        "- gem: 'Premium gem metric' Faceted/spherical gem - for wealth, fintech, trading, crypto, luxury contexts ONLY. Best with golden-treasury, tokyo-midnight themes. Do NOT use for corporate, clinical, consultant, or boardroom dashboards - use big_number instead. Params: value, unit, label, gemType. gemTypes:",
        "  crystal='Future' (forecasts, projections) | black_pearl='Rare find' (alt investments, crypto) | golden_pearl='Treasure' (gold, commodities) | white_pearl='Clean total' (savings)",
        "  diamond='Crown number' (net worth, total revenue) | ruby='What's critical' (urgent, burn rate) | sapphire='Foundation' (stability, uptime) | emerald='Growth' (YoY, appreciation)",
      ].join("\n"),
      inputSchema: {
        title: z.string().describe("Chart title"),
        variant: HeroVariantEnum.optional().describe("Widget variant (default: big_number)"),
        // Shared
        value: z.union([z.string(), z.number()]).optional().describe("Main metric value"),
        unit: z.string().optional().describe("Unit label (e.g. 'grams', '%', 'USD')"),
        label: z.string().optional().describe("Sub-label"),
        color: z.string().optional().describe("Override accent color (hex)"),
        // progress_ring
        progress: z.number().optional().describe("Ring fill 0-100"),
        size: z.enum(["sm", "md", "lg", "xl"]).optional().describe("Size: sm/md/lg/xl"),
        style: z.enum(["ring", "gauge"]).optional().describe("progress_ring style"),
        // big_number
        change: z.number().optional().describe("Percentage change"),
        changePeriod: z.string().optional().describe("Period label for change (e.g. 'vs last month')"),
        sparkline: z.array(z.number()).optional().describe("Mini bar sparkline data"),
        // status
        statusLevel: z.enum(["good", "warn", "bad"]).optional().describe("Status level"),
        subsystems: z.array(SubsystemSchema).optional().describe("Subsystem badges"),
        count: z.number().optional().describe("Live count"),
        peak: z.number().optional().describe("Peak count"),
        // comparison
        before: z.union([z.string(), z.number()]).optional().describe("Before value"),
        after: z.union([z.string(), z.number()]).optional().describe("After value"),
        improvement: z.union([z.string(), z.number()]).optional().describe("Improvement label"),
        beforeLabel: z.string().optional().describe("Before column label"),
        afterLabel: z.string().optional().describe("After column label"),
        // rank
        rank: z.number().optional().describe("Current rank"),
        total: z.number().optional().describe("Total in ranking"),
        percentile: z.number().optional().describe("Percentile"),
        rankChange: z.number().optional().describe("Positions moved"),
        // countdown
        segments: z.array(CountdownSegmentSchema).optional().describe("Time segments"),
        deadline: z.string().optional().describe("ISO deadline date"),
        // threshold
        max: z.number().optional().describe("Maximum value for threshold/nps"),
        threshold: z.number().optional().describe("Threshold limit line"),
        zones: z.array(ThresholdZoneSchema).optional().describe("Color zones"),
        // breakdown
        items: z.array(BreakdownItemSchema).optional().describe("Breakdown items"),
        // nps
        rating: z.enum(["good", "neutral", "bad"]).optional().describe("NPS rating override"),
        // gem
        gemType: GemTypeEnum.optional().describe("Gem type for variant=gem: diamond, ruby, sapphire, emerald, golden_pearl, white_pearl, black_pearl, crystal"),
        // theme
        theme: ThemeParam,
        palette: PaletteParam,
        typography: TypographyParam,
        effects: EffectsParam,
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args): Promise<CallToolResult> => {
      const chartData = {
        type: "hero_metric" as const,
        ...args,
      };

      const variant = args.variant || "big_number";
      const summary = `${args.title}: [${variant}] ${args.value ?? ""}${args.unit ? " " + args.unit : ""}`;

      return await _buildChartResult(server, chartData, summary);
    }
  );

  // -- Tool: render_dashboard --
  const HeroSchema = z.object({
    variant: HeroVariantEnum.optional().describe("Hero variant (default: progress_ring for dashboard)"),
    value: z.union([z.string(), z.number()]).optional().describe("Hero metric value"),
    unit: z.string().optional().describe("Unit label"),
    label: z.string().optional().describe("Sub-label"),
    progress: z.number().optional().describe("Ring fill 0-100"),
    color: z.string().optional().describe("Override accent color"),
    size: z.enum(["sm", "md", "lg", "xl"]).optional().describe("Size"),
    // Allow all variant-specific fields
    change: z.number().optional(),
    statusLevel: z.enum(["good", "warn", "bad"]).optional(),
    subsystems: z.array(SubsystemSchema).optional(),
    count: z.number().optional(),
    before: z.union([z.string(), z.number()]).optional(),
    after: z.union([z.string(), z.number()]).optional(),
    improvement: z.union([z.string(), z.number()]).optional(),
    rank: z.number().optional(),
    total: z.number().optional(),
    percentile: z.number().optional(),
    rankChange: z.number().optional(),
    items: z.array(BreakdownItemSchema).optional(),
    gemType: GemTypeEnum.optional(),
  });

  const FooterSchema = z.object({
    text: z.string().optional().describe("Footer text"),
    lastUpdated: z.string().optional().describe("Timestamp string to display"),
  });

  registerAppTool(
    server,
    "render_dashboard",
    {
      title: "Dashboard",
      description:
        "Render a full dashboard with KPI cards, charts, and optional hero metric in a responsive grid. Available themes: boardroom (investors, board decks), corporate (enterprise daily use), sales-floor (quota tracking, leaderboards), golden-treasury (wealth, luxury real estate), clinical (healthcare, compliance - WCAG AAA), startup (SaaS metrics, YC demos), ops-control (DevOps, manufacturing), tokyo-midnight (crypto, trading, gaming), zen-garden (wellness, sustainability), consultant (agency deliverables, presentations), office-red (corporate report-style, Word/PowerPoint aesthetic). Mix-and-match: set palette + typography + effects independently.",
      inputSchema: {
        title: z.string().describe("Dashboard title"),
        kpis: z.array(KpiSchema).optional().describe("KPI cards at the top. Include sparkline[] with 5-20 trend values whenever a metric has a % change - this adds an inline mini chart to the card"),
        charts: z.array(DashboardChart).describe("Array of charts to display in the grid"),
        columns: z.number().int().min(1).max(4).optional().describe("Number of grid columns (1-4). Default: auto-fill based on available width"),
        theme: ThemeParam,
        palette: PaletteParam,
        typography: TypographyParam,
        effects: EffectsParam,
        hero: z.union([HeroSchema, z.array(HeroSchema)]).optional().describe("Hero metric(s) - single object or array for multi-hero row"),
        footer: FooterSchema.optional().describe("Footer bar with text and/or timestamp"),
        layout: z.enum(["default", "hero-center", "kpi-top"]).optional().describe("Layout variant: default (hero above KPIs), hero-center (hero prominent), kpi-top (KPIs first)"),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args: {
      title: string;
      kpis?: Array<{
        label: string;
        value: string | number;
        change?: number;
        prefix?: string;
        suffix?: string;
        sparkline?: number[];
      }>;
      charts: Array<{
        type: string;
        title?: string;
        data?: unknown;
        labels?: string[];
        datasets?: Array<{ label: string; data: (number | null)[] }>;
        options?: unknown;
        span?: number;
      }>;
      columns?: number;
      theme?: string;
      palette?: string;
      typography?: string;
      effects?: string;
      hero?: Record<string, any> | Array<Record<string, any>>;
      footer?: { text?: string; lastUpdated?: string };
      layout?: "default" | "hero-center" | "kpi-top";
    }): Promise<CallToolResult> => {
      const chartData = {
        type: "dashboard" as const,
        title: args.title,
        kpis: args.kpis ?? [],
        charts: args.charts,
        columns: args.columns,
        theme: args.theme,
        palette: args.palette,
        typography: args.typography,
        effects: args.effects,
        hero: args.hero,
        footer: args.footer,
        layout: args.layout,
      };
      const parts: string[] = [`Dashboard: ${args.title}`];
      if (args.theme) parts.push(`Theme: ${args.theme}`);
      if (args.kpis) {
        parts.push(
          `KPIs: ${args.kpis.map((k) => `${k.label}=${k.prefix ?? ""}${k.value}${k.suffix ?? ""}`).join(", ")}`
        );
      }
      parts.push(`Charts: ${args.charts.length} widgets`);
      if (args.hero) {
        const heroCount = Array.isArray(args.hero) ? args.hero.length : 1;
        parts.push(`Hero: ${heroCount} widget${heroCount > 1 ? "s" : ""}`);
      }

      return await _buildChartResult(server, chartData, parts.join(" | "));
    }
  );

  // -- Tool: render_chart_catalog --
  registerAppTool(
    server,
    "render_chart_catalog",
    {
      title: "Chart Catalog",
      description: "Show a visual catalog of every available chart type as a dashboard of mini previews. Click any card to learn more about that chart tool.",
      inputSchema: {
        theme: ThemeParam,
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args: { theme?: string }): Promise<CallToolResult> => {
      // CSS-delegated charts spread c.data into the payload, so array data
      // must be wrapped as { data: [...] } to land on payload.data correctly.
      const charts: Array<{ type: string; title: string; data?: unknown; labels?: string[]; datasets?: Array<{ label: string; data: any[] }>; options?: unknown }> = [
        // -- Canvas charts --
        { type: "pie", title: "render_pie_chart", data: [
          { label: "A", value: 40 }, { label: "B", value: 30 }, { label: "C", value: 20 }, { label: "D", value: 10 },
        ]},
        { type: "bar", title: "render_bar_chart", labels: ["Q1", "Q2", "Q3", "Q4"], datasets: [
          { label: "Revenue", data: [12, 19, 8, 15] },
        ]},
        { type: "line", title: "render_line_chart", labels: ["Jan", "Feb", "Mar", "Apr", "May"], datasets: [
          { label: "Users", data: [10, 25, 18, 35, 42] },
        ]},
        { type: "radar", title: "render_radar_chart", labels: ["Speed", "Power", "Range", "Durability", "Accuracy"], datasets: [
          { label: "Score", data: [80, 65, 90, 50, 75] },
        ]},
        { type: "treemap", title: "render_treemap_chart", data: [
          { label: "Tech", value: 40 }, { label: "Health", value: 25 }, { label: "Finance", value: 20 }, { label: "Energy", value: 15 },
        ]},
        { type: "sankey", title: "render_sankey_chart", data: [
          { from: "Budget", to: "Marketing", flow: 30 }, { from: "Budget", to: "R&D", flow: 50 },
          { from: "Budget", to: "Ops", flow: 20 }, { from: "Marketing", to: "Sales", flow: 30 },
        ]},
        { type: "wordcloud", title: "render_wordcloud_chart", data: [
          { text: "AI", value: 90 }, { text: "Cloud", value: 70 }, { text: "Data", value: 60 },
          { text: "API", value: 50 }, { text: "ML", value: 45 }, { text: "IoT", value: 35 },
        ]},
        { type: "boxplot", title: "render_boxplot_chart", labels: ["A", "B"], datasets: [
          { label: "Group A", data: [[2, 5, 7, 8, 12, 15, 18]] }, { label: "Group B", data: [[3, 6, 9, 11, 14, 16, 20]] },
        ]},
        { type: "geo", title: "render_geo_chart", data: [
          { country: "US", value: 80 }, { country: "DE", value: 60 }, { country: "IN", value: 50 }, { country: "BR", value: 35 }, { country: "AU", value: 25 },
        ]},
        // -- CSS-delegated charts --
        // Dashboard spreads c.data then c into payload. For array data,
        // ...c puts data:[array] which is what renderers read. Extra props
        // go at root level so ...c spreads them into the payload.
        { type: "bullet", title: "render_bullet_chart", data: {
          label: "Revenue", actual: 275, target: 300, ranges: [150, 225, 300],
        }},
        { type: "lollipop", title: "render_lollipop_chart", data: [
          { label: "Alpha", value: 85 }, { label: "Beta", value: 62 }, { label: "Gamma", value: 43 }, { label: "Delta", value: 91 },
        ]},
        { type: "dumbbell", title: "render_dumbbell_chart", data: [
          { label: "Q1", before: 20, after: 45 }, { label: "Q2", before: 30, after: 60 }, { label: "Q3", before: 15, after: 55 },
        ], beforeLabel: "Start", afterLabel: "End" } as any,
        { type: "variance", title: "render_variance_chart", data: [
          { label: "Jan", actual: 100, budget: 90 }, { label: "Feb", actual: 85, budget: 95 },
          { label: "Mar", actual: 110, budget: 100 }, { label: "Apr", actual: 70, budget: 80 },
        ]},
        { type: "funnel", title: "render_funnel_chart", data: [
          { label: "Visitors", value: 1000 }, { label: "Leads", value: 600 }, { label: "Qualified", value: 300 }, { label: "Won", value: 80 },
        ]},
        { type: "slope", title: "render_slope_chart", data: [
          { label: "Product A", start: 30, end: 55 }, { label: "Product B", start: 50, end: 40 }, { label: "Product C", start: 20, end: 65 },
        ], periodStart: "2024", periodEnd: "2025" } as any,
        { type: "waffle", title: "render_waffle_chart", data: [
          { label: "Complete", value: 73 }, { label: "Remaining", value: 27 },
        ]},
        { type: "radial_cluster", title: "render_radial_cluster", metrics: [
          { label: "Uptime", value: 95, status: "good" }, { label: "Latency", value: 60, status: "warn" },
          { label: "Errors", value: 25, status: "bad" }, { label: "CPU", value: 80, status: "good" },
        ] } as any,
        { type: "waterfall", title: "render_waterfall_chart", data: [
          { label: "Start", value: 100 }, { label: "Sales", value: 50 }, { label: "Costs", value: -30 },
          { label: "Tax", value: -15 }, { label: "End", value: 105, total: true },
        ]},
        { type: "heatmap", title: "render_heatmap_chart", data: {
          rows: ["Mon", "Tue", "Wed"], columns: ["9am", "12pm", "3pm", "6pm"],
          values: [[3, 7, 5, 2], [8, 4, 6, 9], [1, 5, 8, 3]],
        }},
        { type: "timeline", title: "render_timeline_chart", milestones: [
          { label: "Research", status: "done", date: "Jan" },
          { label: "Build", status: "active", date: "Mar" },
          { label: "Launch", status: "pending", date: "Jun" },
          { label: "Scale", status: "pending", date: "Sep" },
        ] } as any,
        // -- Hero types --
        { type: "hero", title: "render_hero_metric", data: {
          variant: "progress_ring", value: 87, unit: "%", label: "Completion", progress: 87,
        }},
      ];

      const kpis = [
        { label: "Total Chart Tools", value: 31, suffix: " tools" },
        { label: "Themes", value: 21, suffix: " presets" },
      ];

      const chartData = {
        type: "dashboard" as const,
        title: "Chart Catalog",
        kpis,
        charts,
        columns: 3,
        theme: args.theme,
        footer: { text: "mcp-dashboards", lastUpdated: "Also available: render_table, render_from_json, render_from_url, render_live_chart, poll_http" },
      };

      return await _buildChartResult(server, chartData, "Chart Catalog: 22 visual previews of every embeddable chart type. Click any card to ask about it. Standalone-only tools (table, live, auto, URL) listed in footer.");
    }
  );

  // -- Tool: render_theme_catalog --
  registerAppTool(
    server,
    "render_theme_catalog",
    {
      title: "Theme Catalog",
      description: "Show a visual catalog of all 21 available themes. Each card previews the theme's colors, typography, and effects. Click any card to use that theme.",
      inputSchema: {},
      _meta: { ui: { resourceUri: RESOURCE_URI } },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (): Promise<CallToolResult> => {
      return await _buildChartResult(
        server,
        { type: "theme_catalog" },
        "Theme Catalog: 21 theme previews with color swatches, typography, and effects. Click any card to use it."
      );
    }
  );

  // -- Tool: render_radar_chart --
  _registerChartTool(server, "render_radar_chart", {
    title: "Radar Chart",
    description: "Render a radar (spider/web) chart - 'How do items compare across multiple dimensions?' Great for skill profiles, product comparisons, competitive analysis.",
  }, {
    title: z.string().describe("Chart title"),
    labels: z.array(z.string()).describe("Axis labels around the perimeter (e.g. Speed, Cost, UX)"),
    datasets: z.array(DatasetSchema).describe("One or more data series to compare"),
    options: z.object({
      fill: z.boolean().optional().describe("Fill area inside the radar. Default: true"),
      tension: z.number().optional().describe("Line smoothing: 0 = angular, 0.3 = smooth. Default: 0.1"),
      scale_min: z.number().optional().describe("Minimum scale value"),
      scale_max: z.number().optional().describe("Maximum scale value"),
      colors: ColorsOption,
    }).optional(),
  }, (args) => ({
    type: "radar" as const,
    title: args.title,
    labels: args.labels,
    datasets: args.datasets,
    options: args.options ?? {},
  }), (args) => {
    const ds = args.datasets as any[];
    return `${args.title}: ${ds.map((d: any) => d.label).join(", ")} across ${(args.labels as string[]).length} dimensions`;
  });

  // -- Tool: render_treemap_chart --
  _registerChartTool(server, "render_treemap_chart", {
    title: "Treemap",
    description: "Render a treemap - 'What takes up the most space?' Nested rectangles sized by value. Supports optional grouping for hierarchical data (e.g. region > country). Great for budget breakdowns, disk usage, portfolio allocation.",
  }, {
    title: z.string().describe("Chart title"),
    data: z.array(z.object({
      label: z.string().describe("Item name"),
      value: z.number().describe("Numeric size value"),
      group: z.string().optional().describe("Optional group for hierarchy (e.g. 'Technology', 'Healthcare')"),
    })).describe("Array of items to display"),
    options: z.object({
      groups: z.boolean().optional().describe("Enable grouping by group field. Default: auto-detected"),
      colors: ColorsOption,
    }).optional(),
  }, (args) => ({
    type: "treemap" as const,
    title: args.title,
    data: args.data,
    options: args.options ?? {},
  }), (args) => {
    const items = args.data as any[];
    return `${args.title}: ${items.length} items, largest: ${items.sort((a: any, b: any) => b.value - a.value)[0]?.label}`;
  });

  // -- Tool: render_sankey_chart --
  _registerChartTool(server, "render_sankey_chart", {
    title: "Sankey Diagram",
    description: "Render a sankey flow diagram - 'Where does it go?' Shows flows between nodes with width proportional to value. Great for budget flows, user journeys, energy transfers, conversion funnels with multiple paths.",
  }, {
    title: z.string().describe("Chart title"),
    data: z.array(z.object({
      from: z.string().describe("Source node name"),
      to: z.string().describe("Target node name"),
      flow: z.number().describe("Flow amount"),
    })).describe("Array of flows between nodes"),
    options: z.object({
      colorMode: z.enum(["gradient", "from", "to"]).optional().describe("Flow color mode. Default: gradient"),
      colors: ColorsOption,
    }).optional(),
  }, (args) => ({
    type: "sankey" as const,
    title: args.title,
    data: args.data,
    options: args.options ?? {},
  }), (args) => {
    const flows = args.data as any[];
    const nodes = [...new Set(flows.flatMap((f: any) => [f.from, f.to]))];
    return `${args.title}: ${flows.length} flows across ${nodes.length} nodes`;
  });

  // -- Tool: render_wordcloud_chart --
  _registerChartTool(server, "render_wordcloud_chart", {
    title: "Word Cloud",
    description: "Render a word cloud - 'What are the dominant themes?' Words sized by frequency or importance. Great for survey responses, keyword analysis, topic frequency.",
  }, {
    title: z.string().describe("Chart title"),
    data: z.array(z.object({
      text: z.string().describe("Word or phrase"),
      value: z.number().describe("Frequency, weight, or importance score"),
    })).describe("Array of words with values"),
    options: z.object({
      colors: ColorsOption,
    }).optional(),
  }, (args) => ({
    type: "wordcloud" as const,
    title: args.title,
    data: args.data,
    options: args.options ?? {},
  }), (args) => {
    const words = args.data as any[];
    const top = words.sort((a: any, b: any) => b.value - a.value).slice(0, 5).map((w: any) => w.text);
    return `${args.title}: ${words.length} words, top: ${top.join(", ")}`;
  });

  // -- Tool: render_boxplot_chart --
  _registerChartTool(server, "render_boxplot_chart", {
    title: "Boxplot / Violin",
    description: "Render a boxplot or violin chart - 'What is the distribution?' Shows median, quartiles, whiskers, and outliers. Pass raw number arrays per category - stats computed automatically. Use style='violin' for density shape.",
  }, {
    title: z.string().describe("Chart title"),
    labels: z.array(z.string()).describe("Category labels (e.g. ['Q1', 'Q2', 'Q3', 'Q4'])"),
    datasets: z.array(z.object({
      label: z.string().describe("Series name"),
      data: z.array(z.array(z.number())).describe("Array of number arrays - one array of raw values per category"),
    })).describe("One or more data series"),
    options: z.object({
      style: z.enum(["boxplot", "violin"]).optional().describe("Visualization style. Default: boxplot"),
      horizontal: z.boolean().optional().describe("Horizontal orientation. Default: false"),
      colors: ColorsOption,
    }).optional(),
  }, (args) => ({
    type: "boxplot" as const,
    title: args.title,
    labels: args.labels,
    datasets: args.datasets,
    options: args.options ?? {},
  }), (args) => {
    const ds = args.datasets as any[];
    return `${args.title}: ${ds.map((d: any) => d.label).join(", ")} across ${(args.labels as string[]).length} categories`;
  });

  // -- Tool: render_live_chart --
  _registerChartTool(server, "render_live_chart", {
    title: "Live Chart",
    description: "Render a real-time auto-updating line chart that polls a tool at a regular interval. Use when the user wants to MONITOR a live data source. Set pollTool to 'poll_http' with pollArgs containing a preset or URL to poll external APIs (including other MCP servers' data). The chart auto-refreshes - no user action needed.",
  }, {
    title: z.string().describe("Chart title"),
    pollTool: z.string().describe("Name of the MCP tool to call on each poll (e.g. 'get_system_metrics')"),
    pollArgs: z.record(z.string(), z.any()).optional().describe("Arguments to pass to the polled tool"),
    values: z.array(z.object({
      label: z.string().describe("Series name (e.g. 'CPU %')"),
      path: z.string().describe("Dot-path to extract a number from the tool result JSON (e.g. 'cpu_percent' or 'metrics.cpu')"),
    })).describe("One or more numeric values to track per poll"),
    interval: z.number().optional().describe("Poll interval in seconds. Default: 2"),
    maxPoints: z.number().optional().describe("Rolling window size. Default: 30"),
    yLabel: z.string().optional().describe("Y-axis label"),
    yMin: z.number().optional().describe("Y-axis minimum"),
    yMax: z.number().optional().describe("Y-axis maximum (e.g. 100 for percentages)"),
    colors: ColorsOption,
  }, (args) => ({
    type: "live" as const,
    title: args.title,
    pollTool: args.pollTool,
    pollArgs: args.pollArgs,
    values: args.values,
    interval: args.interval,
    maxPoints: args.maxPoints,
    yLabel: args.yLabel,
    yMin: args.yMin,
    yMax: args.yMax,
    colors: args.colors,
  }), (args) => {
    const series = (args.values as any[]).map((v: any) => v.label).join(", ");
    return `Live chart "${args.title}" - polling ${args.pollTool} every ${args.interval ?? 2}s: ${series}`;
  });

  // -- Tool: render_scatter_chart --
  registerAppTool(
    server,
    "render_scatter_chart",
    {
      title: "Scatter Chart",
      description:
        "Render an interactive scatter plot with x/y coordinate data. Supports multiple series and optional connecting lines. Supports themes for styled visuals.",
      inputSchema: {
        title: z.string().describe("Chart title"),
        datasets: z.array(ScatterDatasetSchema).describe("One or more data series with {x, y} points"),
        options: ScatterOptions,
        theme: ThemeParam,
        palette: PaletteParam,
        typography: TypographyParam,
        effects: EffectsParam,
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args): Promise<CallToolResult> => {
      const chartData = {
        type: "scatter" as const,
        title: args.title,
        datasets: args.datasets,
        options: args.options ?? {},
        theme: args.theme,
        palette: args.palette,
        typography: args.typography,
        effects: args.effects,
      };
      const summary = args.datasets
        .map((ds) => `${ds.label}: ${ds.data.length} points`)
        .join("; ");

      return await _buildChartResult(server, chartData, `${args.title} - ${summary}`);
    }
  );

  // -- Tool: render_candlestick_chart --
  registerAppTool(
    server,
    "render_candlestick_chart",
    {
      title: "Candlestick Chart",
      description:
        "Render an interactive candlestick or OHLC financial chart. Provide date/OHLC data for stock prices, crypto, forex, or any time-series financial data. Supports themes for styled visuals.",
      inputSchema: {
        title: z.string().describe("Chart title"),
        data: z.array(CandlestickPointSchema).describe("Array of {date, o, h, l, c} OHLC data points"),
        options: CandlestickOptions,
        theme: ThemeParam,
        palette: PaletteParam,
        typography: TypographyParam,
        effects: EffectsParam,
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args): Promise<CallToolResult> => {
      const chartData = {
        type: "candlestick" as const,
        title: args.title,
        data: args.data,
        options: args.options ?? {},
        theme: args.theme,
        palette: args.palette,
        typography: args.typography,
        effects: args.effects,
      };
      const first = args.data[0];
      const last = args.data[args.data.length - 1];
      const change = last ? ((last.c - first.o) / first.o * 100).toFixed(2) : "0";

      return await _buildChartResult(server, chartData, `${args.title}: ${args.data.length} bars, ${first?.date ?? "?"} to ${last?.date ?? "?"}, change: ${change}%`);
    }
  );

  // -- Tool: render_table --
  registerAppTool(
    server,
    "render_table",
    {
      title: "Data Table",
      description:
        "Render a sortable, interactive data table. Click column headers to sort. Supports themes for styled visuals.",
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
        theme: ThemeParam,
        palette: PaletteParam,
        typography: TypographyParam,
        effects: EffectsParam,
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args): Promise<CallToolResult> => {
      const chartData = {
        type: "table" as const,
        title: args.title,
        columns: args.columns,
        rows: args.rows,
        options: args.options ?? {},
        theme: args.theme,
        palette: args.palette,
        typography: args.typography,
        effects: args.effects,
      };

      return await _buildChartResult(server, chartData, `${args.title}: ${args.rows.length} rows, ${args.columns.length} columns`);
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
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args): Promise<CallToolResult> => {
      const chartData = {
        type: "auto" as const,
        title: args.title,
        data: args.data,
        options: args.options ?? {},
      };

      return await _buildChartResult(server, chartData, `Auto-visualizing: ${args.title}`);
    }
  );

  // -- Tool: render_from_url --
  registerAppTool(
    server,
    "render_from_url",
    {
      title: "Chart from URL",
      description:
        "Fetch JSON data from a URL and automatically visualize it. The server fetches the data, detects the best chart type, and renders it interactively.",
      inputSchema: {
        title: z.string().describe("Chart title"),
        url: z.string().url().describe("URL that returns JSON data"),
        options: z.object({
          preferredType: z.enum(["pie", "bar", "line", "scatter", "table"]).optional().describe(
            "Force a specific chart type instead of auto-detecting"
          ),
        }).optional(),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async (args): Promise<CallToolResult> => {
      try {
        // SSRF protection: reject private/loopback/link-local destinations
        // unless the hostname is in MCP_URL_ALLOWLIST.
        const safeUrl = await assertSafeUrl(args.url);
        // Throttle outbound calls per hostname.
        await acquireOutbound(safeUrl.hostname);
        const response = await fetch(safeUrl, {
          headers: { "Accept": "application/json", "User-Agent": "MCP-Dashboard/1.0" },
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
          return {
            content: [{ type: "text", text: `Failed to fetch ${args.url}: ${response.status} ${response.statusText}` }],
            isError: true,
          };
        }
        const data = await response.json();

        const chartData = {
          type: "auto" as const,
          title: args.title,
          data,
          options: args.options ?? {},
        };

        return await _buildChartResult(server, chartData, `Fetched and visualizing: ${args.title} (from ${args.url})`);
      } catch (err: any) {
        const msg = err instanceof UrlSafetyError
          ? err.message
          : `Error fetching ${args.url}: ${err.message}`;
        return {
          content: [{ type: "text", text: msg }],
          isError: true,
        };
      }
    }
  );

  // -- Tool: save_file --
  // Two-layer defense:
  //   1. _meta.ui.visibility=["app"] tells compliant MCP clients (Claude Code,
  //      Claude Desktop, etc.) to NOT surface this tool to the LLM. Only the
  //      View bundle running inside the chart iframe can invoke it via
  //      app.callServerTool() over the MCP Apps PostMessage transport.
  //   2. Extension allowlist (.png, .csv) is the server-side enforcement that
  //      runs regardless of client compliance, so even a buggy/malicious
  //      client cannot make us write arbitrary file types to ~/Downloads.
  //
  // The View only ever emits PNG (chart screenshots) and CSV (table data) -
  // see addPngExportButton / addCsvExportButton in src/charts/shared.ts.
  const SAVE_FILE_ALLOWED_EXTS = new Set([".png", ".csv"]);
  registerAppTool(
    server,
    "save_file",
    {
      title: "Save File",
      description: "Save a chart export (PNG or CSV) to the user's Downloads folder. App-only - invoked by the chart View's Download buttons, not by the AI.",
      inputSchema: {
        filename: z.string().describe("Filename with extension (.png or .csv only)"),
        data: z.string().describe("File contents: base64-encoded binary or plain text"),
        encoding: z.enum(["base64", "utf-8"]).describe("How data is encoded"),
      },
      _meta: {
        ui: {
          resourceUri: RESOURCE_URI,
          visibility: ["app"],
        },
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args: { filename: string; data: string; encoding: "base64" | "utf-8" }): Promise<CallToolResult> => {
      try {
        // Sanitize the filename - replace path separators and Windows-reserved chars
        // with hyphens rather than using path.basename (which would strip the title
        // down to only the trailing segment when a chart title happens to contain `/`
        // or `\`, e.g. "Cost / yr" becoming "yr.png").
        const INVALID = /[\\/:*?"<>|\x00-\x1f]/g;
        const extMatch = args.filename.match(/\.[A-Za-z0-9]{1,5}$/);
        const ext = (extMatch ? extMatch[0] : "").toLowerCase();

        // Server-side extension allowlist - defense even if a non-compliant
        // client surfaces this tool to the LLM despite the visibility hint.
        if (!SAVE_FILE_ALLOWED_EXTS.has(ext)) {
          return {
            content: [{
              type: "text",
              text: `Refusing to save: extension "${ext || "(none)"}" not in allowlist. Allowed: ${[...SAVE_FILE_ALLOWED_EXTS].join(", ")}`,
            }],
            isError: true,
          };
        }

        const base = ext ? args.filename.slice(0, -ext.length) : args.filename;
        let sanitized = (base.replace(INVALID, "-").trim() || "chart") + ext;
        // Cap to 200 chars to stay comfortably under the 255 byte NTFS limit.
        if (sanitized.length > 200) {
          sanitized = sanitized.slice(0, 200 - ext.length) + ext;
        }

        const downloadsDir = path.join(os.homedir(), "Downloads");
        await fs.mkdir(downloadsDir, { recursive: true });
        const filePath = path.join(downloadsDir, sanitized);

        // Defense in depth: confirm the resolved path stays inside Downloads.
        const resolved = path.resolve(filePath);
        const downloadsResolved = path.resolve(downloadsDir);
        if (path.dirname(resolved) !== downloadsResolved) {
          return {
            content: [{ type: "text", text: "Refusing to save: path escapes Downloads directory" }],
            isError: true,
          };
        }

        if (args.encoding === "base64") {
          await fs.writeFile(resolved, Buffer.from(args.data, "base64"));
        } else {
          await fs.writeFile(resolved, args.data, "utf-8");
        }

        return {
          content: [{ type: "text", text: `Saved to ${resolved}` }],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Failed to save: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // -- Tool: list_chart_files (model-visible) --
  // Lists chart preview HTML files currently on disk in the temp folder.
  // Returns name, ID, size (KB), and modified timestamp for each. Read-only.
  server.tool(
    "list_chart_files",
    "List all chart preview HTML files saved on disk (in the system temp folder). These are auto-generated each time a chart is rendered and auto-cleaned after 7 days (configurable via MCP_DASHBOARDS_RETAIN_DAYS env var). Returns file metadata (id, name, size, age). Use this to audit disk usage, then call delete_chart_files to remove specific files or all of them.",
    {},
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    async () => {
      try {
        const entries = await fs.readdir(TEMP_DIR).catch(() => [] as string[]);
        const files: Array<{
          id: string;
          name: string;
          sizeKB: number;
          modifiedAt: string;
        }> = [];

        for (const name of entries) {
          if (!CHART_FILENAME_RE.test(name)) continue;
          try {
            const stat = await fs.stat(path.join(TEMP_DIR, name));
            const id = name.replace(/^chart-/, "").replace(/\.html$/, "");
            files.push({
              id,
              name,
              sizeKB: Math.round(stat.size / 1024),
              modifiedAt: new Date(stat.mtimeMs).toISOString(),
            });
          } catch { /* skip locked / permission-denied */ }
        }

        // Sort newest first
        files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

        const retainDays = Number.parseInt(process.env.MCP_DASHBOARDS_RETAIN_DAYS ?? "7", 10);
        const summary = files.length === 0
          ? `No chart files in ${TEMP_DIR}`
          : `${files.length} chart file(s) in ${TEMP_DIR} (auto-cleanup at ${retainDays} days)`;

        const structured = { dir: TEMP_DIR, retainDays, files };
        return {
          content: [
            { type: "text", text: summary },
            { type: "text", text: JSON.stringify(structured) },
          ],
          structuredContent: structured,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Failed to list chart files: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // -- Tool: delete_chart_files (destructive) --
  // Manually deletes chart preview HTML files. User-initiated only (the AI calls
  // this when the user explicitly asks). Scope is hard-locked to the temp subfolder
  // and the chart-{hex}.html pattern - it cannot delete anything else.
  server.tool(
    "delete_chart_files",
    "Delete chart preview HTML files saved on disk (in the system temp folder). REQUIRES the user's explicit instruction to run - it deletes files from disk and cannot be undone. Provide at least one of: chartIds (specific file IDs to delete), olderThanDays (bulk delete by age), or all=true (delete every chart file). Scope is hard-locked to mcp-dashboards temp folder; cannot touch anything else. Returns lists of successfully deleted files and per-file failures (e.g. files currently locked by an open browser).",
    {
      chartIds: z.array(z.string()).optional().describe("Specific chart IDs to delete (12-char hex strings). Each must match /^[a-f0-9]{12}$/ or it is rejected."),
      olderThanDays: z.number().int().positive().optional().describe("Delete chart files older than N days (positive integer)."),
      all: z.boolean().optional().describe("Explicit confirmation to delete ALL chart files in the temp folder. Defaults to false."),
    },
    { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    async (args) => {
      const { chartIds, olderThanDays, all } = args;

      if (!chartIds?.length && olderThanDays === undefined && !all) {
        return {
          content: [{
            type: "text",
            text: "delete_chart_files requires at least one of: chartIds, olderThanDays, or all=true. Refusing to act on empty input.",
          }],
          isError: true,
        };
      }

      const deleted: Array<{ id: string; name: string }> = [];
      const failed: Array<{ id: string; name: string; reason: string }> = [];

      try {
        const entries = await fs.readdir(TEMP_DIR).catch(() => [] as string[]);
        const now = Date.now();
        const ageCutoff = olderThanDays !== undefined
          ? now - olderThanDays * 24 * 60 * 60 * 1000
          : null;
        const idSet = chartIds?.length ? new Set(chartIds.filter((id) => /^[a-f0-9]{12}$/.test(id))) : null;

        for (const name of entries) {
          if (!CHART_FILENAME_RE.test(name)) continue;
          const id = name.replace(/^chart-/, "").replace(/\.html$/, "");

          // Decide whether this file qualifies for deletion
          let qualifies = false;
          if (all) qualifies = true;
          if (!qualifies && idSet?.has(id)) qualifies = true;
          if (!qualifies && ageCutoff !== null) {
            try {
              const stat = await fs.stat(path.join(TEMP_DIR, name));
              if (stat.mtimeMs < ageCutoff) qualifies = true;
            } catch { /* fall through, treat as not qualifying */ }
          }
          if (!qualifies) continue;

          // Verify the resolved path stays inside TEMP_DIR (defense in depth)
          const full = path.join(TEMP_DIR, name);
          if (path.dirname(full) !== TEMP_DIR) {
            failed.push({ id, name, reason: "path escapes temp dir" });
            continue;
          }

          try {
            await fs.unlink(full);
            // Also evict from in-memory chart store so the localhost URL stops
            // resolving. Without this, the URL keeps serving the cached chart
            // even though the file is gone - confusing for users who deleted
            // the chart and expect the link to be dead.
            evictChartFromCache(id);
            deleted.push({ id, name });
          } catch (err: any) {
            failed.push({ id, name, reason: err.code || err.message || "unknown error" });
          }
        }

        const parts: string[] = [`Deleted ${deleted.length} chart file(s) from ${TEMP_DIR}`];
        if (failed.length) parts.push(`${failed.length} failed (locked or permission issues)`);

        const structured = { dir: TEMP_DIR, deleted, failed };
        return {
          content: [
            { type: "text", text: parts.join("; ") },
            { type: "text", text: JSON.stringify(structured) },
          ],
          structuredContent: structured,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Failed to delete chart files: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // -- New chart tools (Phase 2) --

  _registerChartTool(server, "render_bullet_chart", {
    title: "Bullet Chart",
    description: "Render bullet charts - 'Are we hitting target?' Horizontal bars with qualitative zones and a target marker. Supports 2-8 zones with optional labels and colors. Great for KPI vs target, seniority bands, maturity models.",
  }, {
    title: z.string().describe("Chart title"),
    data: z.array(z.object({
      label: z.string(),
      actual: z.number().describe("Current value"),
      target: z.number().describe("Target value"),
      zones: z.array(z.number()).min(2).max(8).optional().describe("Zone thresholds from low to high (2-8 values). Default: 3 equal zones"),
      unit: z.string().optional(),
      subtitle: z.string().optional().describe("Second line below label (e.g., '8.3 yrs')"),
      tooltip: z.string().optional().describe("Detail text shown on hover"),
    })).describe("Array of bullet items"),
    zoneLabels: z.array(z.string()).optional().describe("Labels for each zone band. Length should be zones+1 (e.g., 5 thresholds = 6 labels)"),
    zoneColors: z.array(z.string()).optional().describe("Custom colors per zone band. Defaults to red-to-green gradient"),
  }, (args) => ({
    type: "bullet",
    title: args.title,
    data: args.data,
    zoneLabels: args.zoneLabels,
    zoneColors: args.zoneColors,
  }), (args) => {
    const items = args.data as any[];
    return `${args.title}: ${items.map((d: any) => `${d.label} ${d.actual}/${d.target}`).join(", ")}`;
  });

  _registerChartTool(server, "render_lollipop_chart", {
    title: "Lollipop Chart",
    description: "Render a lollipop chart - 'How do segments compare?' Horizontal lines with dots at the value. Supports optional target markers for benchmarking. Clean alternative to bar charts for ranked data.",
  }, {
    title: z.string().describe("Chart title"),
    data: z.array(z.object({
      label: z.string(),
      value: z.number(),
      color: z.string().optional(),
      target: z.number().optional().describe("Target/benchmark value shown as a dashed marker"),
      tooltip: z.string().optional().describe("Detail text shown on hover"),
    })).describe("Array of {label, value} items"),
  }, (args) => ({
    type: "lollipop",
    title: args.title,
    data: args.data,
  }), (args) => {
    const items = args.data as any[];
    return `${args.title}: ${items.map((d: any) => `${d.label}: ${d.value}`).join(", ")}`;
  });

  _registerChartTool(server, "render_dumbbell_chart", {
    title: "Dumbbell Chart",
    description: "Render a dumbbell chart - 'How big is the gap?' Before/after dots connected by a bar. Supports scale labels and background zones for absolute positioning context.",
  }, {
    title: z.string().describe("Chart title"),
    data: z.array(z.object({
      label: z.string(),
      before: z.number(),
      after: z.number(),
      tooltip: z.string().optional().describe("Detail text shown on hover"),
    })).describe("Array of {label, before, after} items"),
    beforeLabel: z.string().optional().describe("Label for 'before' column (default: Before)"),
    afterLabel: z.string().optional().describe("Label for 'after' column (default: After)"),
    unit: z.string().optional().describe("Unit suffix"),
    scaleLabels: z.record(z.string(), z.string()).optional().describe("Labels at scale positions, e.g. {'40': 'Engineer', '65': 'Sr. Engineer'}"),
    zones: z.array(z.number()).min(2).max(8).optional().describe("Background zone thresholds (same as bullet chart zones)"),
    zoneColors: z.array(z.string()).optional().describe("Custom colors per zone band"),
    zoneLabels: z.array(z.string()).optional().describe("Labels for each zone band"),
  }, (args) => ({
    type: "dumbbell",
    title: args.title,
    data: args.data,
    beforeLabel: args.beforeLabel,
    afterLabel: args.afterLabel,
    unit: args.unit,
    scaleLabels: args.scaleLabels,
    zones: args.zones,
    zoneColors: args.zoneColors,
    zoneLabels: args.zoneLabels,
  }), (args) => {
    const items = args.data as any[];
    return `${args.title}: ${items.length} items comparing ${args.beforeLabel || "before"} vs ${args.afterLabel || "after"}`;
  });

  _registerChartTool(server, "render_variance_chart", {
    title: "Variance Chart",
    description: "Render a variance chart - 'Over or under budget?' Bars showing actual vs budget with color-coded over/under indicators.",
  }, {
    title: z.string().describe("Chart title"),
    data: z.array(z.object({
      label: z.string(),
      budget: z.number(),
      actual: z.number(),
    })).describe("Array of {label, budget, actual} items"),
    unit: z.string().optional().describe("Unit suffix (e.g. '$', 'k')"),
  }, (args) => ({
    type: "variance",
    title: args.title,
    data: args.data,
    unit: args.unit,
  }), (args) => {
    const items = args.data as any[];
    const over = items.filter((d: any) => d.actual > d.budget).length;
    return `${args.title}: ${items.length} items, ${over} over budget`;
  });

  _registerChartTool(server, "render_funnel_chart", {
    title: "Funnel Chart",
    description: "Render a funnel chart - 'Where do we lose people?' Width-proportional bars showing conversion stages with optional conversion percentages between stages.",
  }, {
    title: z.string().describe("Chart title"),
    data: z.array(z.object({
      label: z.string(),
      value: z.number(),
      color: z.string().optional(),
    })).describe("Array of funnel stages (top to bottom)"),
    showConversion: z.boolean().optional().describe("Show conversion % between stages (default: true)"),
  }, (args) => ({
    type: "funnel",
    title: args.title,
    data: args.data,
    showConversion: args.showConversion,
  }), (args) => {
    const items = args.data as any[];
    const first = items[0]?.value || 0;
    const last = items[items.length - 1]?.value || 0;
    const rate = first > 0 ? ((last / first) * 100).toFixed(1) : "0";
    return `${args.title}: ${items.length} stages, ${rate}% overall conversion`;
  });

  _registerChartTool(server, "render_slope_chart", {
    title: "Slope Chart",
    description: "Render a slope chart - 'How did rankings change?' SVG lines connecting two time periods showing relative position changes.",
  }, {
    title: z.string().describe("Chart title"),
    periodStart: z.string().describe("Label for start period (e.g. '2024')"),
    periodEnd: z.string().describe("Label for end period (e.g. '2025')"),
    data: z.array(z.object({
      label: z.string(),
      start: z.number(),
      end: z.number(),
      color: z.string().optional(),
    })).describe("Array of {label, start, end} items"),
  }, (args) => ({
    type: "slope",
    title: args.title,
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
    data: args.data,
  }), (args) => {
    const items = args.data as any[];
    return `${args.title}: ${items.length} series, ${args.periodStart} to ${args.periodEnd}`;
  });

  _registerChartTool(server, "render_waffle_chart", {
    title: "Waffle Chart",
    description: "Render a waffle chart - 'What is the composition?' 10x10 grid of colored squares showing proportional composition. Values should sum to 100.",
  }, {
    title: z.string().describe("Chart title"),
    data: z.array(z.object({
      label: z.string(),
      value: z.number().describe("Percentage (all values should sum to ~100)"),
      color: z.string().optional(),
    })).describe("Array of {label, value} composition items"),
  }, (args) => ({
    type: "waffle",
    title: args.title,
    data: args.data,
  }), (args) => {
    const items = args.data as any[];
    return `${args.title}: ${items.map((d: any) => `${d.label} ${d.value}%`).join(", ")}`;
  });

  _registerChartTool(server, "render_sparkline_chart", {
    title: "Sparkline Cards",
    description: "Standalone sparkline card grid. Prefer using KPI cards with sparkline[] inside render_dashboard instead for a cleaner integrated look.",
  }, {
    title: z.string().describe("Chart title"),
    data: z.array(z.object({
      label: z.string(),
      value: z.union([z.string(), z.number()]).describe("Current value"),
      change: z.string().optional().describe("Change text (e.g. '+12%', '-3.2%')"),
      sparkline: z.array(z.number()).describe("Array of values for the sparkline"),
      good: z.boolean().optional().describe("Is the trend good? (default: true)"),
    })).describe("Array of sparkline card items"),
  }, (args) => ({
    type: "sparkline",
    title: args.title,
    data: args.data,
  }), (args) => {
    const items = args.data as any[];
    return `${args.title}: ${items.map((d: any) => `${d.label}: ${d.value}`).join(", ")}`;
  });

  _registerChartTool(server, "render_radial_cluster", {
    title: "Radial Cluster",
    description: "Render a radial cluster - 'Multi-metric health check?' Multiple small ring gauges showing percentage metrics with status colors. Optional alert message.",
  }, {
    title: z.string().describe("Chart title"),
    metrics: z.array(z.object({
      label: z.string(),
      value: z.number().describe("Percentage 0-100"),
      status: z.enum(["good", "warn", "bad"]).optional().describe("Status color"),
    })).describe("Array of ring metrics"),
    alert: z.string().optional().describe("Alert message below rings"),
  }, (args) => ({
    type: "radial_cluster",
    title: args.title,
    metrics: args.metrics,
    alert: args.alert,
  }), (args) => {
    const metrics = args.metrics as any[];
    return `${args.title}: ${metrics.map((m: any) => `${m.label} ${m.value}%`).join(", ")}`;
  });

  _registerChartTool(server, "render_waterfall_chart", {
    title: "Waterfall Chart",
    description: "Render a waterfall chart - 'What drove the change?' Cascading bars showing how individual items add up or subtract to reach a total. Auto-infers add/sub/total if type omitted.",
  }, {
    title: z.string().describe("Chart title"),
    data: z.array(z.object({
      label: z.string(),
      value: z.number(),
      type: z.enum(["total", "add", "sub"]).optional().describe("Bar type (auto-inferred if omitted: first/last=total, positive=add, negative=sub)"),
    })).describe("Array of waterfall items"),
    unit: z.string().optional().describe("Unit suffix (e.g. '$', 'k')"),
  }, (args) => ({
    type: "waterfall",
    title: args.title,
    data: args.data,
    unit: args.unit,
  }), (args) => {
    const items = args.data as any[];
    return `${args.title}: ${items.length} items${args.unit ? ` (${args.unit})` : ""}`;
  });

  _registerChartTool(server, "render_heatmap_chart", {
    title: "Heatmap",
    description: "Render a heatmap - 'When are patterns strongest?' Color-coded grid of values across rows and columns. Supports color scales: default (blue-purple-orange), red-green, blue, heat.",
  }, {
    title: z.string().describe("Chart title"),
    rows: z.array(z.string()).describe("Row labels"),
    columns: z.array(z.string()).describe("Column labels"),
    values: z.array(z.array(z.number())).describe("2D array of values [row][column]"),
    colorScale: z.string().optional().describe("Color scale: default, red-green, blue, heat"),
  }, (args) => ({
    type: "heatmap",
    title: args.title,
    rows: args.rows,
    columns: args.columns,
    values: args.values,
    colorScale: args.colorScale,
  }), (args) => {
    const rows = args.rows as string[];
    const columns = args.columns as string[];
    return `${args.title}: ${rows.length} rows x ${columns.length} columns`;
  });

  _registerChartTool(server, "render_timeline_chart", {
    title: "Timeline",
    description: "Render a timeline - 'Where are we in the process?' Progress dots on a track with status colors (done, active, pending, blocked). Great for project milestones. Use horizontal for ≤8 items (better for slides), vertical for longer lists.",
  }, {
    title: z.string().describe("Chart title"),
    subtitle: z.string().optional().describe("Subtitle text"),
    milestones: z.array(z.object({
      label: z.string(),
      status: z.enum(["done", "active", "pending", "blocked"]).describe("Milestone status"),
      date: z.string().optional().describe("Date or time label"),
    })).describe("Array of milestone items"),
    orientation: z.enum(["vertical", "horizontal"]).optional().describe("Layout direction (default: vertical). Horizontal works best with ≤8 milestones."),
  }, (args) => ({
    type: "timeline",
    title: args.title,
    subtitle: args.subtitle,
    milestones: args.milestones,
    orientation: args.orientation,
  }), (args) => {
    const ms = args.milestones as any[];
    const done = ms.filter((m: any) => m.status === "done").length;
    return `${args.title}: ${done}/${ms.length} milestones done`;
  });

  _registerChartTool(server, "render_geo_chart", {
    title: "Geo Map",
    description: "Render a choropleth world map - 'Where is the value concentrated?' Color-coded countries by numeric value. Pass data as { countryCode: value } using ISO 3166-1 alpha-2 codes (US, DE, IN, GB, etc.).",
  }, {
    title: z.string().describe("Chart title"),
    data: z.record(z.string(), z.number()).describe("Country values as { alpha2Code: number }. e.g. { 'US': 100, 'DE': 50, 'IN': 75 }"),
    projection: z.enum(["naturalEarth1", "equalEarth", "mercator"]).optional().describe("Map projection. Default: naturalEarth1"),
    colorScale: z.string().optional().describe("Color scale: blue (default), green, red, heat, purple, orange"),
    showLegend: z.boolean().optional().describe("Show color scale legend. Default: true"),
    missingColor: z.string().optional().describe("Hex color for countries without data. Default: theme border color"),
  }, (args) => ({
    type: "geo",
    title: args.title,
    data: args.data,
    options: {
      projection: args.projection,
      colorScale: args.colorScale,
      showLegend: args.showLegend,
      missingColor: args.missingColor,
    },
  }), (args) => {
    const count = Object.keys(args.data as Record<string, number>).length;
    return `${args.title}: ${count} countries mapped`;
  });

  _registerChartTool(server, "render_bubble_map", {
    title: "Bubble Map",
    description: "Render a bubble/pin map - sized circles at geographic coordinates. Pass an array of { label, latitude, longitude, value } points. Great for showing city-level data, office locations, event density, etc.",
  }, {
    title: z.string().describe("Chart title"),
    data: z.array(z.object({
      label: z.string().describe("Point label (city name, office, etc.)"),
      latitude: z.number().describe("Latitude coordinate"),
      longitude: z.number().describe("Longitude coordinate"),
      value: z.number().describe("Numeric value controlling bubble size"),
    })).describe("Array of geographic data points"),
    projection: z.enum(["naturalEarth1", "equalEarth", "mercator"]).optional().describe("Map projection. Default: naturalEarth1"),
    sizeRange: z.tuple([z.number(), z.number()]).optional().describe("Min and max bubble radius in pixels. Default: [3, 25]"),
    bubbleColor: z.string().optional().describe("Bubble fill color. Default: theme accent"),
    showOutline: z.boolean().optional().describe("Show country outlines. Default: true"),
  }, (args) => ({
    type: "bubble_map",
    title: args.title,
    data: args.data,
    options: {
      projection: args.projection,
      sizeRange: args.sizeRange,
      bubbleColor: args.bubbleColor,
      showOutline: args.showOutline,
    },
  }), (args) => {
    return `${args.title}: ${(args.data as any[]).length} locations mapped`;
  });

  // -- Tool: poll_http (data proxy for live charts) --
  // Scans env vars for POLL_PRESET_<NAME>_URL patterns at registration time.
  const presets = new Map<string, { url: string; headers: Record<string, string> }>();
  for (const [key, val] of Object.entries(process.env)) {
    const m = key.match(/^POLL_PRESET_(.+)_URL$/);
    if (m && val) {
      const name = m[1].toLowerCase();
      let headers: Record<string, string> = {};
      const headersEnv = process.env[`POLL_PRESET_${m[1]}_HEADERS`];
      if (headersEnv) {
        try { headers = JSON.parse(headersEnv); } catch { /* skip malformed */ }
      }
      presets.set(name, { url: val, headers });
    }
  }

  const presetList = presets.size > 0
    ? `Available presets: ${[...presets.keys()].join(", ")}. `
    : "No presets configured. ";

  server.tool(
    "poll_http",
    `Fetch JSON from an HTTP endpoint. Used by render_live_chart to poll external APIs. ` +
    `${presetList}` +
    `Use "preset" for authenticated APIs (credentials stored server-side in env vars, never exposed). ` +
    `Use "url" only for public APIs that need no authentication. ` +
    `NEVER pass API keys or tokens in the "headers" argument - configure a preset instead.`,
    {
      preset: z.string().optional().describe(
        `Named preset that maps to a pre-configured URL + auth headers. ${presetList}` +
        `Configure via env vars: POLL_PRESET_<NAME>_URL and POLL_PRESET_<NAME>_HEADERS (JSON object).`
      ),
      url: z.string().url().optional().describe("Direct URL to fetch (public APIs only - no auth needed)"),
      headers: z.record(z.string(), z.string()).optional().describe("Extra HTTP headers (public APIs only - NEVER put API keys here)"),
      method: z.enum(["GET", "POST"]).optional().describe("HTTP method. Default: GET"),
      body: z.string().optional().describe("Request body for POST requests"),
    },
    { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    async (args) => {
      try {
        let fetchUrl: string;
        let fetchHeaders: Record<string, string> = {};

        if (args.preset) {
          const p = presets.get(args.preset.toLowerCase());
          if (!p) {
            return {
              content: [{ type: "text", text: `Unknown preset "${args.preset}". ${presetList}` }],
              isError: true,
            };
          }
          fetchUrl = p.url;
          fetchHeaders = { ...p.headers };
        } else if (args.url) {
          fetchUrl = args.url;
        } else {
          return {
            content: [{ type: "text", text: "Either 'preset' or 'url' is required." }],
            isError: true,
          };
        }

        // Merge extra headers (preset headers take priority for auth keys)
        if (args.headers) {
          fetchHeaders = { ...args.headers, ...fetchHeaders };
        }

        // SSRF protection: validate target before fetch. Presets are trusted
        // (operator-configured at env-var level), so they skip the check; raw
        // URLs from the AI go through the full guard.
        let safeUrl: URL;
        if (args.preset) {
          safeUrl = new URL(fetchUrl);
        } else {
          safeUrl = await assertSafeUrl(fetchUrl);
        }

        // Throttle outbound calls per hostname (covers both presets and raw).
        await acquireOutbound(safeUrl.hostname);

        const resp = await fetch(safeUrl, {
          method: args.method ?? "GET",
          headers: fetchHeaders,
          body: args.method === "POST" ? args.body : undefined,
        });

        if (!resp.ok) {
          return {
            content: [{ type: "text", text: `HTTP ${resp.status}: ${resp.statusText}` }],
            isError: true,
          };
        }

        const text = await resp.text();
        return { content: [{ type: "text", text }] };
      } catch (err: any) {
        const msg = err instanceof UrlSafetyError
          ? err.message
          : `poll_http failed: ${err.message}`;
        return {
          content: [{ type: "text", text: msg }],
          isError: true,
        };
      }
    }
  );

  return server;
}
