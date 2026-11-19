import { afterEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { createAnnotation, createKeyEvent, flattenReport, listProperties, prop, runReport } from "../src/google/ga4.ts";
import { fakeToken, stubFetch } from "./helpers.ts";

afterEach(() => mock.restoreAll());

test("prop accepts bare IDs and full resource names", () => {
  assert.equal(prop("123"), "properties/123");
  assert.equal(prop("properties/123"), "properties/123");
});

test("flattenReport turns GA4 rows into objects with numeric metrics", () => {
  assert.deepEqual(
    flattenReport({
      dimensionHeaders: [{ name: "landingPage" }],
      metricHeaders: [{ name: "sessions", type: "TYPE_INTEGER" }],
      rows: [{ dimensionValues: [{ value: "/pricing" }], metricValues: [{ value: "42" }] }],
      rowCount: 1,
    }),
    { rowCount: 1, rows: [{ landingPage: "/pricing", sessions: 42 }] },
  );
});

test("runReport posts the request body to the property", async () => {
  const f = stubFetch(() => ({ body: { rowCount: 0 } }));
  assert.deepEqual(
    await runReport(fakeToken, "123", { startDate: "28daysAgo", endDate: "yesterday", dimensions: ["landingPage"], metrics: ["sessions"], limit: 10 }),
    { rowCount: 0, rows: [] },
  );
  const [url, init] = f.mock.calls[0].arguments;
  assert.equal(String(url), "https://analyticsdata.googleapis.com/v1beta/properties/123:runReport");
  assert.deepEqual(JSON.parse(String(init?.body)), {
    dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }],
    dimensions: [{ name: "landingPage" }],
    metrics: [{ name: "sessions" }],
    limit: 10,
  });
});

test("listProperties follows pagination", async () => {
  const f = stubFetch((url) =>
    url.searchParams.get("pageToken") === "p2"
      ? { body: { accountSummaries: [{ account: "accounts/2", displayName: "B", propertySummaries: [{ property: "properties/2", displayName: "Site B" }] }] } }
      : {
          body: {
            nextPageToken: "p2",
            accountSummaries: [{ account: "accounts/1", displayName: "A", propertySummaries: [{ property: "properties/1", displayName: "Site A" }] }],
          },
        },
  );
  assert.deepEqual(await listProperties(fakeToken), [
    { account: "accounts/1", accountName: "A", property: "properties/1", propertyName: "Site A" },
    { account: "accounts/2", accountName: "B", property: "properties/2", propertyName: "Site B" },
  ]);
  assert.equal(f.mock.callCount(), 2);
});

test("createKeyEvent sends eventName and countingMethod", async () => {
  const f = stubFetch(() => ({ body: { name: "properties/1/keyEvents/5", eventName: "sign_up" } }));
  await createKeyEvent(fakeToken, "1", "sign_up", "ONCE_PER_SESSION");
  const [url, init] = f.mock.calls[0].arguments;
  assert.equal(String(url), "https://analyticsadmin.googleapis.com/v1beta/properties/1/keyEvents");
  assert.deepEqual(JSON.parse(String(init?.body)), { eventName: "sign_up", countingMethod: "ONCE_PER_SESSION" });
});

test("createAnnotation splits the date and uses v1alpha", async () => {
  const f = stubFetch(() => ({ body: { name: "properties/1/reportingDataAnnotations/9" } }));
  await createAnnotation(fakeToken, "properties/1", { title: "Fixed titles", date: "2026-11-20" });
  const [url, init] = f.mock.calls[0].arguments;
  assert.equal(String(url), "https://analyticsadmin.googleapis.com/v1alpha/properties/1/reportingDataAnnotations");
  assert.deepEqual(JSON.parse(String(init?.body)), {
    title: "Fixed titles",
    annotationDate: { year: 2026, month: 11, day: 20 },
    color: "BLUE",
  });
});
