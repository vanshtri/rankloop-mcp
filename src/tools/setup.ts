import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { authMode, grantedScopes, hasWriteScopes } from "../google/auth.ts";
import * as ga4 from "../google/ga4.ts";
import * as gsc from "../google/gsc.ts";
import { ok } from "../result.ts";
import type { Ctx } from "../server.ts";

export async function setupReport(ctx: Ctx): Promise<Record<string, unknown>> {
  const mode = authMode(ctx.config);
  const report: Record<string, unknown> = {
    auth: mode,
    scopes: grantedScopes(ctx.config),
    writesEnabled: ctx.config.allowWrites,
    writeScopesGranted: hasWriteScopes(ctx.config),
    optional: { PAGESPEED_API_KEY: Boolean(ctx.config.pagespeedKey) },
  };
  if (mode === "none") {
    report.next = "Run `npx rankloop-mcp auth` (OAuth) or set GOOGLE_APPLICATION_CREDENTIALS (service account).";
    return report;
  }
  report.searchConsoleSites = await gsc.listSites(ctx.token).catch((e: Error) => ({ error: e.message }));
  report.ga4Properties = await ga4.listProperties(ctx.token).catch((e: Error) => ({ error: e.message }));
  return report;
}

export function registerSetupTools(server: McpServer, ctx: Ctx): void {
  server.registerTool(
    "setup_check",
    {
      description:
        "Run this first. Shows which Google credentials work, granted scopes, whether writes are enabled, and lists the Search Console sites and GA4 properties this server can access.",
    },
    async () => ok(await setupReport(ctx)),
  );
}
