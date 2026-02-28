# MCP Dashboard

mcp-name: io.github.KyuRish/mcp-dashboard

**Turn your data into interactive dashboards inside any AI client.**

[![npm](https://img.shields.io/npm/v/mcp-dashboards)](https://www.npmjs.com/package/mcp-dashboards)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buy-me-a-coffee&logoColor=white)](https://buymeacoffee.com/kyuish)

Renders live, interactive Chart.js visualizations directly inside Claude Desktop, VS Code, and other MCP Apps-compatible clients. No browser needed - charts appear right in the conversation.

## What It Does

- **22 chart tools** - pie, bar, line, scatter, candlestick, bullet, lollipop, dumbbell, heatmap, and more
- **Full dashboards** - KPI cards + masonry-packed multi-chart grids in a single tool call
- **Interactive** - click any data point, it gets selected. Click "Ask" to send selections back to Claude for follow-up
- **20 themes** - dark, light, neon, forest, ocean, matrix - with mix-and-match palette/typography/effects
- **Export** - PNG screenshots and CSV data export from any chart
- **Auto-detect** - pass any JSON or URL and get the best visualization automatically
- **Self-contained** - Chart.js bundled via Vite into a single HTML file. Zero CDN, zero external requests

## Quick Start

### Claude Desktop

Add to your `claude_desktop_config.json`:

- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "dashboard": {
      "command": "npx",
      "args": ["-y", "mcp-dashboards", "--stdio"]
    }
  }
}
```

### Claude Code (VS Code)

```bash
claude mcp add dashboard -- npx -y mcp-dashboards --stdio
```

### Remote (Streamable HTTP)

```bash
npx mcp-dashboards
# Server starts on http://localhost:3001/mcp
```

## All Tools

| Tool | Type | Best For |
|------|------|----------|
| `render_pie_chart` | Pie/Donut | Composition - "what makes up the whole?" |
| `render_bar_chart` | Bar | Comparison - vertical, horizontal, stacked, multi-series |
| `render_line_chart` | Line/Area | Trends - smooth curves, gradient fills, time series |
| `render_scatter_chart` | Scatter | Relationships - per-point labels, reference lines, quadrants |
| `render_candlestick_chart` | Candlestick | Finance - OHLC data with volume bars |
| `render_bullet_chart` | Bullet | KPI vs target - 2-8 zone bands with labels (seniority, maturity) |
| `render_lollipop_chart` | Lollipop | Ranking - clean dots with optional target markers |
| `render_dumbbell_chart` | Dumbbell | Gaps - before/after with scale labels and zone bands |
| `render_variance_chart` | Variance | Budget - actual vs budget, color-coded over/under |
| `render_funnel_chart` | Funnel | Conversion - staged drop-off with percentages |
| `render_slope_chart` | Slope | Change - ranking shifts between two periods |
| `render_waffle_chart` | Waffle | Proportion - 10x10 grid showing composition |
| `render_sparkline_chart` | Sparkline | Compact trends - mini cards with change indicators |
| `render_radial_cluster` | Radial | Health check - multi-metric ring gauges with status |
| `render_waterfall_chart` | Waterfall | Cumulative - cascading bars showing impact |
| `render_heatmap_chart` | Heatmap | Intensity - 2D grid with color mapping |
| `render_timeline_chart` | Timeline | Progress - milestone tracker with status indicators |
| `render_hero_metric` | Hero | KPI widgets - 11 variants (progress ring, gem, orb, NPS, etc.) |
| `render_dashboard` | Dashboard | Everything - KPI cards + multiple charts in responsive grid |
| `render_table` | Table | Data - sortable columns, striped rows, CSV export |
| `render_from_json` | Auto-detect | Any JSON data - picks the best chart automatically |
| `render_from_url` | URL fetch | Fetches JSON from a URL and auto-visualizes |

## When to Use Which Chart

| Question | Best Chart | Also Works |
|----------|-----------|------------|
| "What makes up the whole?" | Pie/Waffle | Stacked bar |
| "How do values compare?" | Bar | Lollipop, Bullet |
| "What's the trend over time?" | Line | Sparkline, Slope |
| "Are we hitting targets?" | Bullet | Variance, Radial |
| "Where's the gap?" | Dumbbell | Variance |
| "How does X relate to Y?" | Scatter | Heatmap |
| "What's the conversion rate?" | Funnel | Waterfall |
| "What changed between periods?" | Slope | Dumbbell |
| "What's the financial picture?" | Candlestick | Line |
| "Show me the KPI" | Hero metric | Dashboard |

## Themes

20 built-in themes. Pass `theme` to any tool.

**Classic:** `boardroom`, `corporate`, `sales-floor`, `golden-treasury`, `clinical`, `startup`, `ops-control`, `tokyo-midnight`, `zen-garden`, `consultant`

**Black/AI:** `black-tron` (cyan neon), `black-elegance` (warm gold), `black-matrix` (green hacker)

**Forest:** `forest-amber` (autumn warmth), `forest-earth` (terracotta)

**Sky:** `sky-light` (airy blue), `sky-ocean` (deep navy), `sky-twilight` (sunset gradient)

**Gray/ML:** `gray-hf` (Hugging Face yellow), `gray-copilot` (GitHub dark + teal)

Mix-and-match with `palette`, `typography` (system, mono, professional, editorial, bold, techno, cyberpunk, luxury), and `effects` (none, subtle, shimmer, neon, energetic).

## Interactive Features

- **Click to select** - click any bar, slice, point, or row. A badge animates and the item appears in the selection tray.
- **Ask Claude** - accumulated selections can be sent back to Claude via the "Ask" button for follow-up analysis.
- **PNG export** - screenshot any chart or dashboard to your Downloads folder.
- **CSV export** - export table data as CSV files.
- **Refresh** - re-run the same tool call to update data.

## How It Works

Uses [MCP Apps](https://modelcontextprotocol.io/docs/extensions/apps) to return interactive HTML rendered inside AI clients as sandboxed iframes.

1. You ask the AI to visualize data
2. AI calls the appropriate MCP tool with your data
3. Server returns structured content linked to a bundled HTML resource
4. Client renders interactive Chart.js visualizations inline in the conversation

The entire UI (Chart.js + CSS + JS) is bundled into a single self-contained HTML file using Vite. No CDN, no external requests.

## Development

```bash
git clone https://github.com/KyuRish/mcp-dashboards.git
cd mcp-dashboards
npm install
npm run build
npm run serve
```

| Script | Description |
|--------|-------------|
| `npm run build` | Build UI + server |
| `npm run build:ui` | Bundle HTML with Vite |
| `npm run build:server` | Compile TypeScript server |
| `npm run serve` | Start HTTP server on port 3001 |
| `npm start` | Build + serve |
| `npm run dev` | Watch mode (UI + server) |

## Requirements

- Node.js 18+
- An MCP Apps-compatible client (Claude Desktop, VS Code, Goose, etc.)

## Support

If this project is useful to you, consider supporting development:

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buy-me-a-coffee&logoColor=white)](https://buymeacoffee.com/kyuish)

## License

MIT
