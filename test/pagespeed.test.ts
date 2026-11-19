import { afterEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { field, pagespeed } from "../src/google/pagespeed.ts";
import { stubFetch } from "./helpers.ts";

afterEach(() => mock.restoreAll());

test("pagespeed extracts lab metrics and CrUX p75 with pass flags", async () => {
  const f = stubFetch(() => ({
    body: {
      lighthouseResult: {
        categories: { performance: { score: 0.87 } },
        audits: {
          "largest-contentful-paint": { numericValue: 2310.6 },
          "first-contentful-paint": { numericValue: 1200 },
          "total-blocking-time": { numericValue: 150.2 },
          "speed-index": { numericValue: 3000 },
          "cumulative-layout-shift": { numericValue: 0.02 },
        },
      },
      loadingExperience: {
        overall_category: "AVERAGE",
        metrics: {
          LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2600, category: "AVERAGE" },
          INTERACTION_TO_NEXT_PAINT: { percentile: 180, category: "FAST" },
          CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 5, category: "FAST" },
        },
      },
      originLoadingExperience: { metrics: {} },
    },
  }));
  assert.deepEqual(await pagespeed("https://ex.com/", "mobile", "k"), {
    url: "https://ex.com/",
    strategy: "mobile",
    lab: { performanceScore: 87, lcpMs: 2311, fcpMs: 1200, tbtMs: 150, speedIndexMs: 3000, cls: 0.02 },
    fieldUrl: { overall: "AVERAGE", lcpP75Ms: 2600, inpP75Ms: 180, clsP75: 0.05, pass: { lcp: false, inp: true, cls: true } },
    fieldOrigin: null,
  });
  assert.equal(
    String(f.mock.calls[0].arguments[0]),
    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https%3A%2F%2Fex.com%2F&strategy=mobile&category=performance&key=k",
  );
});

test("no key means no key param", async () => {
  const f = stubFetch(() => ({ body: {} }));
  await pagespeed("https://ex.com/", "desktop", undefined);
  assert.equal(new URL(String(f.mock.calls[0].arguments[0])).searchParams.has("key"), false);
});

test("field returns null when CrUX has no data", () => {
  assert.equal(field(undefined), null);
  assert.equal(field({ metrics: {} }), null);
});
