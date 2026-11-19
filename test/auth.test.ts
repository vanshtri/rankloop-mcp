import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.ts";
import { authMode, grantedScopes, hasWriteScopes, loadToken, makeTokenSource, saveToken, scopesFor } from "../src/google/auth.ts";
import { tempCtx } from "./helpers.ts";

const READ = ["https://www.googleapis.com/auth/webmasters.readonly", "https://www.googleapis.com/auth/analytics.readonly"];
const WRITE = ["https://www.googleapis.com/auth/webmasters", "https://www.googleapis.com/auth/analytics.edit"];

test("read-only scopes unless writes are enabled", () => {
  assert.deepEqual(scopesFor(loadConfig({})), READ);
  assert.deepEqual(scopesFor(loadConfig({ RANKLOOP_MCP_ALLOW_WRITES: "true" })), WRITE);
});

test("auth mode: none, then oauth once a token is saved; service account wins", () => {
  const ctx = tempCtx();
  try {
    assert.equal(authMode(ctx.config), "none");
    assert.deepEqual(grantedScopes(ctx.config), []);
    saveToken(ctx.config, { client_id: "id", client_secret: "s", refresh_token: "r", scope: WRITE.join(" ") });
    assert.equal(authMode(ctx.config), "oauth");
    assert.equal(loadToken(ctx.config)?.refresh_token, "r");
    assert.equal(hasWriteScopes(ctx.config), true);
    assert.equal(authMode({ ...ctx.config, serviceAccountFile: "/sa.json" }), "service_account");
  } finally {
    ctx.cleanup();
  }
});

test("oauth token with read-only scopes has no write scopes", () => {
  const ctx = tempCtx({ RANKLOOP_MCP_ALLOW_WRITES: "true" });
  try {
    saveToken(ctx.config, { client_id: "id", client_secret: "s", refresh_token: "r", scope: READ.join(" ") });
    assert.equal(hasWriteScopes(ctx.config), false);
  } finally {
    ctx.cleanup();
  }
});

test("service account scopes follow the writes flag", () => {
  assert.equal(hasWriteScopes(loadConfig({ GOOGLE_APPLICATION_CREDENTIALS: "/sa.json", RANKLOOP_MCP_ALLOW_WRITES: "true" })), true);
  assert.equal(hasWriteScopes(loadConfig({ GOOGLE_APPLICATION_CREDENTIALS: "/sa.json" })), false);
});

test("token source without credentials explains the fix", async () => {
  const ctx = tempCtx();
  try {
    await assert.rejects(makeTokenSource(ctx.config)(), /npx rankloop-mcp auth/);
  } finally {
    ctx.cleanup();
  }
});
