import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as ga4 from "../google/ga4.ts";
import * as gsc from "../google/gsc.ts";
import { pagespeed } from "../google/pagespeed.ts";
import { dry, need, ok, requireWrites } from "../result.ts";
import type { Ctx } from "../server.ts";

const dateArg = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const siteUrlArg = z.string().describe("Search Console property: sc-domain:example.com or https://example.com/");
const propertyArg = z.string().describe("GA4 property ID: 123456789 or properties/123456789");
const dryRunArg = z.boolean().default(true).describe("true = show what would change; false = apply");

export function registerGoogleTools(server: McpServer, ctx: Ctx): void {
  server.registerTool(
    "gsc_query",
    {
      description:
        "Search Console performance (clicks, impressions, CTR, average position). Default range: the last 28 days of complete data. Page through big results with startRow.",
      inputSchema: {
        siteUrl: siteUrlArg,
        startDate: dateArg.optional(),
        endDate: dateArg.optional(),
        dimensions: z.array(z.enum(["query", "page", "country", "device", "date", "searchAppearance"])).default(["query"]),
        filters: z
          .array(
            z.object({
              dimension: z.enum(["query", "page", "country", "device", "searchAppearance"]),
              operator: z.enum(["equals", "notEquals", "contains", "notContains", "includingRegex", "excludingRegex"]),
              expression: z.string(),
            }),
          )
          .optional(),
        type: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
        rowLimit: z.number().int().min(1).max(25000).default(1000),
        startRow: z.number().int().min(0).default(0),
        dataState: z.enum(["final", "all"]).default("final"),
      },
    },
    async ({ siteUrl, startDate, endDate, ...q }) => {
      const range = gsc.defaultRange();
      return ok(
        await gsc.searchAnalytics(ctx.token, siteUrl, { startDate: startDate ?? range.startDate, endDate: endDate ?? range.endDate, ...q }),
      );
    },
  );

  server.registerTool(
    "gsc_inspect_url",
    {
      description:
        "Google's index status for one URL: verdict, coverage state, Google-chosen vs user canonical, last crawl, robots, rich results. Limit 2,000 calls/day per property (tracked locally).",
      inputSchema: { siteUrl: siteUrlArg, url: z.url(), languageCode: z.string().default("en-US") },
    },
    async ({ siteUrl, url, languageCode }) => ok(await gsc.inspectUrl(ctx.token, ctx.db, siteUrl, url, languageCode)),
  );

  server.registerTool(
    "gsc_sitemaps",
    {
      description: "List, submit or delete sitemaps for a Search Console property. submit/delete need SEO_MCP_ALLOW_WRITES=true.",
      inputSchema: {
        siteUrl: siteUrlArg,
        action: z.enum(["list", "submit", "delete"]).default("list"),
        feedpath: z.url().optional().describe("Full sitemap URL; required for submit and delete"),
        dryRun: dryRunArg,
      },
    },
    async ({ siteUrl, action, feedpath, dryRun }) => {
      if (action === "list") return ok(await gsc.listSitemaps(ctx.token, siteUrl));
      requireWrites(ctx.config);
      const path = need(feedpath, "feedpath");
      if (dryRun) return dry(action, { siteUrl, feedpath: path });
      return ok(action === "submit" ? await gsc.submitSitemap(ctx.token, siteUrl, path) : await gsc.deleteSitemap(ctx.token, siteUrl, path));
    },
  );

  server.registerTool(
    "ga4_report",
    {
      description:
        "GA4 data. mode=report: dimensions/metrics over a date range. mode=realtime: last 30 minutes (use metrics like activeUsers). mode=metadata: every valid dimension and metric name for this property.",
      inputSchema: {
        propertyId: propertyArg,
        mode: z.enum(["report", "realtime", "metadata"]).default("report"),
        startDate: z.string().default("28daysAgo").describe("YYYY-MM-DD, NdaysAgo, yesterday or today"),
        endDate: z.string().default("yesterday"),
        dimensions: z.array(z.string()).default([]).describe("e.g. landingPage, sessionDefaultChannelGroup, date"),
        metrics: z.array(z.string()).default(["sessions"]).describe("e.g. sessions, engagedSessions, keyEvents, totalUsers"),
        dimensionFilter: z.record(z.string(), z.unknown()).optional().describe("GA4 FilterExpression JSON"),
        metricFilter: z.record(z.string(), z.unknown()).optional().describe("GA4 FilterExpression JSON"),
        orderBys: z.array(z.record(z.string(), z.unknown())).optional().describe("GA4 OrderBy JSON objects"),
        limit: z.number().int().min(1).max(100000).default(1000),
        offset: z.number().int().min(0).default(0),
      },
    },
    async ({ propertyId, mode, ...q }) => {
      if (mode === "metadata") return ok(await ga4.getMetadata(ctx.token, propertyId));
      if (mode === "realtime") {
        return ok(await ga4.runRealtime(ctx.token, propertyId, { dimensions: q.dimensions, metrics: q.metrics, limit: q.limit }));
      }
      return ok(await ga4.runReport(ctx.token, propertyId, q));
    },
  );

  server.registerTool(
    "ga4_admin",
    {
      description:
        "GA4 configuration. list_properties needs no propertyId. create_* actions need SEO_MCP_ALLOW_WRITES=true and default to dryRun. create_annotation marks a date on GA4 charts (e.g. when SEO fixes shipped).",
      inputSchema: {
        action: z.enum([
          "list_properties",
          "list_key_events",
          "create_key_event",
          "list_custom_dimensions",
          "create_custom_dimension",
          "create_annotation",
        ]),
        propertyId: propertyArg.optional(),
        eventName: z.string().optional().describe("create_key_event: event to mark as a key event"),
        countingMethod: z.enum(["ONCE_PER_EVENT", "ONCE_PER_SESSION"]).default("ONCE_PER_EVENT"),
        parameterName: z.string().optional().describe("create_custom_dimension: event parameter name"),
        displayName: z.string().optional().describe("create_custom_dimension"),
        scope: z.enum(["EVENT", "USER", "ITEM"]).default("EVENT"),
        description: z.string().optional(),
        title: z.string().optional().describe("create_annotation"),
        date: dateArg.optional().describe("create_annotation: YYYY-MM-DD"),
        dryRun: dryRunArg,
      },
    },
    async (a) => {
      if (a.action === "list_properties") return ok(await ga4.listProperties(ctx.token));
      const id = need(a.propertyId, "propertyId");
      if (a.action === "list_key_events") return ok(await ga4.listKeyEvents(ctx.token, id));
      if (a.action === "list_custom_dimensions") return ok(await ga4.listCustomDimensions(ctx.token, id));
      requireWrites(ctx.config);
      if (a.action === "create_key_event") {
        const eventName = need(a.eventName, "eventName");
        if (a.dryRun) return dry(a.action, { propertyId: id, eventName, countingMethod: a.countingMethod });
        return ok(await ga4.createKeyEvent(ctx.token, id, eventName, a.countingMethod));
      }
      if (a.action === "create_custom_dimension") {
        const d = {
          parameterName: need(a.parameterName, "parameterName"),
          displayName: need(a.displayName, "displayName"),
          scope: a.scope,
          description: a.description,
        };
        if (a.dryRun) return dry(a.action, { propertyId: id, ...d });
        return ok(await ga4.createCustomDimension(ctx.token, id, d));
      }
      const annotation = { title: need(a.title, "title"), date: need(a.date, "date"), description: a.description };
      if (a.dryRun) return dry(a.action, { propertyId: id, ...annotation });
      return ok(await ga4.createAnnotation(ctx.token, id, annotation));
    },
  );

  server.registerTool(
    "pagespeed",
    {
      description:
        "PageSpeed Insights: Lighthouse lab metrics plus Chrome UX Report field data (p75 LCP, INP, CLS with pass/fail) for the URL and its origin. Takes 10-60 s.",
      inputSchema: { url: z.url(), strategy: z.enum(["mobile", "desktop"]).default("mobile") },
    },
    async ({ url, strategy }) => ok(await pagespeed(url, strategy, ctx.config.pagespeedKey)),
  );
}
