import { mock } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.ts";
import { openDb } from "../src/db.ts";

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
