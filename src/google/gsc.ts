import type { DatabaseSync } from "node:sqlite";
import { quotaAdd, quotaUsed } from "../db.ts";
import { requestJson } from "../http.ts";
import type { TokenSource } from "./auth.ts";

const WM = "https://www.googleapis.com/webmasters/v3";
const site = (siteUrl: string) => `${WM}/sites/${encodeURIComponent(siteUrl)}`;
const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;

export const INSPECTION_DAILY_LIMIT = 2000;

/** Last 28 days of complete data: Search Console lags ~2-3 days. */
export function defaultRange(today: Date = new Date()): { startDate: string; endDate: string } {
  const day = 86_400_000;
  const end = new Date(today.getTime() - 3 * day);
  const start = new Date(end.getTime() - 27 * day);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

export async function listSites(token: TokenSource): Promise<{ siteUrl: string; permissionLevel: string }[]> {
  const r = await requestJson<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(`${WM}/sites`, {
    token: await token(),
  });
  return r.siteEntry ?? [];
}

export type SearchAnalyticsQuery = {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  type?: string;
  filters?: { dimension: string; operator: string; expression: string }[];
  rowLimit?: number;
  startRow?: number;
  dataState?: string;
};

type GscRow = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };

export async function searchAnalytics(token: TokenSource, siteUrl: string, q: SearchAnalyticsQuery) {
  const body = {
    startDate: q.startDate,
    endDate: q.endDate,
    dimensions: q.dimensions,
    type: q.type,
    dimensionFilterGroups: q.filters?.length ? [{ filters: q.filters }] : undefined,
    rowLimit: q.rowLimit,
    startRow: q.startRow,
    dataState: q.dataState,
  };
  const r = await requestJson<{ rows?: GscRow[] }>(`${site(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    body,
    token: await token(),
  });
  const dims = q.dimensions ?? [];
  return (r.rows ?? []).map((row) => ({
    ...Object.fromEntries(dims.map((d, i) => [d, row.keys?.[i]])),
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: round(row.ctr, 4),
    position: round(row.position, 1),
  }));
}

export async function inspectUrl(token: TokenSource, db: DatabaseSync, siteUrl: string, url: string, languageCode = "en-US") {
  const used = quotaUsed(db, "urlInspection", siteUrl);
  if (used >= INSPECTION_DAILY_LIMIT) {
    throw new Error(
      `URL Inspection quota used up for ${siteUrl} (${used}/${INSPECTION_DAILY_LIMIT} today). Resets at midnight Pacific time.`,
    );
  }
  const r = await requestJson<{ inspectionResult: Record<string, unknown> }>(
    "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
    { method: "POST", body: { inspectionUrl: url, siteUrl, languageCode }, token: await token() },
  );
  quotaAdd(db, "urlInspection", siteUrl);
  return { quotaUsedToday: used + 1, ...r.inspectionResult };
}

export async function listSitemaps(token: TokenSource, siteUrl: string): Promise<unknown[]> {
  const r = await requestJson<{ sitemap?: unknown[] }>(`${site(siteUrl)}/sitemaps`, { token: await token() });
  return r.sitemap ?? [];
}

export async function submitSitemap(token: TokenSource, siteUrl: string, feedpath: string) {
  await requestJson(`${site(siteUrl)}/sitemaps/${encodeURIComponent(feedpath)}`, { method: "PUT", token: await token() });
  return { submitted: feedpath };
}

export async function deleteSitemap(token: TokenSource, siteUrl: string, feedpath: string) {
  await requestJson(`${site(siteUrl)}/sitemaps/${encodeURIComponent(feedpath)}`, { method: "DELETE", token: await token() });
  return { deleted: feedpath };
}
