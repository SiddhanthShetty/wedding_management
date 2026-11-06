import { requireCurrentWorkspace } from "@/lib/auth/access";
import { getDocumentWorkspace } from "@/lib/data/documents";
import { DocumentManager } from "@/components/document-manager";

const entities = ["all", "wedding", "function", "supplier", "supplier_quote", "booking", "booking_transaction", "guest_household", "schedule_item", "arrangement"];

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const workspace = await requireCurrentWorkspace();
  const params = await searchParams;
  const data = await getDocumentWorkspace(workspace.wedding.id);
  const entity = entities.find((value) => value === params.entity) ?? "all";
  // `?entity=supplier&id=…` (from a record's "Files" link) shows only that record's documents and targets uploads at it.
  const recordId = typeof params.id === "string" && /^[0-9a-f-]{36}$/i.test(params.id) ? params.id : null;
  return <DocumentManager data={data} initialEntity={entity} recordId={entity !== "all" ? recordId : null} />;
}
