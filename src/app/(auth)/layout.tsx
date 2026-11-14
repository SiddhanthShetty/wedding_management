import Image from "next/image";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <main className="auth-shell"><Link className="auth-brand" href="/sign-in"><Image src="/invite/seal.webp" width={144} height={144} alt="" aria-hidden="true" className="auth-seal" priority /><span>Wedding Desk</span></Link><div className="auth-card">{children}</div><p className="auth-footnote">Private wedding planning · Secure account access</p></main>;
}
