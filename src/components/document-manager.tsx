"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, ShieldAlert, Upload } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { useShowMore } from "@/components/use-remembered";
import { Select, TextInput } from "@/components/form-fields";
import { Card, EmptyState, PageHeading } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { MAX_DOCUMENT_BYTES, PERMITTED_TYPES_LABEL } from "@/lib/documents/file-type";
import type { DocumentEntity, DocumentWorkspace } from "@/lib/data/documents";
import { archiveDocumentAction, purgeDocumentAction, restoreDocumentAction } from "@/app/actions/documents";

const ENTITY_LABELS: Record<DocumentEntity, string> = {
  wedding: "General", function: "Function", supplier: "Venue or vendor", supplier_quote: "Quote", booking: "Booking",
  booking_transaction: "Payment or refund", guest_household: "Guest household", schedule_item: "Schedule item", arrangement: "Arrangement",
};
const INLINE = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
const size = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function UploadForm({ data, documentId, fixedEntity, initialTarget = "" }: { data: DocumentWorkspace; documentId?: string; fixedEntity?: { type: string; id: string | null }; initialTarget?: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<{ error?: string; message?: string }>({});
  const [pending, setPending] = useState(false);
  const [target, setTarget] = useState(initialTarget);
  const editable = data.options.filter((option) => option.canEdit);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) { setState({ error: "Choose a file to upload." }); return; }
    if (file.size > MAX_DOCUMENT_BYTES) { setState({ error: "Files can be up to 8 MB." }); return; }
    if (!fixedEntity) {
      const [type, id] = target.split(":");
      if (!type) { setState({ error: "Choose what the document belongs to." }); return; }
      form.set("entityType", type); form.set("entityId", id ?? "");
    }
    setPending(true); setState({});
    try {
      const response = await fetch("/api/documents", { method: "POST", body: form, credentials: "same-origin", cache: "no-store" });
      const body = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !body?.ok) { setState({ error: body?.message ?? "The upload failed. Nothing was saved as available." }); return; }
      setState({ message: body.message }); formRef.current?.reset(); setTarget(""); router.refresh();
    } catch {
      setState({ error: "The upload could not reach the server. Nothing was saved." });
    } finally { setPending(false); }
  };
  if (!fixedEntity && !editable.length) return <p className="readonly-note">You do not have edit access to any record that accepts documents.</p>;
  return <form ref={formRef} onSubmit={submit} className="field-grid action-form" aria-busy={pending}>
    <input type="hidden" name="weddingId" value={data.wedding.id} />
    {documentId && <input type="hidden" name="documentId" value={documentId} />}
    {fixedEntity && <><input type="hidden" name="entityType" value={fixedEntity.type} /><input type="hidden" name="entityId" value={fixedEntity.id ?? ""} /></>}
    {!fixedEntity && <Select label="Belongs to" required value={target} onChange={(event) => setTarget(event.target.value)}>
      <option value="">Choose a record</option>
      {Object.entries(ENTITY_LABELS).map(([type, label]) => { const rows = editable.filter((option) => option.type === type); return rows.length ? <optgroup key={type} label={label}>{rows.map((option) => <option key={`${type}:${option.id}`} value={`${type}:${option.id ?? ""}`}>{option.label}</option>)}</optgroup> : null; })}
    </Select>}
    {!documentId && <TextInput label="Title" name="title" maxLength={200} placeholder="Defaults to the file name" />}
    {!documentId && <TextInput label="Category" name="category" maxLength={80} placeholder="Contract, invoice, floor plan…" />}
    <TextInput label={documentId ? "New version" : "File"} name="file" type="file" required hint={PERMITTED_TYPES_LABEL + ". Type is checked from the file's contents."} accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.txt,.csv" />
    <div className="action-form-footer">
      <button className="button button-primary" type="submit" disabled={pending}><Upload size={15} aria-hidden="true" /> {pending ? "Uploading…" : documentId ? "Upload new version" : "Upload document"}</button>
      {state.error && <p className="field-error" role="alert">{state.error}</p>}
      {!state.error && state.message && <p className="field-success" role="status">{state.message}</p>}
    </div>
  </form>;
}

