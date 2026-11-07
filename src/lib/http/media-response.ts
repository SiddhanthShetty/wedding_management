/** Sends a stored invitation file with strict headers. Files never change (a new upload gets a new id). */
export function mediaResponse(file: { mime: string; bytes: Buffer } | null, cache = "private, max-age=3600") {
  if (!file) return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  return new Response(new Uint8Array(file.bytes), { headers: {
    "Content-Type": file.mime, "Content-Length": String(file.bytes.length), "Cache-Control": cache, "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'", "Referrer-Policy": "no-referrer", "Cross-Origin-Resource-Policy": "same-origin",
  } });
}

export const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
