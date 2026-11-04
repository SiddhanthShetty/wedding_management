import Link from "next/link";

export default function ForbiddenPage() {
  return <><p className="auth-eyebrow">Access restricted</p><h1 className="auth-title">You do not have access to this module</h1><p className="auth-copy">Your wedding membership is active, but the required module permission is not available for this account.</p><Link className="button button-secondary" href="/overview">Return to overview</Link></>;
}
