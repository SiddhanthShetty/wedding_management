/**
 * Rules for signing in, resetting a password and following email links.
 * Kept free of server imports so they can be unit-tested.
 */

/** Where an email link may send someone after it signs them in. Anything else goes to Home. */
const NEXT_PATHS = ["/reset-password", "/overview", "/setup"] as const;

export function safeNextPath(value: string | null | undefined): string {
  return NEXT_PATHS.find((path) => path === value) ?? "/overview";
}

/** Email link types this app accepts on /auth/confirm. */
const LINK_TYPES = ["recovery", "signup", "email", "invite", "email_change"] as const;
export type EmailLinkType = (typeof LINK_TYPES)[number];

export function emailLinkType(value: string | null | undefined): EmailLinkType | null {
  return LINK_TYPES.find((type) => type === value) ?? null;
}

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const PASSWORD_HINT = `At least ${PASSWORD_MIN} characters. A short phrase you'll remember works well.`;

/** A plain-words problem with a new password, or null when it's fine. */
export function newPasswordProblem(password: string, confirm: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use ${PASSWORD_MAX} characters or fewer.`;
  if (password !== confirm) return "The two passwords don't match.";
  return null;
}

/** Plain-words messages for Supabase sign-in errors, by error code. */
export function signInErrorMessage(code: string | undefined): string {
  if (code === "email_not_confirmed") return "Please confirm your email first. Open the link we emailed you when you created your account.";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit") return "Too many tries. Wait a few minutes and try again.";
  return "That email and password don't match. Check them, or reset your password.";
}

/** Messages for the ?error= values that email links send back to the sign-in page. */
export function linkErrorMessage(value: string | undefined): string | null {
  if (value === "callback" || value === "link") return "That link has expired or was already used. Ask for a new one below.";
  return null;
}

/** The public address of this app, for links in emails. The site URL setting wins over request headers. */
export function siteOrigin(configured: string | undefined, host: string | null, proto: string | null): string | null {
  if (configured) {
    try { return new URL(configured).origin; } catch { /* fall back to the request */ }
  }
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return null;
  const scheme = proto === "http" || proto === "https" ? proto : host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return `${scheme}://${host}`;
}
