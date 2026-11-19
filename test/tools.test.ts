import { afterEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { defaultRange } from "../src/google/gsc.ts";
import { connect, stubFetch, tempCtx, text } from "./helpers.ts";

afterEach(() => mock.restoreAll());

async function withClient(env: Record<string, string>, fn: (client: Awaited<ReturnType<typeof connect>>) => Promise<void>) {
  const ctx = tempCtx(env);
  const client = await connect(ctx);
  try {
    await fn(client);
  } finally {
    await client.close();
    ctx.cleanup();
  }
}

test("lists the 7 phase-1 tools", () =>
  withClient({}, async (client) => {
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["ga4_admin", "ga4_report", "gsc_inspect_url", "gsc_query", "gsc_sitemaps", "pagespeed", "setup_check"]);
  }));

test("gsc_query applies default range, dimensions, type and rowLimit", () =>
  withClient({}, async (client) => {
    const f = stubFetch(() => ({ body: { rows: [] } }));
    const r = await client.callTool({ name: "gsc_query", arguments: { siteUrl: "sc-domain:ex.com" } });
    assert.equal(text(r), "[]");
    const body = JSON.parse(String(f.mock.calls[0].arguments[1]?.body));
    assert.deepEqual(body, { ...defaultRange(), dimensions: ["query"], type: "web", rowLimit: 1000, startRow: 0, dataState: "final" });
  }));

test("gsc_sitemaps submit is blocked when writes are off, and makes no request", () =>
  withClient({}, async (client) => {
    const f = stubFetch(() => ({ body: {} }));
    const r = await client.callTool({
      name: "gsc_sitemaps",
      arguments: { siteUrl: "sc-domain:ex.com", action: "submit", feedpath: "https://ex.com/sitemap.xml" },
    });
    assert.equal(r.isError, true);
    assert.match(text(r), /SEO_MCP_ALLOW_WRITES=true/);
    assert.equal(f.mock.callCount(), 0);
  }));

const WRITES = { SEO_MCP_ALLOW_WRITES: "true", GOOGLE_APPLICATION_CREDENTIALS: "/sa.json" };

test("gsc_sitemaps submit defaults to dryRun", () =>
  withClient(WRITES, async (client) => {
    const f = stubFetch(() => ({ body: {} }));
    const r = await client.callTool({
      name: "gsc_sitemaps",
      arguments: { siteUrl: "sc-domain:ex.com", action: "submit", feedpath: "https://ex.com/sitemap.xml" },
    });
    assert.equal(JSON.parse(text(r)).dryRun, true);
    assert.equal(f.mock.callCount(), 0);
  }));

test("ga4_admin create_key_event with dryRun false calls the Admin API", () =>
  withClient(WRITES, async (client) => {
    const f = stubFetch(() => ({ body: { name: "properties/1/keyEvents/5", eventName: "sign_up" } }));
    const r = await client.callTool({
      name: "ga4_admin",
      arguments: { action: "create_key_event", propertyId: "1", eventName: "sign_up", dryRun: false },
    });
    assert.equal(JSON.parse(text(r)).eventName, "sign_up");
    assert.equal(String(f.mock.calls[0].arguments[0]), "https://analyticsadmin.googleapis.com/v1beta/properties/1/keyEvents");
  }));

test("ga4_admin without propertyId names the missing field", () =>
  withClient({}, async (client) => {
    const r = await client.callTool({ name: "ga4_admin", arguments: { action: "list_key_events" } });
    assert.equal(r.isError, true);
    assert.match(text(r), /propertyId is required/);
  }));

test("ga4_report metadata mode hits the metadata endpoint", () =>
  withClient({}, async (client) => {
    const f = stubFetch(() => ({ body: { dimensions: [{ apiName: "landingPage", uiName: "Landing page", category: "Page" }], metrics: [] } }));
    const r = await client.callTool({ name: "ga4_report", arguments: { propertyId: "123", mode: "metadata" } });
    assert.deepEqual(JSON.parse(text(r)).dimensions, [{ apiName: "landingPage", uiName: "Landing page", category: "Page" }]);
    assert.equal(String(f.mock.calls[0].arguments[0]), "https://analyticsdata.googleapis.com/v1beta/properties/123/metadata");
  }));

test("pagespeed passes the configured key", () =>
  withClient({ PAGESPEED_API_KEY: "k" }, async (client) => {
    const f = stubFetch(() => ({ body: {} }));
    await client.callTool({ name: "pagespeed", arguments: { url: "https://ex.com/" } });
    const url = new URL(String(f.mock.calls[0].arguments[0]));
    assert.equal(url.searchParams.get("key"), "k");
    assert.equal(url.searchParams.get("strategy"), "mobile");
  }));
