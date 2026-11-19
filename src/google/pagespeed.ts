import { requestJson } from "../http.ts";

const PSI = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

type Experience = { metrics?: Record<string, { percentile: number; category: string }>; overall_category?: string };
type PsiResponse = {
  lighthouseResult?: {
    categories?: { performance?: { score: number | null } };
    audits?: Record<string, { numericValue?: number }>;
  };
  loadingExperience?: Experience;
  originLoadingExperience?: Experience;
};

export async function pagespeed(url: string, strategy: "mobile" | "desktop", key: string | undefined) {
  const r = await requestJson<PsiResponse>(PSI, { query: { url, strategy, category: "performance", key } });
  const audits = r.lighthouseResult?.audits ?? {};
  const ms = (id: string) => {
    const v = audits[id]?.numericValue;
    return v === undefined ? null : Math.round(v);
  };
  const score = r.lighthouseResult?.categories?.performance?.score;
  return {
    url,
    strategy,
    lab: {
      performanceScore: score == null ? null : Math.round(score * 100),
      lcpMs: ms("largest-contentful-paint"),
      fcpMs: ms("first-contentful-paint"),
      tbtMs: ms("total-blocking-time"),
      speedIndexMs: ms("speed-index"),
      cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
    },
    fieldUrl: field(r.loadingExperience),
    fieldOrigin: field(r.originLoadingExperience),
  };
}

/** CrUX p75 from PSI. "Good": LCP <= 2500 ms, INP <= 200 ms, CLS <= 0.1. PSI reports CLS x100. */
export function field(e: Experience | undefined) {
  const m = e?.metrics;
  if (!m || Object.keys(m).length === 0) return null;
  const lcp = m.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null;
  const inp = m.INTERACTION_TO_NEXT_PAINT?.percentile ?? null;
  const clsRaw = m.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile;
  const cls = clsRaw === undefined ? null : clsRaw / 100;
  return {
    overall: e?.overall_category ?? null,
    lcpP75Ms: lcp,
    inpP75Ms: inp,
    clsP75: cls,
    pass: {
      lcp: lcp === null ? null : lcp <= 2500,
      inp: inp === null ? null : inp <= 200,
      cls: cls === null ? null : cls <= 0.1,
    },
  };
}
