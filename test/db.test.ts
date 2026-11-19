import { test } from "node:test";
import assert from "node:assert/strict";
import { pacificDay, quotaAdd, quotaUsed } from "../src/db.ts";
import { tempCtx } from "./helpers.ts";

test("pacificDay uses America/Los_Angeles", () => {
  assert.equal(pacificDay(new Date("2026-01-02T05:00:00Z")), "2026-01-01");
  assert.equal(pacificDay(new Date("2026-01-02T09:00:00Z")), "2026-01-02");
});

test("quota counts per api, property and day", () => {
  const ctx = tempCtx();
  try {
    const day = "2026-01-01";
    assert.equal(quotaUsed(ctx.db, "urlInspection", "sc-domain:a.com", day), 0);
    quotaAdd(ctx.db, "urlInspection", "sc-domain:a.com", day);
    quotaAdd(ctx.db, "urlInspection", "sc-domain:a.com", day);
    quotaAdd(ctx.db, "urlInspection", "sc-domain:b.com", day);
    assert.equal(quotaUsed(ctx.db, "urlInspection", "sc-domain:a.com", day), 2);
    assert.equal(quotaUsed(ctx.db, "urlInspection", "sc-domain:b.com", day), 1);
    assert.equal(quotaUsed(ctx.db, "urlInspection", "sc-domain:a.com", "2026-01-02"), 0);
  } finally {
    ctx.cleanup();
  }
});
