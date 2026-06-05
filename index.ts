#!/usr/bin/env node

/**
 * Entry point for the MCP Dashboards server.
 * Run with: npx mcp-dashboards
 * Or: node dist/index.js [--stdio]
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Request, Response } from "express";
import { createServer } from "./server.js";

async function startStreamableHTTPServer(
  factory: () => McpServer
): Promise<void> {
  const port = parseInt(process.env.PORT ?? "3001", 10);

  const express = await import("express");
  const cors = await import("cors");

  const app = express.default();

  // CORS: default to localhost-only to prevent drive-by attacks from any
  // webpage the user happens to visit (a malicious site could otherwise POST
  // to http://localhost:3001/mcp and invoke our tools - save_file etc.).
  // Override with MCP_CORS_ALLOWED_ORIGINS=https://your-host.com,... for
  // legitimate browser-based access from non-localhost origins.
  const defaultOrigins = [
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
  ];
  const envOrigins = (process.env.MCP_CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowedOrigins = envOrigins.length > 0 ? envOrigins : defaultOrigins;

  if (envOrigins.includes("*")) {
    console.warn(
      "[mcp-dashboards] WARNING: MCP_CORS_ALLOWED_ORIGINS contains '*' - allowing any origin. This is a serious security risk; only use for trusted environments.",
    );
  }

  app.use(cors.default({
    origin: (origin, cb) => {
      // Same-origin requests / curl / non-browser callers have no Origin header
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      cb(null, false);
    },
    credentials: false,
    methods: ["GET", "POST", "OPTIONS"],
  }));
  app.use(express.default.json());

  app.all("/mcp", async (req: Request, res: Response) => {
    const server = factory();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  // Default-bind to 127.0.0.1 so LAN attackers can't reach port 3001 directly
  // and bypass the CORS allowlist (cors only triggers when an Origin header is
  // sent; a raw curl from another machine has no Origin and would otherwise
  // be waved through). Override with MCP_HTTP_BIND_HOST=0.0.0.0 (or any
  // interface) for trusted deployment scenarios.
  const bindHost = process.env.MCP_HTTP_BIND_HOST || "127.0.0.1";
  const httpServer = app.listen(port, bindHost, () => {
    console.log(`MCP Dashboards server listening on http://${bindHost}:${port}/mcp`);
  });

  const shutdown = () => {
    console.log("\nShutting down...");
    httpServer.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function startStdioServer(factory: () => McpServer): Promise<void> {
  await factory().connect(new StdioServerTransport());
}

async function main() {
  if (process.argv.includes("--stdio")) {
    await startStdioServer(createServer);
  } else {
    await startStreamableHTTPServer(createServer);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
