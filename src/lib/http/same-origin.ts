/**
 * Same-origin check for state-changing route handlers. Like Next.js's Server Action CSRF check,
 * it compares the browser's Origin host with the host the request was addressed to
 * (`x-forwarded-host` from a trusted proxy, else `host`), not with the server's internal URL,
 * which can differ (127.0.0.1 vs localhost, or a proxy's internal hostname).
 */
export function isSameOriginRequest(headers: Headers): boolean {
  const origin = headers.get("origin");
  const host = headers.get("x-forwarded-host")?.split(",")[0]?.trim() || headers.get("host");
  if (!origin || !host || origin === "null") return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}
