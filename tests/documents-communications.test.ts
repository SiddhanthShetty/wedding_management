import { afterEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { assumeUser, createTestDatabase, expectDenied, FUNCTION_A, FUNCTION_B, OWNER_A, OWNER_A_PARTNER, OWNER_B, READ_ONLY, SCOPED, WEDDING_A, WEDDING_B } from "./support/database";
import { detectFileType, sanitizeFilename } from "../src/lib/documents/file-type";
import { canTransition, dedupeKey, renderTemplate, selectRecipients, unknownPlaceholders } from "../src/lib/planning/communications";

const bytes = (...parts: Array<string | number[]>) => new Uint8Array(parts.flatMap((part) => typeof part === "string" ? [...new TextEncoder().encode(part)] : part));
const zip = (entries: string) => bytes([0x50, 0x4b, 0x03, 0x04], "\u0000".repeat(26), "[Content_Types].xml", entries);

describe("file type checks (pure)", () => {
  it("detects permitted types from content, not from the name", () => {
    expect(detectFileType(bytes("%PDF-1.7\n"), "contract.exe")?.mime).toBe("application/pdf");
    expect(detectFileType(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), "photo.pdf")?.mime).toBe("image/png");
    expect(detectFileType(bytes([0xff, 0xd8, 0xff, 0xe0]), "x")?.mime).toBe("image/jpeg");
    expect(detectFileType(bytes("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "), "x.webp")?.mime).toBe("image/webp");
    expect(detectFileType(zip("word/document.xml"), "menu.docx")?.extension).toBe("docx");
    expect(detectFileType(zip("xl/workbook.xml"), "budget.xlsx")?.extension).toBe("xlsx");
    expect(detectFileType(bytes("name,count\nTEST,2\n"), "list.csv")?.mime).toBe("text/csv");
  });

  it("rejects executables, arbitrary archives, markup disguised as text and binary text files", () => {
    expect(detectFileType(bytes("MZ\u0090\u0000"), "invoice.pdf")).toBeNull();
    expect(detectFileType(zip("word/document.xml"), "menu.zip")).toBeNull();
    expect(detectFileType(bytes([0x50, 0x4b, 0x03, 0x04], "evil/payload.js"), "menu.docx")).toBeNull();
    expect(detectFileType(bytes("<svg onload=alert(1)>"), "notes.txt")).toBeNull();
    expect(detectFileType(bytes("  <html><script>"), "notes.csv")).toBeNull();
    expect(detectFileType(bytes("abc", [0], "def"), "notes.txt")).toBeNull();
    expect(detectFileType(bytes([0xc3, 0x28]), "notes.txt")).toBeNull();
    expect(detectFileType(new Uint8Array(), "empty.pdf")).toBeNull();
  });

  it("keeps filenames as safe display text with the detected extension", () => {
    const pdf = detectFileType(bytes("%PDF-1.4"), "x.pdf")!;
    expect(sanitizeFilename("../../etc/passwd", pdf)).toBe("passwd.pdf");
    expect(sanitizeFilename("C:\\Users\\me\\Quote.exe", pdf)).toBe("Quote.pdf");
    expect(sanitizeFilename("invoice\u202Efdp.exe", pdf)).toBe("invoicefdp.pdf");
    expect(sanitizeFilename("   ", pdf)).toBe("document.pdf");
  });
});

describe("message preparation rules (pure)", () => {
  it("renders known placeholders, marks missing values and reports unknown ones", () => {
    expect(renderTemplate("Hi {{ first_name }}, see you at {{venue}}. {{rsvp_link}}", { first_name: "Asha", venue: "" })).toBe("Hi Asha, see you at [venue missing]. {{rsvp_link}}");
    expect(unknownPlaceholders("{{guest_name}} {{rsvp_link}} {{rsvp_link}}")).toEqual(["rsvp_link"]);
  });

  it("excludes people who responded, were withdrawn or were already messaged with this template", () => {
    const guests = ["g1", "g2", "g3", "g4", "g5"].map((id) => ({ id, full_name: id, email: id === "g5" ? "" : `${id}@example.test`, phone: "", household_id: null }));
    const invitations = [
      { id: "i1", guest_id: "g1", function_id: "f", status: "invited" as const },
      { id: "i2", guest_id: "g2", function_id: "f", status: "invited" as const },
      { id: "i3", guest_id: "g3", function_id: "f", status: "withdrawn" as const },
      { id: "i4", guest_id: "g4", function_id: "f", status: "invited" as const },
      { id: "i5", guest_id: "g5", function_id: "f", status: "invited" as const },
    ];
    const reminder = selectRecipients({ kind: "reminder", functionId: "f", functionCancelled: false, templateId: "t", guests, invitations, respondedInvitationIds: new Set(["i2"]),
      records: [{ guest_id: "g4", function_id: "f", template_id: "t", state: "sent" }, { guest_id: "g1", function_id: "f", template_id: "t", state: "drafted" }] });
    expect(Object.fromEntries(reminder.map((row) => [row.guestId, row.reason]))).toEqual({
      g1: "Needs this message", g2: "Already responded", g3: "No longer invited", g4: "Already marked sent for this template", g5: "Needs this message · no email or phone on record",
    });
    const invite = selectRecipients({ kind: "invitation", functionId: "f", functionCancelled: false, templateId: "other", guests, invitations, respondedInvitationIds: new Set(["i2"]), records: [] });
    expect(invite.filter((row) => row.included).map((row) => row.guestId)).toEqual(["g1", "g2", "g4", "g5"]);
    expect(selectRecipients({ kind: "update", functionId: "f", functionCancelled: true, templateId: null, guests, invitations, respondedInvitationIds: new Set(), records: [] }).every((row) => !row.included)).toBe(true);
  });

  it("never lets a manual record claim provider delivery", () => {
    expect(canTransition("drafted", "sent", true)).toBe(true);
    expect(canTransition("drafted", "queued", true)).toBe(false);
    expect(canTransition("sent", "provider_confirmed", true)).toBe(false);
    expect(canTransition("sent", "provider_confirmed", false)).toBe(true);
    expect(canTransition("sent", "drafted", true)).toBe(false);
    expect(canTransition("failed", "drafted", true)).toBe(true);
    expect(dedupeKey({ templateId: "t", templateVersion: 2, guestId: "g", functionId: "f" })).toBe("msg:t:2:f:g");
  });
});

