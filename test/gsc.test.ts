import { afterEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { quotaAdd } from "../src/db.ts";
import { INSPECTION_DAILY_LIMIT, defaultRange, inspectUrl, listSites, searchAnalytics, submitSitemap } from "../src/google/gsc.ts";
import { fakeToken, stubFetch, tempCtx } from "./helpers.ts";

afterEach(() => mock.restoreAll());

test("defaultRange ends 3 days ago and spans 28 days", () => {
  assert.deepEqual(defaultRange(new Date("2026-11-20T12:00:00Z")), { startDate: "2026-10-21", endDate: "2026-11-17" });
});

test("listSites returns siteEntry or []", async () => {
  stubFetch(() => ({ body: { siteEntry: [{ siteUrl: "sc-domain:ex.com", permissionLevel: "siteOwner" }] } }));
  assert.deepEqual(await listSites(fakeToken), [{ siteUrl: "sc-domain:ex.com", permissionLevel: "siteOwner" }]);
  mock.restoreAll();
  stubFetch(() => ({ body: {} }));
  assert.deepEqual(await listSites(fakeToken), []);
});

test("searchAnalytics names keys by dimension, rounds, sends filters as one group", async () => {
  const f = stubFetch(() => ({
    body: { rows: [{ keys: ["seo tools", "https://ex.com/"], clicks: 3, impressions: 100, ctr: 0.031234, position: 7.34 }] },
  }));
  const rows = await searchAnalytics(fakeToken, "sc-domain:ex.com", {
    startDate: "2026-10-01",
    endDate: "2026-10-28",
    dimensions: ["query", "page"],
    filters: [{ dimension: "page", operator: "contains", expression: "/blog/" }],
    rowLimit: 10,
  });
  assert.deepEqual(rows, [{ query: "seo tools", page: "https://ex.com/", clicks: 3, impressions: 100, ctr: 0.0312, position: 7.3 }]);
  const [url, init] = f.mock.calls[0].arguments;
  assert.equal(String(url), "https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aex.com/searchAnalytics/query");
  assert.deepEqual(JSON.parse(String(init?.body)), {
    startDate: "2026-10-01",
    endDate: "2026-10-28",
    dimensions: ["query", "page"],
    dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "contains", expression: "/blog/" }] }],
    rowLimit: 10,
  });
});

test("inspectUrl counts quota and refuses past the daily limit", async () => {
  const ctx = tempCtx();
  try {
    stubFetch(() => ({ body: { inspectionResult: { indexStatusResult: { verdict: "PASS" } } } }));
    assert.deepEqual(await inspectUrl(fakeToken, ctx.db, "sc-domain:ex.com", "https://ex.com/a"), {
      quotaUsedToday: 1,
      indexStatusResult: { verdict: "PASS" },
    });
    for (let i = 1; i < INSPECTION_DAILY_LIMIT; i++) quotaAdd(ctx.db, "urlInspection", "sc-domain:ex.com");
    await assert.rejects(inspectUrl(fakeToken, ctx.db, "sc-domain:ex.com", "https://ex.com/a"), /quota used up/);
  } finally {
    ctx.cleanup();
  }
});

test("submitSitemap PUTs the encoded feed path", async () => {
  const f = stubFetch(() => ({ body: "" }));
  assert.deepEqual(await submitSitemap(fakeToken, "https://ex.com/", "https://ex.com/sitemap.xml"), {
    submitted: "https://ex.com/sitemap.xml",
  });
  const [url, init] = f.mock.calls[0].arguments;
  assert.equal(
    String(url),
    "https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fex.com%2F/sitemaps/https%3A%2F%2Fex.com%2Fsitemap.xml",
  );
  assert.equal(init?.method, "PUT");
});
