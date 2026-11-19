import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "./config.ts";
import type { TokenSource } from "./google/auth.ts";
import { registerGoogleTools } from "./tools/google.ts";
import { registerSetupTools } from "./tools/setup.ts";

// ../package.json resolves to the package root from both src/ and dist/.
const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

export type Ctx = { config: Config; db: DatabaseSync; token: TokenSource };

export function createServer(ctx: Ctx): McpServer {
  const server = new McpServer({ name: "seo-mcp", version });
  registerSetupTools(server, ctx);
  registerGoogleTools(server, ctx);
  return server;
}
