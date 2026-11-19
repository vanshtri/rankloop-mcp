import { requestJson } from "../http.ts";
import type { TokenSource } from "./auth.ts";

const DATA = "https://analyticsdata.googleapis.com/v1beta";
const ADMIN = "https://analyticsadmin.googleapis.com";

export const prop = (id: string): string => (id.startsWith("properties/") ? id : `properties/${id}`);

type AccountSummary = { account: string; displayName: string; propertySummaries?: { property: string; displayName: string }[] };

export async function listProperties(token: TokenSource) {
  const out: { account: string; accountName: string; property: string; propertyName: string }[] = [];
  let pageToken: string | undefined;
  do {
    const r = await requestJson<{ accountSummaries?: AccountSummary[]; nextPageToken?: string }>(`${ADMIN}/v1beta/accountSummaries`, {
      token: await token(),
      query: { pageSize: "200", pageToken },
    });
    for (const a of r.accountSummaries ?? []) {
      for (const p of a.propertySummaries ?? []) {
        out.push({ account: a.account, accountName: a.displayName, property: p.property, propertyName: p.displayName });
      }
    }
    pageToken = r.nextPageToken;
  } while (pageToken);
  return out;
}

type ReportResponse = {
  dimensionHeaders?: { name: string }[];
  metricHeaders?: { name: string; type: string }[];
  rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[];
  rowCount?: number;
};

export function flattenReport(r: ReportResponse) {
  const dims = (r.dimensionHeaders ?? []).map((h) => h.name);
  const mets = (r.metricHeaders ?? []).map((h) => h.name);
  return {
    rowCount: r.rowCount ?? 0,
    rows: (r.rows ?? []).map((row) => ({
      ...Object.fromEntries(dims.map((d, i) => [d, row.dimensionValues?.[i]?.value])),
      ...Object.fromEntries(mets.map((m, i) => [m, Number(row.metricValues?.[i]?.value)])),
    })),
  };
}

export type ReportQuery = {
  startDate: string;
  endDate: string;
  dimensions: string[];
  metrics: string[];
  dimensionFilter?: unknown;
  metricFilter?: unknown;
  orderBys?: unknown[];
  limit?: number;
  offset?: number;
};

export async function runReport(token: TokenSource, propertyId: string, q: ReportQuery) {
  const body = {
    dateRanges: [{ startDate: q.startDate, endDate: q.endDate }],
    dimensions: q.dimensions.map((name) => ({ name })),
    metrics: q.metrics.map((name) => ({ name })),
    dimensionFilter: q.dimensionFilter,
    metricFilter: q.metricFilter,
    orderBys: q.orderBys,
    limit: q.limit,
    offset: q.offset,
  };
  return flattenReport(await requestJson<ReportResponse>(`${DATA}/${prop(propertyId)}:runReport`, { method: "POST", body, token: await token() }));
}

export async function runRealtime(token: TokenSource, propertyId: string, q: { dimensions: string[]; metrics: string[]; limit?: number }) {
  const body = { dimensions: q.dimensions.map((name) => ({ name })), metrics: q.metrics.map((name) => ({ name })), limit: q.limit };
  return flattenReport(
    await requestJson<ReportResponse>(`${DATA}/${prop(propertyId)}:runRealtimeReport`, { method: "POST", body, token: await token() }),
  );
}

type Field = { apiName: string; uiName: string; category?: string };

/** apiNames grouped by category: full metadata is ~65KB, too big for an agent's context. */
export async function getMetadata(token: TokenSource, propertyId: string) {
  const r = await requestJson<{ dimensions?: Field[]; metrics?: Field[] }>(`${DATA}/${prop(propertyId)}/metadata`, { token: await token() });
  const group = (fields: Field[] = []) => {
    const out: Record<string, string[]> = {};
    for (const f of fields) (out[f.category ?? "Other"] ??= []).push(f.apiName);
    return out;
  };
  return { dimensions: group(r.dimensions), metrics: group(r.metrics) };
}

export async function listKeyEvents(token: TokenSource, propertyId: string): Promise<unknown[]> {
  const r = await requestJson<{ keyEvents?: unknown[] }>(`${ADMIN}/v1beta/${prop(propertyId)}/keyEvents`, {
    token: await token(),
    query: { pageSize: "200" },
  });
  return r.keyEvents ?? [];
}

export async function createKeyEvent(token: TokenSource, propertyId: string, eventName: string, countingMethod: string) {
  return requestJson<unknown>(`${ADMIN}/v1beta/${prop(propertyId)}/keyEvents`, {
    method: "POST",
    body: { eventName, countingMethod },
    token: await token(),
  });
}

export async function listCustomDimensions(token: TokenSource, propertyId: string): Promise<unknown[]> {
  const r = await requestJson<{ customDimensions?: unknown[] }>(`${ADMIN}/v1beta/${prop(propertyId)}/customDimensions`, {
    token: await token(),
    query: { pageSize: "200" },
  });
  return r.customDimensions ?? [];
}

export type CustomDimension = { parameterName: string; displayName: string; scope: string; description?: string };

export async function createCustomDimension(token: TokenSource, propertyId: string, d: CustomDimension) {
  return requestJson<unknown>(`${ADMIN}/v1beta/${prop(propertyId)}/customDimensions`, { method: "POST", body: d, token: await token() });
}

export type Annotation = { title: string; date: string; description?: string };

export async function createAnnotation(token: TokenSource, propertyId: string, a: Annotation) {
  const [year, month, day] = a.date.split("-").map(Number);
  return requestJson<unknown>(`${ADMIN}/v1alpha/${prop(propertyId)}/reportingDataAnnotations`, {
    method: "POST",
    body: { title: a.title, description: a.description, annotationDate: { year, month, day }, color: "BLUE" },
    token: await token(),
  });
}
