# MCP Dashboard

mcp-name: io.github.KyuRish/mcp-dashboard

**Turn your data into interactive dashboards inside any AI client.**

[![npm](https://img.shields.io/npm/v/mcp-dashboard)](https://www.npmjs.com/package/mcp-dashboard)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

The first MCP server that renders live, interactive Chart.js visualizations directly inside Claude Desktop, VS Code, and other MCP Apps-compatible clients. No browser needed - your charts appear right in the conversation.

## Features

- **Pie & Donut Charts** - key-value data with percentages, labels, hover tooltips
- **Bar Charts** - vertical/horizontal, stacked, multi-series support
- **Line & Area Charts** - smooth curves, gradient fills, time series
- **Sortable Data Tables** - click-to-sort columns, numeric alignment, striped rows
- **Full Dashboards** - KPI cards with trend indicators + multiple charts in a responsive grid
- **Auto-Detect from JSON** - pass any JSON and get the best visualization automatically
- **Auto Dark/Light Mode** - adapts to your system theme
- **Fully Self-Contained** - Chart.js bundled inline, zero external requests
- **Animated** - staggered card entrances, smooth hover effects, loading states

## Installation

### Claude Desktop

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "dashboard": {
      "command": "npx",
      "args": ["-y", "mcp-dashboard", "--stdio"]
    }
  }
}
```

### Claude Code (VS Code)

```bash
claude mcp add dashboard -- npx -y mcp-dashboard --stdio
```

### Remote (Streamable HTTP)

```bash
npx mcp-dashboard
# Server starts on http://localhost:3001/mcp
```

## Tools

### `render_pie_chart`

Render a pie or donut chart from label-value pairs.

```
"Show me a pie chart of browser market share:
Chrome 65%, Safari 18%, Firefox 8%, Edge 5%, Other 4%"
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| title | string | Yes | Chart title |
| data | [{label, value}] | Yes | Array of segments |
| options.donut | boolean | No | Hollow center (default: false) |
| options.showLegend | boolean | No | Show legend (default: true) |

### `render_bar_chart`

Render vertical or horizontal bar charts with multi-series support.

```
"Create a bar chart comparing Q1-Q4 revenue for 2024 vs 2025"
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| title | string | Yes | Chart title |
| labels | string[] | Yes | Category labels |
| datasets | [{label, data}] | Yes | Data series |
| options.horizontal | boolean | No | Horizontal bars (default: false) |
| options.stacked | boolean | No | Stack datasets (default: false) |

### `render_line_chart`

Render line or area charts with smooth curves and gradient fills.

```
"Plot my portfolio value over the last 12 months as a line chart"
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| title | string | Yes | Chart title |
| labels | string[] | Yes | X-axis labels |
| datasets | [{label, data}] | Yes | Data series |
| options.fill | boolean | No | Area fill (default: true) |
| options.smooth | boolean | No | Smooth curves (default: true) |
| options.showPoints | boolean | No | Show data points (default: false) |

### `render_dashboard`

Render a full dashboard with KPI cards and multiple charts.

```
"Create a sales dashboard with total revenue, growth rate, and customer count as KPIs,
plus a line chart of monthly revenue and a pie chart of revenue by region"
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| title | string | Yes | Dashboard title |
| kpis | [{label, value, change?, prefix?, suffix?}] | No | KPI metric cards |
| charts | [{type, title?, ...chartConfig}] | Yes | Charts to display |

**KPI fields:**
- `label` - metric name
- `value` - the number or text
- `change` - percentage change (positive = green arrow up, negative = red arrow down)
- `prefix` - e.g. "$", "Rs."
- `suffix` - e.g. "%", " users"

### `render_table`

Render a sortable, interactive data table. Click column headers to sort.

```
"Show me a table of the top 10 countries by GDP"
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| title | string | Yes | Table title |
| columns | string[] | Yes | Column names in display order |
| rows | [{key: value}] | Yes | Array of row objects |
| options.sortable | boolean | No | Enable sorting (default: true) |
| options.striped | boolean | No | Alternating row colors (default: false) |

### `render_from_json`

Pass any JSON data and get the best visualization automatically.

```
"Visualize this JSON data: [{"month": "Jan", "sales": 1200}, ...]"
```

**Auto-detection rules:**
- `[{name, value}]` (1 string + 1 number key) - Pie chart
- `[{category, sales, profit}]` (1 string + N number keys) - Grouped bar chart
- `[{date, price}]` (date-like key + number keys) - Line chart
- `{key: number}` (flat object with numeric values) - Pie chart
- `[1, 2, 3]` (array of numbers) - Bar chart
- Complex objects with 3+ keys - Sortable table
- Unrecognizable - Raw JSON display

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| title | string | Yes | Chart title |
| data | any | Yes | Any JSON data |
| options.preferredType | string | No | Force: "pie", "bar", "line", or "table" |

## Development

```bash
git clone https://github.com/KyuRish/mcp-dashboard.git
cd mcp-dashboard
npm install
npm run build
npm run serve
```

### Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Build UI + server |
| `npm run build:ui` | Bundle HTML with Vite |
| `npm run build:server` | Compile TypeScript server |
| `npm run serve` | Start HTTP server on port 3001 |
| `npm start` | Build + serve |

## How It Works

This server uses [MCP Apps](https://modelcontextprotocol.io/docs/extensions/apps) (SEP-1865) to return interactive HTML that renders inside AI clients as sandboxed iframes.

1. You ask the AI to visualize data
2. AI calls the appropriate MCP tool with your data
3. Server generates structured content + links to a bundled HTML resource
4. Client renders the HTML as an interactive widget inline in the conversation
5. Chart.js handles rendering, tooltips, hover effects - all inside the iframe

The entire UI (Chart.js + CSS + JS) is bundled into a single self-contained HTML file using Vite + vite-plugin-singlefile. No CDN, no external requests.

## Requirements

- Node.js 18+
- An MCP Apps-compatible client (Claude Desktop, VS Code, Goose, etc.)

## License

MIT
