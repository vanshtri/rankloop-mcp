import { test } from "node:test";
import assert from "node:assert/strict";
import { saveToken } from "../src/google/auth.ts";
import { dry, need, ok, requireWrites } from "../src/result.ts";
import { tempCtx } from "./helpers.ts";

const textOf = (r: ReturnType<typeof ok>) => (r.content[0] as { text: string }).text;

test("ok wraps data as pretty JSON text", () => {
  assert.equal(textOf(ok({ a: 1 })), '{\n  "a": 1\n}');
});

test("dry describes the change without making it", () => {
  assert.deepEqual(JSON.parse(textOf(dry("submit", { feedpath: "f" }))), {
    dryRun: true,
    action: "submit",
    payload: { feedpath: "f" },
    note: "Nothing changed. Call again with dryRun: false to apply.",
  });
});

test("need returns the value or names the missing field", () => {
  assert.equal(need("x", "a"), "x");
  assert.throws(() => need(undefined, "propertyId"), /propertyId is required/);
  assert.throws(() => need("", "title"), /title is required/);
});

test("requireWrites blocks when writes are off", () => {
  const ctx = tempCtx();
  try {
    assert.throws(() => requireWrites(ctx.config), /RANKLOOP_MCP_ALLOW_WRITES=true/);
  } finally {
    ctx.cleanup();
  }
});

test("requireWrites blocks when the token has read-only scopes", () => {
  const ctx = tempCtx({ RANKLOOP_MCP_ALLOW_WRITES: "true" });
  try {
    saveToken(ctx.config, {
      client_id: "id",
      client_secret: "s",
      refresh_token: "r",
      scope: "https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly",
    });
    assert.throws(() => requireWrites(ctx.config), /re-run `npx rankloop-mcp auth`/);
  } finally {
    ctx.cleanup();
  }
});

test("requireWrites passes with writes on and write scopes", () => {
  const ctx = tempCtx({ RANKLOOP_MCP_ALLOW_WRITES: "true", GOOGLE_APPLICATION_CREDENTIALS: "/sa.json" });
  try {
    assert.doesNotThrow(() => requireWrites(ctx.config));
  } finally {
    ctx.cleanup();
  }
});
