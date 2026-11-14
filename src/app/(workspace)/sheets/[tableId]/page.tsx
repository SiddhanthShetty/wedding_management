import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireCurrentWorkspace } from "@/lib/auth/access";
import { getSheet } from "@/lib/data/sheets";
import { PageHeading } from "@/components/ui";
import { SheetTable } from "@/components/sheets";

export default async function SheetPage({ params, searchParams }: { params: Promise<{ tableId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const id = z.uuid().safeParse((await params).tableId);
  if (!id.success) notFound();
  const workspace = await requireCurrentWorkspace("planning");
  const view = await getSheet(workspace.wedding.id, id.data);
  if (!view) notFound();
  const added = (await searchParams).added;
  return <div className="section-stack">
    <p><Link href="/sheets" className="auth-inline-link">← All sheets</Link></p>
    <PageHeading title={view.table.name} />
    <SheetTable view={view} notice={typeof added === "string" ? added.slice(0, 200) : undefined} />
  </div>;
}
