import { test } from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.ts";

test("defaults", () => {
  assert.deepEqual(loadConfig({}), {
    home: join(homedir(), ".rankloop-mcp"),
    allowWrites: false,
    serviceAccountFile: undefined,
    pagespeedKey: undefined,
  });
});

test("env overrides", () => {
  const c = loadConfig({
    RANKLOOP_MCP_HOME: "/x",
    RANKLOOP_MCP_ALLOW_WRITES: "true",
    GOOGLE_APPLICATION_CREDENTIALS: "/sa.json",
    PAGESPEED_API_KEY: "k",
  });
  assert.deepEqual(c, { home: "/x", allowWrites: true, serviceAccountFile: "/sa.json", pagespeedKey: "k" });
});

test("only the exact string 'true' enables writes", () => {
  assert.equal(loadConfig({ RANKLOOP_MCP_ALLOW_WRITES: "1" }).allowWrites, false);
});
