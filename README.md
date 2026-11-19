# rankloop-mcp

MCP server that gives Claude Code, Claude Desktop, Cursor and other MCP clients direct access to **Google Search Console**, **GA4** and **PageSpeed Insights**.

Phase 1 (this release): read and manage your Google SEO data. Audits, auto-fixes, competitor research and AEO/GEO are on the [roadmap](#roadmap).

## Tools

| Tool | What it does |
|---|---|
| `setup_check` | Shows which credentials work and lists your Search Console sites and GA4 properties. Run first. |
| `gsc_query` | Clicks, impressions, CTR and position by query, page, country, device, date, search appearance |
| `gsc_inspect_url` | Google's index status for one URL (2,000/day per property, tracked locally) |
| `gsc_sitemaps` | List, submit, delete sitemaps |
| `ga4_report` | GA4 reports, realtime, and the list of valid dimensions/metrics |
| `ga4_admin` | List properties, key events, custom dimensions; create them; add chart annotations |
| `pagespeed` | Lighthouse lab metrics + real-user Core Web Vitals (LCP, INP, CLS) |

## Requirements

Node.js 22.18 or newer.

## 1. Google Cloud setup (once)

1. Create or pick a project at https://console.cloud.google.com.
2. Enable: **Google Search Console API**, **Google Analytics Data API**, **Google Analytics Admin API**, **PageSpeed Insights API**.
3. Choose one way to sign in:

**Option A: OAuth (your own Google account)**
1. APIs & Services → OAuth consent screen: user type External, add yourself as a test user.
2. Set publishing status to **In production**. In "Testing", Google expires refresh tokens after 7 days. For personal use you can skip verification; Google shows an "unverified app" warning you can click through.
3. Credentials → Create credentials → OAuth client ID → **Desktop app**. Copy the client ID and secret.
4. Run once (PowerShell shown; use `export` on macOS/Linux):
   ```powershell
   $env:GOOGLE_OAUTH_CLIENT_ID="..."; $env:GOOGLE_OAUTH_CLIENT_SECRET="..."; npx -y rankloop-mcp auth
   ```
   A browser opens; approve. The token is saved to `~/.rankloop-mcp/token.json`.

**Option B: Service account (servers, CI, agencies)**
1. IAM & Admin → Service accounts → create one → Keys → Add key → JSON.
2. Search Console → Settings → Users and permissions → add the service-account email.
3. GA4 → Admin → Property access management → add the service-account email as **Viewer** (**Editor** if you enable writes).
4. Set `GOOGLE_APPLICATION_CREDENTIALS` to the JSON file path in the MCP config below.

Optional: create an API key and set `PAGESPEED_API_KEY` for a higher PageSpeed quota.

## 2. Add to your MCP client

Claude Code:
```bash
claude mcp add --transport stdio rankloop-mcp -- npx -y rankloop-mcp
```

Claude Desktop / Cursor (`mcpServers` in the client's config file):
```json
{
  "mcpServers": {
    "rankloop-mcp": {
      "command": "npx",
      "args": ["-y", "rankloop-mcp"],
      "env": { "PAGESPEED_API_KEY": "optional" }
    }
  }
}
```
For a service account, add `"GOOGLE_APPLICATION_CREDENTIALS": "/path/to/key.json"` to `env`.

Then ask: *"Run setup_check, then show my top 20 queries in Search Console for the last 28 days."*

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | unset | Service-account JSON path (takes precedence over OAuth) |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | unset | Only needed when running `rankloop-mcp auth` |
| `PAGESPEED_API_KEY` | unset | Higher PageSpeed Insights quota |
| `RANKLOOP_MCP_ALLOW_WRITES` | `false` | Allow sitemap submit/delete and GA4 creates |
| `RANKLOOP_MCP_HOME` | `~/.rankloop-mcp` | Token and local database location |

## Safety

- Read-only by default. Writes need `RANKLOOP_MCP_ALLOW_WRITES=true` **and** a token with write scopes (re-run `rankloop-mcp auth` after enabling).
- Every write defaults to `dryRun: true` and shows what would change.
- Credentials stay on your machine. Nothing is sent anywhere except Google's APIs.

## Roadmap

1. ✅ Google: Search Console, GA4, PageSpeed
2. Site audit (crawl, rules, health score) + opportunities (striking-distance keywords, CTR gaps, cannibalization, decay)
3. Fix loop: fix specs for your repo + WordPress auto-apply with rollback
4. Competitor + keyword research (DataForSEO, SerpAPI, Ahrefs)
5. AEO/GEO: AI crawler access, llms.txt, citability, AI answer visibility

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

## License

MIT
