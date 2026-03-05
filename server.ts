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
const ThemeParam = z.string().optional().describe("Theme preset: boardroom, corporate, sales-floor, golden-treasury, clinical, startup, ops-control, tokyo-midnight, zen-garden, consultant, black-tron, black-elegance, black-matrix, forest-amber, forest-earth, sky-light, sky-ocean, sky-twilight, gray-hf, gray-copilot");
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
    },
    async (args: Record<string, any>): Promise<CallToolResult> => {
      const chartData = {
        ...buildResult(args),
        theme: args.theme,
        palette: args.palette,
        typography: args.typography,
        effects: args.effects,
      };
      return {
        content: [
          { type: "text", text: summarize(args) },
          { type: "text", text: JSON.stringify(chartData) },
        ],
        structuredContent: chartData,
      };
    },
  );
}

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

      return {
        content: [
          { type: "text", text: `${args.title} - ${summary}` },
          { type: "text", text: JSON.stringify(chartData) },
        ],
        structuredContent: chartData,
      };
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
    },
    async (args): Promise<CallToolResult> => {
      const chartData = {
        type: "hero_metric" as const,
        ...args,
      };

      const variant = args.variant || "big_number";
      const summary = `${args.title}: [${variant}] ${args.value ?? ""}${args.unit ? " " + args.unit : ""}`;

      return {
        content: [
          { type: "text", text: summary },
          { type: "text", text: JSON.stringify(chartData) },
        ],
        structuredContent: chartData,
      };
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
        "Render a full dashboard with KPI cards, charts, and optional hero metric in a responsive grid. Available themes: boardroom (investors, board decks), corporate (enterprise daily use), sales-floor (quota tracking, leaderboards), golden-treasury (wealth, luxury real estate), clinical (healthcare, compliance - WCAG AAA), startup (SaaS metrics, YC demos), ops-control (DevOps, manufacturing), tokyo-midnight (crypto, trading, gaming), zen-garden (wellness, sustainability), consultant (agency deliverables, presentations). Mix-and-match: set palette + typography + effects independently.",
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

      return {
        content: [
          { type: "text", text: parts.join(" | ") },
          { type: "text", text: JSON.stringify(chartData) },
        ],
        structuredContent: chartData,
      };
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

      return {
        content: [
          { type: "text", text: `${args.title} - ${summary}` },
          { type: "text", text: JSON.stringify(chartData) },
        ],
        structuredContent: chartData,
      };
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

      return {
        content: [
          { type: "text", text: `${args.title}: ${args.data.length} bars, ${first?.date ?? "?"} to ${last?.date ?? "?"}, change: ${change}%` },
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
    },
    async (args): Promise<CallToolResult> => {
      try {
        const response = await fetch(args.url, {
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

        return {
          content: [
            { type: "text", text: `Fetched and visualizing: ${args.title} (from ${args.url})` },
            { type: "text", text: JSON.stringify(chartData) },
          ],
          structuredContent: chartData,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error fetching ${args.url}: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // -- Tool: save_file (app-only, invisible to AI model) --
  // Used by the UI to save exports since iframe sandbox blocks direct downloads.
  server.tool(
    "save_file",
    "Save a file to the user's Downloads folder. Used internally by the dashboard UI for PNG/CSV export.",
    {
      filename: z.string().describe("Filename with extension (e.g. chart.png)"),
      data: z.string().describe("File contents: base64-encoded binary or plain text"),
      encoding: z.enum(["base64", "utf-8"]).describe("How data is encoded"),
    },
    async (args) => {
      try {
        const sanitized = path.basename(args.filename);
        const downloadsDir = path.join(os.homedir(), "Downloads");
        // Ensure Downloads folder exists
        await fs.mkdir(downloadsDir, { recursive: true });
        const filePath = path.join(downloadsDir, sanitized);

        if (args.encoding === "base64") {
          await fs.writeFile(filePath, Buffer.from(args.data, "base64"));
        } else {
          await fs.writeFile(filePath, args.data, "utf-8");
        }

        return {
          content: [{ type: "text", text: `Saved to ${filePath}` }],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Failed to save: ${err.message}` }],
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

        const resp = await fetch(fetchUrl, {
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
        return {
          content: [{ type: "text", text: `poll_http failed: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}
