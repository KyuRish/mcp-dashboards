import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = __filename.endsWith(".ts") ? path.join(__dirname, "dist") : __dirname;

const MAX_CHARTS = 50;
const TEMP_DIR = path.join(os.tmpdir(), "mcp-dashboards");

const chartStore = new Map<string, any>();
let cachedHtml: string | null = null;
let httpServer: http.Server | null = null;
let serverPort: number | null = null;

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

function storeChart(data: any): string {
  const id = crypto.randomBytes(6).toString("hex");
  chartStore.set(id, data);
  // Evict oldest if over limit
  if (chartStore.size > MAX_CHARTS) {
    const firstKey = chartStore.keys().next().value;
    if (firstKey) chartStore.delete(firstKey);
  }
  return id;
}

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
        res.writeHead(500);
        res.end(`Server error: ${err instanceof Error ? err.message : String(err)}`);
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

async function writeTempHtml(id: string, data: any): Promise<string> {
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

  try {
    const id = storeChart(data);
    const port = await ensurePreviewServer();
    const fileUrl = await writeTempHtml(id, data);
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

export function getPreviewServer(): http.Server | null {
  return httpServer;
}
