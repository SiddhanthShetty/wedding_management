import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <main className="auth-shell"><Link className="auth-brand" href="/sign-in">Wedding Desk</Link><div className="auth-card">{children}</div><p className="auth-footnote">Private wedding planning · Secure account access</p></main>;
}
