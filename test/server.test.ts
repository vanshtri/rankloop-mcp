import { afterEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { makeTokenSource, saveToken } from "../src/google/auth.ts";
import { connect, stubFetch, tempCtx, text } from "./helpers.ts";

afterEach(() => mock.restoreAll());

test("setup_check without credentials says how to authenticate", async () => {
  const ctx = tempCtx();
  const client = await connect({ ...ctx, token: makeTokenSource(ctx.config) });
  try {
    const names = (await client.listTools()).tools.map((t) => t.name);
    assert.ok(names.includes("setup_check"));
    const report = JSON.parse(text(await client.callTool({ name: "setup_check", arguments: {} })));
    assert.equal(report.auth, "none");
    assert.deepEqual(report.scopes, []);
    assert.equal(report.writesEnabled, false);
    assert.deepEqual(report.optional, { PAGESPEED_API_KEY: false });
    assert.match(report.next, /npx seo-mcp auth/);
  } finally {
    await client.close();
    ctx.cleanup();
  }
});

test("setup_check lists sites and properties; one failing API does not hide the other", async () => {
  const ctx = tempCtx({ PAGESPEED_API_KEY: "k" });
  saveToken(ctx.config, {
    client_id: "id",
    client_secret: "s",
    refresh_token: "r",
    scope: "https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly",
  });
  stubFetch((url) =>
    url.host === "analyticsadmin.googleapis.com"
      ? { status: 403, body: { error: { message: "Analytics Admin API has not been used in project 1" } } }
      : { body: { siteEntry: [{ siteUrl: "sc-domain:ex.com", permissionLevel: "siteOwner" }] } },
  );
  const client = await connect(ctx);
  try {
    const report = JSON.parse(text(await client.callTool({ name: "setup_check", arguments: {} })));
    assert.equal(report.auth, "oauth");
    assert.deepEqual(report.optional, { PAGESPEED_API_KEY: true });
    assert.deepEqual(report.searchConsoleSites, [{ siteUrl: "sc-domain:ex.com", permissionLevel: "siteOwner" }]);
    assert.match(report.ga4Properties.error, /Admin API has not been used/);
  } finally {
    await client.close();
    ctx.cleanup();
  }
});
