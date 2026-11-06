import "server-only";
import { createHash } from "node:crypto";
import { AuthorizationDeniedError, authorizeWeddingOperation, type WeddingModule, type WorkspaceContext } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { detectFileType, MAX_DOCUMENT_BYTES, sanitizeFilename } from "@/lib/documents/file-type";

export const DOCUMENT_BUCKET = "wedding-documents";
export type DocumentEntity = "wedding" | "function" | "supplier" | "supplier_quote" | "booking" | "booking_transaction" | "guest_household" | "schedule_item" | "arrangement";

export const ENTITY_MODULE: Record<DocumentEntity, WeddingModule> = {
  wedding: "planning", function: "planning", supplier: "suppliers_finance", supplier_quote: "suppliers_finance", booking: "suppliers_finance",
  booking_transaction: "suppliers_finance", guest_household: "guests", schedule_item: "logistics", arrangement: "logistics",
};
export const ENTITY_LABELS: Record<DocumentEntity, string> = {
  wedding: "General (whole wedding)", function: "Function", supplier: "Venue or vendor", supplier_quote: "Quote", booking: "Booking",
  booking_transaction: "Payment or refund", guest_household: "Guest household", schedule_item: "Schedule item", arrangement: "Arrangement",
};

export class DocumentRuleError extends Error { constructor(message: string) { super(message); this.name = "DocumentRuleError"; } }

function moduleLevel(context: WorkspaceContext, module: WeddingModule) {
  if (context.membership.role === "owner" || context.membership.role === "co_owner") return "edit";
  return context.moduleAccess[module];
}

