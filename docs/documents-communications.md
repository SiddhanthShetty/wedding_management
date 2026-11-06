# Documents & Messages

**Routes:** `/documents`, `/messages`, `POST /api/documents` (upload), `GET /api/documents/<versionId>?mode=view|download`.
**Migration:** `supabase/migrations/20261106120000_documents_communications.sql` (additive). It also adds `get_guest_function_references` so guest-module members can see function names.

## Documents

**Attach to:** the whole wedding, functions, venues/vendors, quotes, bookings, payments/refunds, guest households, schedule items and arrangements. A document belongs to exactly one record, cannot be moved, and the database checks that the record exists **in the same wedding**.

**Who can see and change what:** access follows the module that owns the record.

| Record | Module |
| --- | --- |
| Venue/vendor, quote, booking, payment/refund | suppliers_finance |
| Function, whole wedding | planning |
| Guest household | guests |
| Schedule item, arrangement | logistics |

Read access to the module lets you list and open a document; edit access lets you upload versions and archive it. RLS enforces this on `documents`, `document_versions` and the storage bucket.

**Upload pipeline** (`src/lib/data/documents.ts`):

1. Same-origin POST only. Bodies over 8 MB (plus multipart overhead) are refused before parsing. Next.js buffers proxy bodies up to 10 MB, so the 8 MB limit stays under that ceiling.
2. The member's edit access to the record's module is checked.
3. The type is **detected from the file's bytes**. The browser's MIME type is ignored, and the filename extension only matters where the content format needs it (Office files, text). Allowed: PDF, PNG, JPEG, WebP, .docx, .xlsx, UTF-8 .txt/.csv. HTML, SVG, XML, scripts, executables and plain ZIPs are rejected, and markup disguised as .txt/.csv is refused.
4. The filename is cleaned for display (no path parts, control or bidi characters) and given the extension of the detected type. Object keys are opaque: `<wedding>/<document>/<version>`.
5. `begin_document_upload` re-checks permission and the record, then reserves a `pending` version.
6. Storage accepts the object only if a pending version for exactly that key was reserved by the same user with edit access.
7. `finish_document_upload` marks the version `available`, or `failed` if storage rejected it. A failed upload never shows success.

**Viewing and downloading:** the route authorizes the member, confirms through RLS that the version is readable and available, and redirects (303) to a **60-second** signed URL on the storage origin. Only PDFs and raster images may open inline; all other types are forced to download with the cleaned filename. Responses are `no-store` and `no-referrer`. A missing document and a forbidden one return the same 404, so IDs from other weddings reveal nothing.

**Malware scanning:** not available. Every version stores `malware_scan_status = 'not_scanned'` (the only allowed value until a scanner exists), and the UI says “not malware-scanned”. Uploads are never described as safe or verified.

**Versioning and deletion rules:**

- New uploads to a document create version n+1. Earlier versions stay downloadable.
- Editors **archive** a document (hidden from the active list, restorable).
- Owners/co-owners can **permanently delete files** from an archived document: storage objects are removed first, then versions are marked `purged`. Metadata (title, who uploaded, sizes, hashes) is kept as history. Members cannot delete metadata rows directly.

## Messages

- **Templates** for invitations, RSVP reminders and updates, with placeholders `{{guest_name}} {{first_name}} {{household_name}} {{function_name}} {{function_date}} {{function_time}} {{venue}} {{couple_names}}`. Unknown placeholders are rejected on save. Missing values render as a visible `[venue missing]` marker, never as silent blanks. Private portal links cannot be inserted, because they are shown once and only their digests are stored.
- **Recipient preview** per template and function lists who needs the message and why anyone is excluded: function cancelled, no longer invited, already responded (reminders), or already marked sent with this template. People with no email or phone are flagged.
- **No live sending.** Members copy individual messages or export drafts as CSV (spreadsheet-formula-safe), send them themselves, then record what happened.
- **States:** `drafted`, `queued`, `sent`, `failed`, `provider_confirmed`. Manual records can only be `drafted`, `sent` (“Marked sent manually”, delivery not confirmed) or `failed` (a reason is required). `queued` and `provider_confirmed` need provider fields and are reserved for a future integration. Sent is final for manual records, and only drafts can be edited.
- **Deduplication:** one record per template version + function + guest (`dedupe_key`). Recording again is skipped and reported.
- **Permissions:** guest-module read to view, guest-module edit to change. Members can only record their own actions.

The future provider design is in [messaging-integration-design.md](./messaging-integration-design.md).

## Known limitations

- Not verified against real Supabase Storage. Bucket and storage policies are created only when the `storage` schema exists. Tests use a minimal stand-in schema, so they cover the policies but not Supabase's storage service itself.
- No virus or malware scanning. No image thumbnails or previews in the app.
- An orphaned object can remain if a stored upload's final status update fails. The version stays `pending`, is never readable, and the UI asks the user to retry.
