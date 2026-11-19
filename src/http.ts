export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string;
  query?: Record<string, string | undefined>;
};

export async function requestJson<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  const u = new URL(url);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) u.searchParams.append(k, v);
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const method = opts.method ?? (opts.body === undefined ? "GET" : "POST");
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  const baseDelay = Number(process.env.SEO_MCP_RETRY_BASE_MS ?? 500);

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(u, { method, headers, body, signal: AbortSignal.timeout(120_000) });
    if (res.ok) {
      const text = await res.text();
      return (text ? JSON.parse(text) : {}) as T;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, baseDelay * 2 ** attempt));
      continue;
    }
    throw new ApiError(res.status, `${res.status} from ${u.host}${u.pathname}: ${await errorMessage(res)}${hint(res.status, u)}`);
  }
}

async function errorMessage(res: Response): Promise<string> {
  const text = await res.text();
  try {
    return JSON.parse(text).error?.message ?? text;
  } catch {
    return text.slice(0, 300);
  }
}

function hint(status: number, u: URL): string {
  const api = u.host.includes("analytics")
    ? "ga4"
    : u.host.includes("searchconsole") || u.pathname.startsWith("/webmasters")
      ? "gsc"
      : "other";
  if (status === 401) return ". Fix: re-run `npx seo-mcp auth` (token expired or revoked).";
  if (status === 403 && api === "ga4")
    return ". Fix: give your Google account or service-account email Viewer access on the GA4 property (Editor for writes).";
  if (status === 403 && api === "gsc")
    return ". Fix: check the siteUrl format (sc-domain:example.com or https://example.com/) and that your Google account or service-account email is a user on that Search Console property.";
  if (status === 429) return ". Fix: quota exceeded; wait and retry.";
  return "";
}
