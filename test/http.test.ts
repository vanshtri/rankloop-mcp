import { afterEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, requestJson } from "../src/http.ts";
import { stubFetch } from "./helpers.ts";

afterEach(() => mock.restoreAll());

test("GET with bearer token and query params, undefined params dropped", async () => {
  const f = stubFetch(() => ({ body: { a: 1 } }));
  assert.deepEqual(await requestJson("https://api.test/x", { token: "t", query: { q: "1", skip: undefined } }), { a: 1 });
  const [url, init] = f.mock.calls[0].arguments;
  assert.equal(String(url), "https://api.test/x?q=1");
  assert.equal(init?.method, "GET");
  assert.equal((init?.headers as Record<string, string>).authorization, "Bearer t");
});

test("body implies POST with JSON", async () => {
  const f = stubFetch(() => ({ body: {} }));
  await requestJson("https://api.test/x", { body: { k: "v" } });
  const [, init] = f.mock.calls[0].arguments;
  assert.equal(init?.method, "POST");
  assert.equal(init?.body, '{"k":"v"}');
  assert.equal((init?.headers as Record<string, string>)["content-type"], "application/json");
});

test("empty 2xx body returns {}", async () => {
  stubFetch(() => ({ body: "" }));
  assert.deepEqual(await requestJson("https://api.test/x", { method: "PUT" }), {});
});

test("retries 5xx then succeeds", async () => {
  let n = 0;
  const f = stubFetch(() => (++n < 3 ? { status: 503, body: "busy" } : { body: { ok: true } }));
  assert.deepEqual(await requestJson("https://api.test/x"), { ok: true });
  assert.equal(f.mock.callCount(), 3);
});

test("gives up after 3 retries with the API's message", async () => {
  const f = stubFetch(() => ({ status: 500, body: { error: { message: "boom" } } }));
  await assert.rejects(requestJson("https://api.test/x"), (e: ApiError) => e.status === 500 && e.message.includes("boom"));
  assert.equal(f.mock.callCount(), 4);
});

test("403 from Search Console carries a fix hint", async () => {
  stubFetch(() => ({ status: 403, body: { error: { message: "User does not have sufficient permission" } } }));
  await assert.rejects(
    requestJson("https://www.googleapis.com/webmasters/v3/sites"),
    /sufficient permission.*Fix: check the siteUrl format/,
  );
});

test("429 from PageSpeed points at PAGESPEED_API_KEY", async () => {
  stubFetch(() => ({ status: 429, body: { error: { message: "Quota exceeded" } } }));
  await assert.rejects(requestJson("https://www.googleapis.com/pagespeedonline/v5/runPagespeed"), /Fix: set PAGESPEED_API_KEY/);
});

test("403 from GA4 carries a GA4 fix hint", async () => {
  stubFetch(() => ({ status: 403, body: { error: { message: "denied" } } }));
  await assert.rejects(requestJson("https://analyticsdata.googleapis.com/v1beta/properties/1:runReport"), /Viewer access on the GA4 property/);
});
