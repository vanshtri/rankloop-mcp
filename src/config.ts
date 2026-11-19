import { homedir } from "node:os";
import { join } from "node:path";

export type Config = {
  home: string;
  allowWrites: boolean;
  serviceAccountFile: string | undefined;
  pagespeedKey: string | undefined;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    home: env.SEO_MCP_HOME || join(homedir(), ".seo-mcp"),
    allowWrites: env.SEO_MCP_ALLOW_WRITES === "true",
    serviceAccountFile: env.GOOGLE_APPLICATION_CREDENTIALS || undefined,
    pagespeedKey: env.PAGESPEED_API_KEY || undefined,
  };
}
