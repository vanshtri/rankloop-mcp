import { mock } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "../src/config.ts";
import { openDb } from "../src/db.ts";
import { createServer, type Ctx } from "../src/server.ts";

process.env.SEO_MCP_RETRY_BASE_MS = "0";

export const fakeToken = async (): Promise<string> => "test-token";

/** Isolated config + db in a temp dir. Env is only what you pass, never process.env. */
export function tempCtx(env: Record<string, string> = {}) {
  const home = mkdtempSync(join(tmpdir(), "seo-mcp-"));
  const config = loadConfig({ SEO_MCP_HOME: home, ...env });
  const db = openDb(home);
  return {
    config,
    db,
    token: fakeToken,
    cleanup: () => {
      db.close();
      rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
}

type Reply = { status?: number; body?: unknown };

/** Replace global fetch. handler gets the parsed URL and init; return status + JSON body (or a raw string). */
export function stubFetch(handler: (url: URL, init: RequestInit) => Reply) {
  return mock.method(globalThis, "fetch", async (input: string | URL | Request, init: RequestInit = {}) => {
    const { status = 200, body = {} } = handler(new URL(input instanceof Request ? input.url : String(input)), init);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  });
}

/** In-memory MCP client connected to a fresh server. Close it when done. */
export async function connect(ctx: Ctx): Promise<Client> {
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await createServer(ctx).connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  return client;
}

export function text(result: unknown): string {
  return ((result as CallToolResult).content[0] as { text: string }).text;
}