export function DocumentManager({ data, initialEntity, recordId = null }: { data: DocumentWorkspace; initialEntity: string; recordId?: string | null }) {
  const [entityFilter, setEntityFilter] = useState(initialEntity);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const tz = data.wedding.timezone;
  const documents = useMemo(() => data.documents.filter((doc) =>
    (showArchived ? doc.status !== "active" : doc.status === "active")
    && (entityFilter === "all" || doc.entity_type === entityFilter)
    && (!recordId || entityFilter !== initialEntity || doc.entity_id === recordId)
    && (!query || `${doc.title} ${doc.category} ${doc.entity_label}`.toLowerCase().includes(query.toLowerCase()))), [data.documents, entityFilter, showArchived, query, recordId, initialEntity]);
  const paged = useShowMore(documents);
  return <div className="section-stack">
    <PageHeading eyebrow="Private files" title="Documents" description="Contracts, quotes, invoices, receipts, floor plans and references, attached to the record they belong to. Files are stored privately and opened through links that expire after 60 seconds." />
    <p className="travel-warning" role="note"><ShieldAlert size={15} aria-hidden="true" /> Uploaded files are <strong>not malware-scanned</strong>. Only open files from people you trust. File types are checked from their contents, and only PDFs and images open in the browser; everything else downloads.</p>
    {recordId && (() => { const record = data.options.find((option) => option.type === initialEntity && option.id === recordId); return record ? <p className="demo-note" role="note">Showing files for <strong>{record.label}</strong>. <a className="text-link" href="/documents">Show all documents</a></p> : null; })()}
    <Card title="Upload a document"><UploadForm data={data} initialTarget={recordId && data.options.some((option) => option.type === initialEntity && option.id === recordId && option.canEdit) ? `${initialEntity}:${recordId}` : ""} /></Card>
    <Card title="Library" subtitle={`You see documents for the areas you have access to. Loaded ${formatDateTime(data.loadedAt, tz)}.`}>
      <div className="table-toolbar">
        <Select label="Attached to" value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}><option value="all">Everything</option>{Object.entries(ENTITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        <TextInput label="Search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="filter-group" role="group" aria-label="Status"><button type="button" className={`chip ${!showArchived ? "is-active" : ""}`} aria-pressed={!showArchived} onClick={() => setShowArchived(false)}>Active</button><button type="button" className={`chip ${showArchived ? "is-active" : ""}`} aria-pressed={showArchived} onClick={() => setShowArchived(true)}>Archived & deleted</button></div>
      </div>
      {!documents.length ? <EmptyState title={data.documents.length ? "No documents match" : "No documents yet"} description={data.documents.length ? "Try another filter." : "Upload a contract, quote or floor plan and attach it to its vendor, booking or function."} /> :
        <><ul className="doc-list">{paged.visible.map((doc) => {
          const current = doc.versions.find((version) => version.status === "available");
          return <li key={doc.id} className="travel-guest">
            <div className="ops-head"><h3 className="row-title">{doc.title}</h3>{doc.category && <span className="status status-neutral">{doc.category}</span>}{doc.status !== "active" && <span className="status status-cancelled">{doc.status === "archived" ? "Archived" : "Files deleted"}</span>}</div>
            <p className="row-meta">{ENTITY_LABELS[doc.entity_type as DocumentEntity]}: {doc.entity_label} · updated {formatDateTime(doc.updated_at, tz)}</p>
            {current && doc.status !== "purged" && <div className="doc-actions">
              {INLINE.has(current.detected_type) && <a className="button button-secondary" href={`/api/documents/${current.id}?mode=view`} target="_blank" rel="noopener noreferrer"><Eye size={15} aria-hidden="true" /> View v{current.version_number}</a>}
              <a className="button button-secondary" href={`/api/documents/${current.id}?mode=download`}><Download size={15} aria-hidden="true" /> Download v{current.version_number}</a>
              <span className="table-secondary">{current.original_filename} · {size(current.size_bytes)} · not malware-scanned</span>
            </div>}
            {doc.versions.length > 0 && <details className="travel-edit"><summary>Versions ({doc.versions.length})</summary><ul className="night-list">{doc.versions.map((version) => <li key={version.id}>v{version.version_number} · {version.original_filename} · {size(version.size_bytes)} · {formatDateTime(version.created_at, tz)} · {version.status === "available" ? <a className="text-link" href={`/api/documents/${version.id}?mode=download`}>download</a> : version.status}</li>)}</ul></details>}
            {doc.can_edit && doc.status === "active" && <details className="travel-edit"><summary>Upload a new version or archive</summary>
              <UploadForm data={data} documentId={doc.id} fixedEntity={{ type: doc.entity_type, id: doc.entity_id }} />
              <ActionForm action={archiveDocumentAction} submitLabel="Archive document" variant="quiet"><input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="documentId" value={doc.id} /></ActionForm>
            </details>}
            {doc.can_edit && doc.status === "archived" && <div className="travel-subforms">
              <ActionForm action={restoreDocumentAction} submitLabel="Restore" variant="secondary"><input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="documentId" value={doc.id} /></ActionForm>
              {data.isOwner && <ActionForm action={purgeDocumentAction} submitLabel="Delete files permanently" variant="quiet" className="inline-action-form">
                <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="documentId" value={doc.id} />
                <TextInput label="Type DELETE to confirm. Stored files cannot be recovered." name="confirm" required autoComplete="off" />
              </ActionForm>}
            </div>}
          </li>;
        })}</ul>{paged.remaining > 0 && <button type="button" className="button button-secondary show-more" onClick={paged.showMore}>Show more ({paged.remaining} left)</button>}</>}
    </Card>
  </div>;
}
