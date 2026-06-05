import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = __filename.endsWith(".ts") ? path.join(__dirname, "dist") : __dirname;

export const TEMP_DIR = path.join(os.tmpdir(), "mcp-dashboards");
export const CHART_FILENAME_RE = /^chart-[a-f0-9]{12}\.html$/;
const MAX_CHARTS_IN_MEMORY = 50;
const DEFAULT_RETAIN_DAYS = 7;

const chartStore = new Map<string, any>();
let cachedHtml: string | null = null;
let httpServer: http.Server | null = null;
let serverPort: number | null = null;
let cleanupDone = false;

async function loadHtml(): Promise<string> {
  if (cachedHtml) return cachedHtml;
  const htmlPath = path.join(DIST_DIR, "mcp-app.html");
  cachedHtml = await fs.readFile(htmlPath, "utf-8");
  return cachedHtml;
}

function injectChartData(html: string, data: any): string {
  const payload = JSON.stringify(data).replace(/<\//g, "<\\/");
  return html.replace(
    "</head>",
    `<script>window.__CHART_DATA__=${payload};</script></head>`,
  );
}

function getRetainDays(): number {
  const raw = process.env.MCP_DASHBOARDS_RETAIN_DAYS;
  if (raw === undefined) return DEFAULT_RETAIN_DAYS;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return DEFAULT_RETAIN_DAYS;
  return n;
}

function storeChart(data: any): string {
  const id = crypto.randomBytes(6).toString("hex");
  chartStore.set(id, data);
  // Evict oldest from in-memory store if over limit (does NOT touch disk files)
  if (chartStore.size > MAX_CHARTS_IN_MEMORY) {
    const firstKey = chartStore.keys().next().value;
    if (firstKey) chartStore.delete(firstKey);
  }
  return id;
}

// Remove a chart from the in-memory store so its localhost URL no longer
// resolves. Called by the delete_chart_files tool to ensure "delete" means
// "gone from both disk and memory" - otherwise the localhost URL would keep
// working from cache and confuse the user.
export function evictChartFromCache(id: string): boolean {
  return chartStore.delete(id);
}

// Lazy age-based cleanup. Runs once per server lifetime on first preview
// request. Only touches files in our own temp subfolder matching the strict
// chart-{hex}.html pattern. Anything else (including unrelated files a user
// might park in /tmp/mcp-dashboards) is left alone.
async function cleanStaleFiles(): Promise<void> {
  if (cleanupDone) return;
  cleanupDone = true;

  const retainDays = getRetainDays();
  if (retainDays === 0) return;

  try {
    const entries = await fs.readdir(TEMP_DIR).catch(() => [] as string[]);
    const cutoff = Date.now() - retainDays * 24 * 60 * 60 * 1000;
    await Promise.all(entries.map(async (name) => {
      if (!CHART_FILENAME_RE.test(name)) return;
      const full = path.join(TEMP_DIR, name);
      try {
        const stat = await fs.stat(full);
        if (stat.mtimeMs < cutoff) {
          await fs.unlink(full);
        }
      } catch { /* locked file, permission error, etc - skip */ }
    }));
  } catch (err) {
    process.stderr.write(
      `[mcp-dashboards] Cleanup skipped: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}

// Lazy-init a tiny same-machine HTTP server on a random port. Its only job is
// to serve the in-memory chart HTML so Claude Code can render a clickable link
// (http:// is the only URL scheme that survives Claude Code's react-markdown
// link stripping - file://, vscode://, command:// are all stripped).
async function ensurePreviewServer(): Promise<number> {
  if (serverPort !== null) return serverPort;

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        if (!req.url) {
          res.writeHead(404);
          res.end("Not Found");
          return;
        }

        const match = req.url.match(/^\/chart\/([a-f0-9]+)/);
        if (!match) {
          res.writeHead(404);
          res.end("Not Found");
          return;
        }

        const data = chartStore.get(match[1]);
        if (!data) {
          res.writeHead(404, { "Content-Type": "text/html" });
          res.end("<h1>Chart not found</h1><p>It may have been evicted or never existed.</p>");
          return;
        }

        const html = await loadHtml();
        const injected = injectChartData(html, data);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(injected);
      } catch (err) {
        // Log full error server-side for debugging, return generic message to the
        // client. Even though we bind to 127.0.0.1, err.message can leak absolute
        // filesystem paths and other internal details to anything that can reach
        // the loopback (e.g. browser JS in the same machine).
        process.stderr.write(
          `[mcp-dashboards] preview-server error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
        );
        res.writeHead(500);
        res.end("Internal server error");
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (typeof addr === "object" && addr) {
        serverPort = addr.port;
        httpServer = server;
        process.stderr.write(`[mcp-dashboards] Preview server ready at http://localhost:${serverPort}\n`);
        process.on("exit", () => server.close());
        resolve(serverPort);
      } else {
        reject(new Error("Failed to bind preview server"));
      }
    });

    server.on("error", reject);
  });
}

async function writeChartHtml(id: string, data: any): Promise<string> {
  await fs.mkdir(TEMP_DIR, { recursive: true });
  const filePath = path.join(TEMP_DIR, `chart-${id}.html`);
  const html = await loadHtml();
  const injected = injectChartData(html, data);
  await fs.writeFile(filePath, injected, "utf-8");
  return pathToFileURL(filePath).href;
}

export interface PreviewUrls {
  httpUrl: string;
  fileUrl: string;
}

export async function getPreviewUrls(data: any): Promise<PreviewUrls | null> {
  if (process.env.MCP_DASHBOARDS_DISABLE_PREVIEW === "1") return null;

  cleanStaleFiles().catch(() => { /* swallowed internally */ });

  try {
    const id = storeChart(data);
    const port = await ensurePreviewServer();
    const fileUrl = await writeChartHtml(id, data);
    return {
      httpUrl: `http://localhost:${port}/chart/${id}`,
      fileUrl,
    };
  } catch (err) {
    process.stderr.write(
      `[mcp-dashboards] Preview unavailable: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return null;
  }
}
