import "server-only";

import { createHmac, randomBytes } from "node:crypto";

function secret() {
  const value = process.env.GUEST_PORTAL_HMAC_SECRET;
  if (!value || value.length < 32) throw new Error("Guest portal security is not configured.");
  return value;
}

export function newGuestPortalToken() {
  return randomBytes(32).toString("base64url");
}

export function digestGuestPortalValue(kind: "link" | "session" | "rate", value: string) {
  return createHmac("sha256", secret()).update(`wedding-guest-portal:v1:${kind}:${value}`).digest("hex");
}

export function digestGuestPortalAddress(address: string, scope: "exchange" | "submit" | "read") {
  return digestGuestPortalValue("rate", `${scope}:${address}`);
}
