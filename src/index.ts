#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.ts";
import { openDb } from "./db.ts";
import { makeTokenSource, runAuthFlow } from "./google/auth.ts";
import { createServer } from "./server.ts";

const config = loadConfig();

if (process.argv[2] === "auth") {
  await runAuthFlow(config).catch((e: Error) => {
    console.error(e.message);
    process.exit(1);
  });
} else {
  const server = createServer({ config, db: openDb(config.home), token: makeTokenSource(config) });
  await server.connect(new StdioServerTransport());
}