/** Lists documents and the records a member may attach to. Only modules the member can read are queried. */
export async function getDocumentWorkspace(weddingId: string) {
  const context = await authorizeWeddingOperation(weddingId);
  const supabase = await createSupabaseServerClient();
  const readable = (module: WeddingModule) => Boolean(moduleLevel(context, module));
  const options: Array<{ type: DocumentEntity; id: string | null; label: string; canEdit: boolean }> = [];
  const add = (type: DocumentEntity, rows: Array<{ id: string; label: string }>) => {
    const canEdit = moduleLevel(context, ENTITY_MODULE[type]) === "edit";
    for (const row of rows) options.push({ type, id: row.id, label: row.label, canEdit });
  };
  if (readable("planning")) {
    options.push({ type: "wedding", id: null, label: "Whole wedding", canEdit: moduleLevel(context, "planning") === "edit" });
    const functions = await supabase.from("functions").select("id,name").eq("wedding_id", weddingId).is("archived_at", null).order("starts_at");
    if (functions.error) throw new Error("Could not load functions.");
    add("function", (functions.data ?? []).map((row) => ({ id: row.id, label: row.name })));
  }
  if (readable("suppliers_finance")) {
    const [suppliers, quotes, bookings, transactions] = await Promise.all([
      supabase.from("suppliers").select("id,name").eq("wedding_id", weddingId).order("name"),
      supabase.from("supplier_quotes").select("id,supplier_id,version_number,quoted_on").eq("wedding_id", weddingId).order("quoted_on", { ascending: false }),
      supabase.from("bookings").select("id,label").eq("wedding_id", weddingId).order("label"),
      supabase.from("booking_transactions").select("id,booking_id,kind,happened_on").eq("wedding_id", weddingId).order("happened_on", { ascending: false }),
    ]);
    if ([suppliers, quotes, bookings, transactions].some((result) => result.error)) throw new Error("Could not load supplier and finance records.");
    const supplierName = new Map((suppliers.data ?? []).map((row) => [row.id, row.name]));
    const bookingLabel = new Map((bookings.data ?? []).map((row) => [row.id, row.label]));
    add("supplier", (suppliers.data ?? []).map((row) => ({ id: row.id, label: row.name })));
    add("supplier_quote", (quotes.data ?? []).map((row) => ({ id: row.id, label: `${supplierName.get(row.supplier_id) ?? "Supplier"} · quote v${row.version_number} (${row.quoted_on})` })));
    add("booking", (bookings.data ?? []).map((row) => ({ id: row.id, label: row.label })));
    add("booking_transaction", (transactions.data ?? []).map((row) => ({ id: row.id, label: `${bookingLabel.get(row.booking_id) ?? "Booking"} · ${row.kind} on ${row.happened_on}` })));
  }
  if (readable("guests")) {
    const households = await supabase.from("guest_households").select("id,name").eq("wedding_id", weddingId).order("name");
    if (households.error) throw new Error("Could not load households.");
    add("guest_household", (households.data ?? []).map((row) => ({ id: row.id, label: row.name })));
  }
  if (readable("logistics")) {
    const [items, arrangements] = await Promise.all([
      supabase.from("schedule_items").select("id,activity,planned_start").eq("wedding_id", weddingId).order("planned_start"),
      supabase.from("arrangement_items").select("id,title").eq("wedding_id", weddingId).order("title"),
    ]);
    if (items.error || arrangements.error) throw new Error("Could not load operations records.");
    add("schedule_item", (items.data ?? []).map((row) => ({ id: row.id, label: row.activity })));
    add("arrangement", (arrangements.data ?? []).map((row) => ({ id: row.id, label: row.title })));
  }
  // RLS returns only documents whose owning module this member can read.
  const [documents, versions] = await Promise.all([
    supabase.from("documents").select("id,entity_type,entity_id,title,category,notes,status,current_version,created_by_user_id,created_at,updated_at,archived_at,purged_at").eq("wedding_id", weddingId).order("updated_at", { ascending: false }),
    supabase.from("document_versions").select("id,document_id,version_number,original_filename,detected_type,size_bytes,status,malware_scan_status,uploaded_by_user_id,created_at").eq("wedding_id", weddingId).order("version_number", { ascending: false }),
  ]);
  if (documents.error || versions.error) throw new Error("Could not load documents.");
  const labels = new Map(options.map((option) => [`${option.type}:${option.id ?? ""}`, option.label]));
  return {
    wedding: context.wedding,
    isOwner: context.membership.role === "owner" || context.membership.role === "co_owner",
    options,
    documents: (documents.data ?? []).map((doc) => ({
      ...doc,
      entity_label: labels.get(`${doc.entity_type}:${doc.entity_id ?? ""}`) ?? ENTITY_LABELS[doc.entity_type as DocumentEntity],
      can_edit: moduleLevel(context, ENTITY_MODULE[doc.entity_type as DocumentEntity]) === "edit",
      versions: (versions.data ?? []).filter((version) => version.document_id === doc.id),
    })),
    loadedAt: new Date().toISOString(),
  };
}
export type DocumentWorkspace = Awaited<ReturnType<typeof getDocumentWorkspace>>;

function dbError(error: { code?: string; message: string } | null, fallback: string) {
  if (!error) return;
  if (error.code === "42501") throw new AuthorizationDeniedError();
  if (error.code === "23503" || error.code === "23514") throw new DocumentRuleError(error.message.replace(/^.*?: /, ""));
  throw new Error(fallback);
}

/**
 * Validates and stores one file. Steps: authorize, size check, content-based type detection,
 * reserve a version row (DB re-checks permission and entity ownership), upload to the private
 * bucket (storage policy requires the pending version), then mark the version available or failed.
 */
