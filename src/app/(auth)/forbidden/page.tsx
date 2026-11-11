import Link from "next/link";

export default function ForbiddenPage() {
  return <><p className="auth-eyebrow">Not available</p><h1 className="auth-title">You can’t open this page</h1><p className="auth-copy">You’re part of this wedding, but haven’t been given access to this part yet. Ask the couple to give you access in Settings.</p><Link className="button button-secondary" href="/overview">Back to Home</Link></>;
}