describe("document database rules", () => {
  let db: PGlite;
  afterEach(async () => { await db.close(); });
  const sha = "a".repeat(64);
  const begin = (weddingId: string, entityType: string, entityId: string | null, documentId: string | null = null) =>
    db.query<{ data: { document_id: string; version_id: string; object_key: string; version_number: number } }>("select public.begin_document_upload($1,$2,$3::public.document_entity,$4,'TEST contract','contract','contract.pdf','application/pdf',1200,$5) data", [weddingId, documentId, entityType, entityId, sha]);

  it("ties uploads to the entity's module, rejects cross-wedding entities and versions documents", async () => {
    db = await createTestDatabase({ storage: true });
    await assumeUser(db, OWNER_A);
    const first = (await begin(WEDDING_A, "function", FUNCTION_A)).rows[0]!.data;
    expect(first.object_key).toBe(`${WEDDING_A}/${first.document_id}/${first.version_id}`);
    await expectDenied(begin(WEDDING_A, "function", FUNCTION_B), /does not exist in this wedding/);
    await expectDenied(begin(WEDDING_A, "supplier", FUNCTION_A), /does not exist in this wedding/);
    await db.query("select public.finish_document_upload($1,$2,true)", [WEDDING_A, first.version_id]);
    const second = (await begin(WEDDING_A, "function", FUNCTION_A, first.document_id)).rows[0]!.data;
    expect(second.version_number).toBe(2);
    await assumeUser(db, SCOPED); // planning edit, logistics read, no supplier access
    await begin(WEDDING_A, "wedding", null);
    await expectDenied(begin(WEDDING_A, "supplier", "a3000000-0000-4000-8000-000000000001"), /Edit permission/);
    await expectDenied(db.query("select public.finish_document_upload($1,$2,true)", [WEDDING_A, second.version_id]), /Edit permission/);
    await assumeUser(db, READ_ONLY);
    expect((await db.query("select id from public.documents")).rows.length).toBeGreaterThan(0);
    await expectDenied(begin(WEDDING_A, "function", FUNCTION_A), /Edit permission/);
    await expectDenied(db.query("insert into public.documents(wedding_id,entity_type,title,created_by_user_id) values($1,'wedding','Direct',$2)", [WEDDING_A, READ_ONLY]), /permission denied/);
    await assumeUser(db, OWNER_B);
    expect((await db.query("select id from public.documents")).rows).toHaveLength(0);
    expect((await db.query("select id from public.document_versions")).rows).toHaveLength(0);
    await expectDenied(begin(WEDDING_A, "wedding", null), /Edit permission/);
    await expectDenied(begin(WEDDING_B, "function", FUNCTION_A), /does not exist in this wedding/);
  });

  it("only lets storage objects be written for pending versions and read when available and authorised", async () => {
    db = await createTestDatabase({ storage: true });
    await assumeUser(db, OWNER_A);
    const reserved = (await begin(WEDDING_A, "function", FUNCTION_A)).rows[0]!.data;
    const putObject = (name: string) => db.query("insert into storage.objects(bucket_id,name) values('wedding-documents',$1)", [name]);
    await expectDenied(putObject(`${WEDDING_A}/${reserved.document_id}/${crypto.randomUUID()}`));
    await putObject(reserved.object_key);
    expect((await db.query("select name from storage.objects")).rows).toHaveLength(0); // pending is not readable yet
    await db.query("select public.finish_document_upload($1,$2,true)", [WEDDING_A, reserved.version_id]);
    expect((await db.query("select name from storage.objects")).rows).toHaveLength(1);
    await assumeUser(db, OWNER_A_PARTNER);
    expect((await db.query("select name from storage.objects")).rows).toHaveLength(1);
    await expectDenied(putObject(reserved.object_key)); // no longer pending
    await assumeUser(db, OWNER_B);
    expect((await db.query("select name from storage.objects")).rows).toHaveLength(0);
    expect((await db.query("delete from storage.objects returning name")).rows).toHaveLength(0);
    await assumeUser(db, SCOPED); // planning edit is not owner: cannot purge
    await db.query("select public.set_document_archived($1,$2,true)", [WEDDING_A, reserved.document_id]);
    expect((await db.query("delete from storage.objects returning name")).rows).toHaveLength(0);
    await expectDenied(db.query("select public.mark_document_purged($1,$2)", [WEDDING_A, reserved.document_id]), /Only an owner/);
    await assumeUser(db, OWNER_A);
    expect((await db.query("delete from storage.objects returning name")).rows).toHaveLength(1);
    await db.query("select public.mark_document_purged($1,$2)", [WEDDING_A, reserved.document_id]);
    const purged = await db.query<{ status: string }>("select status::text from public.document_versions where document_id=$1", [reserved.document_id]);
    expect(purged.rows).toEqual([{ status: "purged" }]);
  });

  it("works without the storage schema and requires archive before purge", async () => {
    db = await createTestDatabase();
    await assumeUser(db, OWNER_A);
    const reserved = (await begin(WEDDING_A, "wedding", null)).rows[0]!.data;
    await expectDenied(db.query("select public.mark_document_purged($1,$2)", [WEDDING_A, reserved.document_id]), /Archive the document/);
    await expectDenied(db.query("update public.document_versions set malware_scan_status='clean'"), /permission denied/);
  });
});