export async function uploadDocument(input: { weddingId: string; documentId: string | null; entityType: DocumentEntity; entityId: string | null; title: string; category: string; file: File }) {
  await authorizeWeddingOperation(input.weddingId, ENTITY_MODULE[input.entityType], "edit");
  if (input.file.size === 0) throw new DocumentRuleError("The file is empty.");
  if (input.file.size > MAX_DOCUMENT_BYTES) throw new DocumentRuleError("Files can be up to 8 MB.");
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  if (bytes.byteLength !== input.file.size || bytes.byteLength > MAX_DOCUMENT_BYTES) throw new DocumentRuleError("The upload was incomplete. Try again.");
  const detected = detectFileType(bytes, input.file.name);
  if (!detected) throw new DocumentRuleError("This file type is not permitted. Upload a PDF, image, Word, Excel, text or CSV file.");
  const filename = sanitizeFilename(input.file.name, detected);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const supabase = await createSupabaseServerClient();
  const reserved = await supabase.rpc("begin_document_upload", {
    p_wedding_id: input.weddingId, p_document_id: input.documentId, p_entity_type: input.entityType, p_entity_id: input.entityId,
    p_title: input.title || filename, p_category: input.category, p_filename: filename, p_detected_type: detected.mime, p_size_bytes: bytes.byteLength, p_sha256: sha256,
  });
  dbError(reserved.error, "Could not prepare the upload.");
  const { version_id: versionId, object_key: objectKey } = reserved.data as { version_id: string; object_key: string };
  const stored = await supabase.storage.from(DOCUMENT_BUCKET).upload(objectKey, bytes, { contentType: detected.mime, upsert: false, cacheControl: "private, max-age=0, no-store" });
  const finished = await supabase.rpc("finish_document_upload", { p_wedding_id: input.weddingId, p_version_id: versionId, p_succeeded: !stored.error });
  if (stored.error) throw new Error("The file could not be stored. Nothing was saved as available; try again.");
  dbError(finished.error, "The file was stored but could not be marked available. Refresh before retrying.");
  return { filename, label: detected.label };
}

/** Short-lived signed URL for one available version, after the database confirms read access. */
export async function signedDocumentUrl(weddingId: string, versionId: string, mode: "view" | "download") {
  await authorizeWeddingOperation(weddingId);
  const supabase = await createSupabaseServerClient();
  const { data: version, error } = await supabase.from("document_versions").select("object_key,original_filename,detected_type,status").eq("wedding_id", weddingId).eq("id", versionId).maybeSingle();
  if (error) throw new Error("Could not load the document.");
  if (!version || version.status !== "available") throw new AuthorizationDeniedError();
  const inline = mode === "view" && ["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(version.detected_type);
  const signed = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(version.object_key, 60, inline ? undefined : { download: version.original_filename });
  if (signed.error || !signed.data) throw new AuthorizationDeniedError();
  return signed.data.signedUrl;
}

export async function setDocumentArchived(weddingId: string, documentId: string, archived: boolean) {
  await authorizeWeddingOperation(weddingId);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_document_archived", { p_wedding_id: weddingId, p_document_id: documentId, p_archived: archived });
  dbError(error, "Could not update the document.");
}

/** Owners only, archived documents only: removes stored files, keeps metadata marked purged. */
export async function purgeDocument(weddingId: string, documentId: string) {
  const context = await authorizeWeddingOperation(weddingId);
  if (context.membership.role !== "owner" && context.membership.role !== "co_owner") throw new AuthorizationDeniedError();
  const supabase = await createSupabaseServerClient();
  const { data: doc, error } = await supabase.from("documents").select("status").eq("wedding_id", weddingId).eq("id", documentId).maybeSingle();
  if (error) throw new Error("Could not load the document.");
  if (!doc) throw new AuthorizationDeniedError();
  if (doc.status !== "archived") throw new DocumentRuleError("Archive the document before deleting its files permanently.");
  const versions = await supabase.from("document_versions").select("object_key,status").eq("wedding_id", weddingId).eq("document_id", documentId);
  if (versions.error) throw new Error("Could not load document versions.");
  const keys = (versions.data ?? []).filter((row) => row.status !== "purged").map((row) => row.object_key);
  if (keys.length) {
    const removed = await supabase.storage.from(DOCUMENT_BUCKET).remove(keys);
    if (removed.error) throw new Error("Stored files could not be removed. Nothing was marked deleted.");
  }
  const { error: markError } = await supabase.rpc("mark_document_purged", { p_wedding_id: weddingId, p_document_id: documentId });
  dbError(markError, "Files were removed but the record could not be updated. Refresh and try again.");
}
