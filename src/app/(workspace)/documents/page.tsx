import { requireCurrentWorkspace } from "@/lib/auth/access";
import { getDocumentWorkspace } from "@/lib/data/documents";
import { DocumentManager } from "@/components/document-manager";

const entities = ["all", "wedding", "function", "supplier", "supplier_quote", "booking", "booking_transaction", "guest_household", "schedule_item", "arrangement"];

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const workspace = await requireCurrentWorkspace();
  const params = await searchParams;
  const data = await getDocumentWorkspace(workspace.wedding.id);
  const entity = entities.find((value) => value === params.entity) ?? "all";
  return <DocumentManager data={data} initialEntity={entity} />;
}
