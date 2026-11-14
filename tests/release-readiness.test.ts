import { afterEach, describe, expect, it } from "vitest";
import { assumeUser, createTestDatabase } from "./support/database";
import { clientAddress } from "../src/lib/family-invites/public";

describe("guest-page rate limits sized for a venue", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  afterEach(async () => { await db?.close(); });
  const consume = async (scope: string, key = "a".repeat(64)) =>
    (await db.query<{ ok: boolean }>("select public.consume_guest_portal_rate_limit($1,$2) ok", [scope, key])).rows[0]!.ok;

  it("allows a full venue on one network and counts photos and music separately", async () => {
    db = await createTestDatabase();
    await assumeUser(db, null, "anon");
    for (let i = 0; i < 600; i += 1) expect(await consume("read")).toBe(true);
    expect(await consume("read")).toBe(false);
    for (let i = 0; i < 200; i += 1) expect(await consume("exchange")).toBe(true);
    expect(await consume("exchange")).toBe(false);
    // Media has its own, larger allowance and is unaffected by the exhausted read limit.
    expect(await consume("media")).toBe(true);
    expect(await consume("media", "b".repeat(64))).toBe(true);
    expect(await consume("unknown")).toBe(false);
    expect(await consume("read", "not-a-digest")).toBe(false);
  });
});

describe("client address for rate limiting", () => {
  const headers = (values: Record<string, string>) => new Headers(values);
  it("uses Vercel's own header on Vercel, which clients cannot set", () => {
    expect(clientAddress(headers({ "x-vercel-forwarded-for": "203.0.113.7", "x-real-ip": "198.51.100.1" }), true)).toBe("203.0.113.7");
  });
  it("ignores the Vercel header elsewhere, where a client could have sent it", () => {
    expect(clientAddress(headers({ "x-vercel-forwarded-for": "203.0.113.7", "x-real-ip": "198.51.100.1" }), false)).toBe("198.51.100.1");
    expect(clientAddress(headers({ "x-forwarded-for": "192.0.2.5, 10.0.0.1" }), false)).toBe("192.0.2.5");
    expect(clientAddress(headers({}), false)).toBe("unknown");
  });
});
