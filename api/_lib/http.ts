import type { VercelResponse } from "@vercel/node";

export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 8000): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
}

export function json(res: VercelResponse, status: number, body: unknown, cacheSeconds = 0) {
  if (cacheSeconds > 0) res.setHeader("Cache-Control", `public, s-maxage=${cacheSeconds}, stale-while-revalidate=86400`);
  else res.setHeader("Cache-Control", "no-store");
  res.status(status).json(body);
}

export const num = (v: unknown): number | undefined => {
  const n = parseFloat(String(v ?? ""));
  return isFinite(n) ? n : undefined;
};
