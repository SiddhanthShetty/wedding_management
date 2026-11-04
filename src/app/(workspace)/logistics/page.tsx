import { SectionPage } from "@/components/section-page";
import { requireCurrentWorkspace } from "@/lib/auth/access";

export default async function Page() { await requireCurrentWorkspace("logistics"); return <SectionPage section="logistics" />; }
