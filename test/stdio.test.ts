import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("the CLI serves MCP over stdio", async () => {
  const home = mkdtempSync(join(tmpdir(), "seo-mcp-"));
  const client = new Client({ name: "test", version: "0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["src/index.ts"],
      env: { ...(process.env as Record<string, string>), SEO_MCP_HOME: home },
    }),
  );
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 7);
  } finally {
    await client.close();
    rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
