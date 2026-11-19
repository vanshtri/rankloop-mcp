import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { GoogleAuth, OAuth2Client } from "google-auth-library";
import type { Config } from "../config.ts";

const READ_SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
];
const WRITE_SCOPES = [
  "https://www.googleapis.com/auth/webmasters",
  "https://www.googleapis.com/auth/analytics.edit",
];

export function scopesFor(config: Config): string[] {
  return config.allowWrites ? WRITE_SCOPES : READ_SCOPES;
}

export type StoredToken = { client_id: string; client_secret: string; refresh_token: string; scope: string };

export function tokenPath(config: Config): string {
  return join(config.home, "token.json");
}

export function saveToken(config: Config, token: StoredToken): void {
  mkdirSync(config.home, { recursive: true });
  writeFileSync(tokenPath(config), JSON.stringify(token, null, 2), { mode: 0o600 });
}

export function loadToken(config: Config): StoredToken | undefined {
  const p = tokenPath(config);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as StoredToken) : undefined;
}

export type AuthMode = "service_account" | "oauth" | "none";

export function authMode(config: Config): AuthMode {
  if (config.serviceAccountFile) return "service_account";
  return loadToken(config) ? "oauth" : "none";
}

/** Scopes actually granted: from token.json for OAuth, requested scopes for service accounts. */
export function grantedScopes(config: Config): string[] {
  const mode = authMode(config);
  if (mode === "oauth") return (loadToken(config) as StoredToken).scope.split(" ");
  if (mode === "service_account") return scopesFor(config);
  return [];
}

export function hasWriteScopes(config: Config): boolean {
  const granted = grantedScopes(config);
  return WRITE_SCOPES.every((s) => granted.includes(s));
}

export type TokenSource = () => Promise<string>;

/** Lazily builds the Google client on first call; google-auth-library caches and refreshes tokens. */
export function makeTokenSource(config: Config): TokenSource {
  let get: (() => Promise<string | null | undefined>) | undefined;
  return async () => {
    if (!get) {
      const mode = authMode(config);
      if (mode === "service_account") {
        const auth = new GoogleAuth({ keyFile: config.serviceAccountFile, scopes: scopesFor(config) });
        get = () => auth.getAccessToken();
      } else if (mode === "oauth") {
        const t = loadToken(config) as StoredToken;
        const client = new OAuth2Client({ clientId: t.client_id, clientSecret: t.client_secret });
        client.setCredentials({ refresh_token: t.refresh_token });
        get = async () => (await client.getAccessToken()).token;
      } else {
        throw new Error(
          "No Google credentials. Fix: run `npx seo-mcp auth` (OAuth) or set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON file.",
        );
      }
    }
    const token = await get();
    if (!token) throw new Error("Google returned no access token. Fix: re-run `npx seo-mcp auth`.");
    return token;
  };
}

/** OAuth loopback flow for a Desktop-app client. Writes token.json. Manual-tested in Task 14. */
export async function runAuthFlow(config: Config, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET (OAuth client type: Desktop app) before running `seo-mcp auth`.",
    );
  }
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const client = new OAuth2Client({ clientId, clientSecret, redirectUri });
  const authUrl = client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: scopesFor(config) });

  const code = await new Promise<string>((resolve, reject) => {
    server.on("request", (req, res) => {
      const params = new URL(req.url ?? "/", redirectUri).searchParams;
      const code = params.get("code");
      const error = params.get("error");
      if (!code && !error) {
        res.end(); // favicon and other stray requests
        return;
      }
      res.end(code ? "seo-mcp is authorized. You can close this tab." : "seo-mcp authorization failed. Check the terminal.");
      server.close();
      if (code) resolve(code);
      else reject(new Error(`Authorization failed: ${error}`));
    });
    console.error(`Open this URL to authorize seo-mcp:\n\n${authUrl}\n`);
    openBrowser(authUrl);
  });

  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error("Google returned no refresh token. Fix: remove seo-mcp at https://myaccount.google.com/permissions and run auth again.");
  }
  const scope = tokens.scope ?? scopesFor(config).join(" ");
  saveToken(config, { client_id: clientId, client_secret: clientSecret, refresh_token: tokens.refresh_token, scope });
  console.error(`Saved ${tokenPath(config)}\nScopes: ${scope}`);
}

function openBrowser(url: string): void {
  // rundll32 instead of `cmd /c start`: cmd treats the & in the auth URL as a command separator.
  const [cmd, args]: [string, string[]] =
    process.platform === "win32"
      ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}