describe("communication records", () => {
  let db: PGlite;
  afterEach(async () => { await db.close(); });

  it("keeps manual records honest about delivery and enforces state rules and dedupe", async () => {
    db = await createTestDatabase();
    await assumeUser(db, OWNER_A);
    const guest = await db.query<{ id: string }>("select public.save_guest($1,null,$2::jsonb,null) id", [WEDDING_A, JSON.stringify({ household_id: null, full_name: "TEST Recipient", email: "recipient@example.test", phone: "", family_side: "shared", meal_preference: "", allergies: "", assistance_needs: "", notes: "" })]);
    const template = await db.query<{ id: string }>("insert into public.message_templates(wedding_id,kind,name,body,created_by_user_id,updated_by_user_id) values($1,'reminder','TEST reminder','Hi {{first_name}}',$2,$2) returning id", [WEDDING_A, OWNER_A]);
    const insert = (state: string, extra = "", key = "msg:test:1") => db.query<{ id: string }>(`insert into public.communication_records(wedding_id,guest_id,function_id,template_id,channel,body_snapshot,state,dedupe_key,recorded_by_user_id${extra ? "," + extra.split("=")[0] : ""}) values($1,$2,$3,$4,'email','Hi TEST',$5,$6,$7${extra ? ",$8" : ""}) returning id`, extra ? [WEDDING_A, guest.rows[0]!.id, FUNCTION_A, template.rows[0]!.id, state, key, OWNER_A, extra.split("=")[1]] : [WEDDING_A, guest.rows[0]!.id, FUNCTION_A, template.rows[0]!.id, state, key, OWNER_A]);
    await expectDenied(insert("provider_confirmed"));
    await expectDenied(insert("queued"));
    await expectDenied(insert("sent")); // sent needs sent_at
    const draft = (await insert("drafted")).rows[0]!.id;
    await expectDenied(insert("drafted"), /duplicate key/);
    await expectDenied(db.query("update public.communication_records set state='failed' where id=$1", [draft])); // needs a reason
    await db.query("update public.communication_records set state='sent',sent_at=now() where id=$1", [draft]);
    await expectDenied(db.query("update public.communication_records set state='drafted',sent_at=null where id=$1", [draft]), /cannot move from sent to drafted/);
    await expectDenied(db.query("update public.communication_records set body_snapshot='Edited' where id=$1", [draft]), /Only drafts/);
    await expectDenied(db.query("update public.communication_records set state='provider_confirmed',provider_message_id='x',provider_status_at=now() where id=$1", [draft]));
    // Members can only record their own manual actions.
    await expectDenied(db.query("insert into public.communication_records(wedding_id,guest_id,channel,body_snapshot,dedupe_key,recorded_by_user_id) values($1,$2,'email','x','msg:other:1',$3)", [WEDDING_A, guest.rows[0]!.id, OWNER_A_PARTNER]));
    await assumeUser(db, SCOPED); // no guest-module access
    expect((await db.query("select id from public.communication_records")).rows).toHaveLength(0);
    await expectDenied(db.query("select * from public.get_guest_function_references($1)", [WEDDING_A]));
    await assumeUser(db, OWNER_B);
    expect((await db.query("select id from public.message_templates")).rows).toHaveLength(0);
    await assumeUser(db, OWNER_A);
    expect((await db.query("select id from public.get_guest_function_references($1)", [WEDDING_A])).rows.length).toBeGreaterThan(0);
  });
});
