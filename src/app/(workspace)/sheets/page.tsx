import { requireCurrentWorkspace } from "@/lib/auth/access";
import { listSheets } from "@/lib/data/sheets";
import { PageHeading } from "@/components/ui";
import { SheetImporter, SheetList } from "@/components/sheets";
import { driveConfigFrom } from "@/lib/sheets/drive";

export default async function SheetsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const workspace = await requireCurrentWorkspace("planning");
  const params = await searchParams;
  const data = await listSheets(workspace.wedding.id);
  return <div className="section-stack">
    <PageHeading title="Sheets" description="Spreadsheets you've added, as tables you can search, sort and download." />
    {params.deleted === "1" && <p className="field-success" role="status">The table was deleted.</p>}
    {/* Google Drive appears only once its three settings are in the environment (docs/sheets.md). */}
    {data.canEdit && <SheetImporter weddingId={data.weddingId} drive={driveConfigFrom(process.env)} />}
    <SheetList tables={data.tables} />
  </div>;
}
