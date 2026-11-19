import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "./config.ts";
import { hasWriteScopes } from "./google/auth.ts";

// Errors: tool handlers just throw. The MCP SDK returns { isError: true, content: [message] }.

export function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function dry(action: string, payload: unknown): CallToolResult {
  return ok({ dryRun: true, action, payload, note: "Nothing changed. Call again with dryRun: false to apply." });
}

export function need<T>(value: T | undefined, name: string): T {
  if (value === undefined || value === "") throw new Error(`${name} is required for this action.`);
  return value;
}

export function requireWrites(config: Config): void {
  if (!config.allowWrites) {
    throw new Error("Writes are disabled. Fix: set RANKLOOP_MCP_ALLOW_WRITES=true in this MCP server's env.");
  }
  if (!hasWriteScopes(config)) {
    throw new Error("Your Google token has read-only scopes. Fix: with RANKLOOP_MCP_ALLOW_WRITES=true set, re-run `npx rankloop-mcp auth`.");
  }
}
