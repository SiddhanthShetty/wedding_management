"use client";
import { formatMoney } from "@/lib/planning/money";
import { supplierIdsWithExpiringItems } from "@/lib/planning/dashboard";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Phone, Plus, Scale, Search, Wallet } from "lucide-react";
import {
  addSupplierAvailabilityAction, addSupplierFollowUpTaskAction, addSupplierSpaceAction,
  addSupplierVisitAction, createSupplierAction, createSupplierQuoteAction,
  saveSupplierPreferenceAction, updateSupplierSpaceAction, updateSupplierAction,
  type SupplierFormState,
} from "@/app/actions/suppliers";
import { Button, Card, EmptyState, NotificationRegion, PageHeading, StageBadge } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import type { SupplierAssignee, WeddingSupplier } from "@/lib/data/suppliers";
import { compareSuppliers, filterSuppliers } from "@/lib/planning/supplier-rules";
import { callLink, latestQuoteTotal, needsBudgetEntry, VENDOR_CATEGORIES, whatsAppLink } from "@/lib/planning/vendor-rules";
import { saveBookingAction } from "@/app/actions/finance";
import { QuickUpload } from "@/components/quick-upload";
import type { RecordFile } from "@/lib/data/documents";

type SupplierAction = (previous: SupplierFormState, formData: FormData) => Promise<SupplierFormState>;

const statusLabel: Record<WeddingSupplier["status"], string> = {
  researching: "Researching", contacted: "Contacted", visit_planned: "Visit planned", shortlisted: "Shortlisted",
  selected: "Selected", booked: "Booked", rejected: "Rejected", archived: "Archived",
};

function dateLabel(value: string | null) {
  if (!value) return "Unknown";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function moneyLabel(amount: number | null, currency: string) {
  return amount === null ? `Not provided · ${currency}` : formatMoney(amount.toFixed(2), currency);
}

export function SupplierManager({
  weddingId, currentUserId, suppliers, assignees, canEdit, canPlan, today, initialExpiringOnly = false, suppliersInBudget = [], files = [], currency = "INR", initialQuery = "", initialAdd = false,
}: {
  initialQuery?: string;
  initialAdd?: boolean;
  suppliersInBudget?: string[];
  files?: RecordFile[];
  currency?: string;
  weddingId: string;
  currentUserId: string;
  suppliers: WeddingSupplier[];
  assignees: SupplierAssignee[];
  canEdit: boolean;
  canPlan: boolean;
  today: string;
  initialExpiringOnly?: boolean;
}) {
  const [expiringOnly, setExpiringOnly] = useState(initialExpiringOnly);
  const expiringIds = supplierIdsWithExpiringItems(suppliers, today);
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [shortlistOnly, setShortlistOnly] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [editorSupplier, setEditorSupplier] = useState<WeddingSupplier | undefined>();
  const [editorOpen, setEditorOpen] = useState(initialAdd && canEdit);
  const [notice, setNotice] = useState("");

  const filtered = filterSuppliers(suppliers, { query, status, category, shortlistOnly }).filter((supplier) => !expiringOnly || expiringIds.has(supplier.id));
  const selected = filtered.filter((supplier) => compareIds.includes(supplier.id));
  const categories = [...new Set(suppliers.map((supplier) => supplier.category))].sort((a, b) => a.localeCompare(b));
  const inBudget = new Set(suppliersInBudget);

  function toggleCompare(id: string) {
    setCompareIds((current) => current.includes(id)
      ? current.filter((candidate) => candidate !== id)
      : current.length < 3 ? [...current, id] : current);
  }

  return <>
    <PageHeading eyebrow="Venues and vendors" title="Venues & Vendors" description="Everyone you're considering or have booked: call or WhatsApp them, keep their quotes and files, and add them to the budget once booked." action={canEdit ? <Button onClick={() => { setEditorSupplier(undefined); setEditorOpen(true); }}><Plus size={15} aria-hidden="true" /> Add venue or vendor</Button> : undefined} />
    <div className="section-stack">
      <Card title="Your list" subtitle={`${suppliers.length} venue${suppliers.length === 1 ? "" : "s"} and vendor${suppliers.length === 1 ? "" : "s"}`}>
        <div className="supplier-toolbar">
          <div className="field supplier-search"><label className="field-label" htmlFor="supplier-search">Search</label><div className="input-wrap"><Search size={15} aria-hidden="true" /><input id="supplier-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, category, contact or source" /></div></div>
          <div className="field"><label className="field-label" htmlFor="supplier-status-filter">Status</label><select id="supplier-status-filter" className="field-control" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div className="field"><label className="field-label" htmlFor="supplier-category-filter">Category</label><select id="supplier-category-filter" className="field-control" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></div>
          <label className="supplier-shortlist-toggle"><input type="checkbox" checked={shortlistOnly} onChange={(event) => setShortlistOnly(event.target.checked)} /> Shortlist only</label>
          <label className="supplier-shortlist-toggle"><input type="checkbox" checked={expiringOnly} onChange={(event) => setExpiringOnly(event.target.checked)} /> Holds or quotes expiring in 14 days ({expiringIds.size})</label>
        </div>
        <p className="field-help">Tick “Compare” on up to three to see them side by side.</p>
        {filtered.length === 0
          ? <EmptyState title={suppliers.length ? "No matching suppliers" : "No suppliers yet"} description={suppliers.length ? "Change your search or filters to see other suppliers." : canEdit ? "Add a venue or vendor you're considering. Only your wedding's members can see this list." : "Nothing added yet."} />
          : <div className="supplier-list">{filtered.map((supplier) => {
            const quote = latestQuoteTotal(supplier.quotes);
            const call = callLink(supplier.contact_phone);
            const chat = whatsAppLink(supplier.contact_phone);
            const supplierFiles = files.filter((file) => file.entityId === supplier.id);
            return <article className="supplier-card" key={supplier.id}>
            <div className="supplier-card-header">
              <div><span className="eyebrow">{cardEyebrow(supplier)}</span><h2>{supplier.name}</h2>
                <p className="supplier-card-facts">{quote ? <strong>{moneyLabel(quote.amount, quote.currency)}</strong> : <span>No quote yet</span>}{supplier.contact_person && <span>{supplier.contact_person}</span>}{supplierFiles.length > 0 && <span>{supplierFiles.length} file{supplierFiles.length === 1 ? "" : "s"}</span>}</p></div>
              <StageBadge kind="supplier" status={supplier.status} />
            </div>
            <div className="supplier-card-actions">
              {call && <a className="button button-secondary" href={call}><Phone size={15} aria-hidden="true" /> Call</a>}
              {chat && <a className="button button-secondary" href={chat} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} aria-hidden="true" /> WhatsApp</a>}
              {canEdit && <Button variant="secondary" onClick={() => { setEditorSupplier(supplier); setEditorOpen(true); }}>Edit</Button>}
              <label className="supplier-compare-check"><input type="checkbox" checked={compareIds.includes(supplier.id)} onChange={() => toggleCompare(supplier.id)} disabled={!compareIds.includes(supplier.id) && compareIds.length >= 3} /> Compare</label>
            </div>
            {canEdit && needsBudgetEntry(supplier, inBudget) && <AddToBudget weddingId={weddingId} supplier={supplier} amount={quote ? quote.amount.toFixed(2) : ""} currency={quote?.currency ?? currency} />}
            <details className="supplier-details">
              <summary>Details, quotes, notes and files</summary>
              <SupplierDetails weddingId={weddingId} currentUserId={currentUserId} supplier={supplier} assignees={assignees} canEdit={canEdit} canPlan={canPlan} files={supplierFiles} />
            </details>
          </article>; })}</div>}
        {selected.length >= 2 && <ComparisonTable suppliers={selected} />}
      </Card>
    </div>
    <SupplierEditor key={editorSupplier?.id ?? "new-supplier"} open={editorOpen} weddingId={weddingId} supplier={editorSupplier} currentUserId={currentUserId} assignees={assignees} onClose={() => setEditorOpen(false)} onSaved={(message) => { setEditorOpen(false); setNotice(message); }} />
    {notice && <NotificationRegion message={notice} onDismiss={() => setNotice("")} />}
  </>;
}

/** "Vendor · Caterer", but just "Venue / hall" when the category already says venue. */
function cardEyebrow(supplier: WeddingSupplier) {
  const kind = supplier.kind === "venue" ? "Venue" : "Vendor";
  return supplier.category.toLowerCase().includes(kind.toLowerCase()) ? supplier.category : `${kind} · ${supplier.category}`;
}

function ComparisonTable({ suppliers }: { suppliers: WeddingSupplier[] }) {
  const rows = compareSuppliers(suppliers);
  return <section className="supplier-comparison" aria-labelledby="supplier-comparison-title">
    <div className="supplier-comparison-heading"><h3 id="supplier-comparison-title"><Scale size={16} aria-hidden="true" /> Side-by-side comparison</h3><p>Quote totals are shown only when provided by the supplier. Line items are not treated as a complete total.</p></div>
    <div className="table-scroll"><table className="data-table"><caption className="sr-only">Comparison of selected suppliers</caption><thead><tr><th scope="col">Detail</th>{suppliers.map((supplier) => <th scope="col" key={supplier.id}>{supplier.name}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th>{row.values.map((value, index) => <td key={suppliers[index]?.id}>{value}</td>)}</tr>)}</tbody></table></div>
  </section>;
}

/** Shown on a booked vendor that isn't in the budget yet: one tap adds the booking, with the latest quote filled in. */
function AddToBudget({ weddingId, supplier, amount: quoted, currency }: { weddingId: string; supplier: WeddingSupplier; amount: string; currency: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveBookingAction, {});
  const [amount, setAmount] = useState(quoted);
  useEffect(() => { if (state.message && !state.error) router.refresh(); }, [state, router]);
  return <form action={formAction} className="supplier-budget-prompt">
    <p><Wallet size={16} aria-hidden="true" /> <strong>{supplier.status === "booked" ? "Booked" : "Selected"}, but not in your budget yet.</strong></p>
    <input type="hidden" name="weddingId" value={weddingId} />
    <input type="hidden" name="supplierId" value={supplier.id} />
    <input type="hidden" name="label" value={supplier.name} />
    <input type="hidden" name="category" value={supplier.category} />
    <input type="hidden" name="currency" value={currency} />
    <input type="hidden" name="sourceEstimateId" value="" />
    {/* The whole amount counts for the wedding as a whole; split it across functions later on the Budget page if you want. */}
    <input type="hidden" name="allocationFunctionId" value="" />
    <input type="hidden" name="allocationAmount" value={amount} />
    <div className="supplier-budget-fields">
      <label className="field"><span className="field-label">Agreed price ({currency})</span><input className="field-control" name="amount" inputMode="decimal" placeholder="e.g. 150000" required value={amount} onChange={(event) => setAmount(event.target.value.trim())} /></label>
      <label className="field"><span className="field-label">Is the price final?</span><select className="field-control" name="status" defaultValue={supplier.status === "booked" ? "confirmed" : "tentative"}><option value="confirmed">Yes, agreed</option><option value="tentative">Not yet</option></select></label>
      <Button type="submit" disabled={pending || !amount}>{pending ? "Adding…" : "Add to budget"}</Button>
    </div>
    {state.error && <p className="field-error" role="alert">{state.error}</p>}
  </form>;
}

function SupplierDetails({ weddingId, currentUserId, supplier, assignees, canEdit, canPlan, files = [] }: {
  weddingId: string; currentUserId: string; supplier: WeddingSupplier; assignees: SupplierAssignee[]; canEdit: boolean; canPlan: boolean; files?: RecordFile[];
}) {
  const latestDateByRequestedDate = [...new Map(supplier.requested_dates.map((row) => [row.requested_date, row])).values()];
  return <div className="supplier-detail-grid">
    <section className="supplier-detail-section"><h3>Contact and source</h3>
      <dl className="supplier-facts"><Fact label="Contact person" value={supplier.contact_person} /><Fact label="Email" value={supplier.contact_email} /><Fact label="Phone" value={supplier.contact_phone} /><Fact label="Source / recommendation" value={supplier.source} /><Fact label="Notes" value={supplier.notes} /></dl>
      <div className="supplier-link-list">{supplier.website_url && <a href={supplier.website_url} target="_blank" rel="noreferrer">Open website</a>}{supplier.map_url && <a href={supplier.map_url} target="_blank" rel="noreferrer">Open map link</a>}{!supplier.website_url && !supplier.map_url && <span className="field-help">No links provided.</span>}</div>
    </section>
    <section className="supplier-detail-section"><h3>Files</h3>
      {files.length
        ? <ul className="supplier-list-compact">{files.map((file) => <li key={file.documentId}><a className="text-link" href={`/api/documents/${file.versionId}?mode=${/^(application\/pdf|image\/)/.test(file.detectedType) ? "view" : "download"}`} target="_blank" rel="noopener noreferrer">{file.title}</a></li>)}</ul>
        : <p className="field-help">No files yet. Add the quote, contract or photos here.</p>}
      {canEdit && <QuickUpload weddingId={weddingId} entityType="supplier" entityId={supplier.id} />}
      <a className="text-link" href={`/documents?entity=supplier&id=${supplier.id}`}>Manage files</a>
    </section>
    {supplier.kind === "venue" && <section className="supplier-detail-section"><h3>Venue details</h3>
      <details className="more-details"><summary>Rules, rooms, parking and more</summary>
      <dl className="supplier-facts"><Fact label="Room availability information" value={supplier.venue?.room_availability_notes} /><Fact label="Catering" value={supplier.venue?.catering_notes} /><Fact label="Outside-vendor rules" value={supplier.venue?.outside_vendor_notes} /><Fact label="Parking" value={supplier.venue?.parking_notes} /><Fact label="Accessibility" value={supplier.venue?.accessibility_notes} /><Fact label="Pet policy" value={policyLabel(supplier.venue?.pet_policy)} /><Fact label="Alcohol policy" value={policyLabel(supplier.venue?.alcohol_policy)} /><Fact label="Music policy" value={policyLabel(supplier.venue?.music_policy)} /><Fact label="Weather backup" value={supplier.venue?.weather_backup_space} /><Fact label="Weather-backup capacity" value={supplier.venue?.weather_backup_capacity === null || supplier.venue?.weather_backup_capacity === undefined ? "Unknown" : String(supplier.venue.weather_backup_capacity)} /></dl>
      </details>
      <h4>Event spaces and capacity</h4>
      {supplier.spaces.filter((space) => !space.archived_at).length
        ? <ul className="supplier-list-compact">{supplier.spaces.filter((space) => !space.archived_at).map((space) => <li key={space.id}><span><strong>{space.name}</strong> · {space.capacity === null ? "Capacity unknown" : `${space.capacity} people`}{space.notes && ` · ${space.notes}`}</span>{canEdit && <SpaceEditor weddingId={weddingId} supplierId={supplier.id} space={space} />}</li>)}</ul>
        : <p className="field-help">No event spaces recorded. Capacity is unknown until entered.</p>}
      {canEdit && <SpaceCreateForm weddingId={weddingId} supplierId={supplier.id} />}
      <h4>Requested dates and availability history</h4>
      {latestDateByRequestedDate.length
        ? <ul className="supplier-list-compact">{latestDateByRequestedDate.map((item) => <li key={item.id}><span><strong>{dateLabel(item.requested_date)}</strong> · {item.availability_status.replaceAll("_", " ")} · checked {dateLabel(item.checked_at)}{item.hold_expires_on && ` · hold until ${dateLabel(item.hold_expires_on)}`}{item.notes && ` · ${item.notes}`}</span></li>)}</ul>
        : <p className="field-help">No dates have been requested. Availability is unknown.</p>}
      {canEdit && <AvailabilityForm weddingId={weddingId} supplierId={supplier.id} />}
    </section>}
    <section className="supplier-detail-section supplier-quote-section"><h3>Quote history</h3>
      {supplier.quotes.length
        ? <div className="supplier-quote-list">{supplier.quotes.map((quote) => <article className="supplier-quote" key={quote.id}>
          <div className="supplier-quote-heading"><div><h4>Version {quote.version_number}</h4><span className="field-help">Quoted {dateLabel(quote.quoted_on)}{quote.expires_on ? ` · expires ${dateLabel(quote.expires_on)}` : " · expiry unknown"}</span></div><strong>{moneyLabel(quote.total_amount, quote.currency)}</strong></div>
          <ul>{quote.items.map((item) => <li key={item.id}>{item.label} · {item.kind}{item.amount === null ? " · amount unknown" : ` · ${quote.currency} ${item.amount.toFixed(2)}`}</li>)}</ul>
          {quote.includes && <p><strong>Includes:</strong> {quote.includes}</p>}{quote.excludes && <p><strong>Excludes:</strong> {quote.excludes}</p>}
          <span className="field-help">Quote versions are preserved; add a new version when terms change.</span>
        </article>)}</div>
        : <p className="field-help">No quotes recorded.</p>}
      {canEdit && <QuoteForm weddingId={weddingId} supplierId={supplier.id} />}
    </section>
    <section className="supplier-detail-section"><h3>Partner preference</h3>
      <p className="field-help">Each member records their own view. No response means no preference has been recorded.</p>
      {supplier.preferences.length
        ? <ul className="supplier-list-compact">{supplier.preferences.map((preference) => <li key={preference.member_user_id}><span><strong>{preference.member_name}:</strong> {preferenceLabel(preference.preference)}{preference.note && ` · ${preference.note}`}</span></li>)}</ul>
        : <p className="field-help">No partner preferences recorded.</p>}
      {canEdit ? <PreferenceForm weddingId={weddingId} supplierId={supplier.id} preference={supplier.preferences.find((item) => item.member_user_id === currentUserId)?.preference ?? ""} note={supplier.preferences.find((item) => item.member_user_id === currentUserId)?.note ?? ""} /> : <p className="field-help">Your preference is read-only.</p>}
    </section>
    <section className="supplier-detail-section"><h3>Visit notes</h3>
      {supplier.visits.length ? <ul className="supplier-list-compact">{supplier.visits.map((visit) => <li key={visit.id}><span><strong>{dateLabel(visit.visit_date)}</strong> · {visit.author_name}: {visit.notes}</span></li>)}</ul> : <p className="field-help">No visit notes recorded.</p>}
      {canEdit && <VisitForm weddingId={weddingId} supplierId={supplier.id} />}
    </section>
    <section className="supplier-detail-section"><h3>Follow-up tasks</h3>
      {supplier.follow_ups.length ? <ul className="supplier-list-compact">{supplier.follow_ups.map((task) => <li key={task.id}><span><strong>{task.title}</strong>{task.due_date && ` · due ${dateLabel(task.due_date)}`} · {task.status.replaceAll("_", " ")}</span></li>)}</ul> : <p className="field-help">No supplier follow-up tasks.</p>}
      {canEdit && canPlan && <FollowUpForm weddingId={weddingId} supplierId={supplier.id} assignees={assignees} currentUserId={currentUserId} />}
      {canEdit && !canPlan && <p className="field-help">You can’t add tasks, so follow-up tasks aren’t available to you.</p>}
      {!canEdit && <p className="field-help">You can view this but not change it. Ask the couple if you need something changed.</p>}
    </section>
  </div>;
}

function Fact({ label, value }: { label: string; value: string | number | null | undefined }) {
  const shown = value === null || value === undefined || value === "" ? "Unknown" : String(value);
  return <div><dt>{label}</dt><dd>{shown}</dd></div>;
}

function policyLabel(value?: string) {
  return ({ unknown: "Unknown", allowed: "Allowed", not_allowed: "Not allowed", conditional: "Conditional" } as Record<string, string>)[value ?? "unknown"] ?? "Unknown";
}
function preferenceLabel(value: string) { return ({ prefer: "Prefer", neutral: "Neutral", not_preferred: "Not preferred" } as Record<string, string>)[value] ?? value; }

function SupplierEditor({ open, weddingId, supplier, currentUserId, assignees, onClose, onSaved }: {
  open: boolean; weddingId: string; supplier?: WeddingSupplier; currentUserId: string; assignees: SupplierAssignee[]; onClose: () => void; onSaved: (message: string) => void;
}) {
  const router = useRouter();
  const action = supplier ? updateSupplierAction : createSupplierAction;
  const [state, formAction, pending] = useActionState(action, {});
  const [kind, setKind] = useState<"venue" | "vendor">(supplier?.kind ?? "venue");
  const lastState = useRef(state);
  useEffect(() => {
    if (state !== lastState.current && state.savedId) { lastState.current = state; onSaved(state.message ?? "Supplier saved."); router.refresh(); }
    else if (state !== lastState.current) lastState.current = state;
  }, [state, onSaved, router]);
  const value = (field: keyof NonNullable<typeof supplier>) => supplier?.[field] ?? "";
  const venue = supplier?.venue;
  const ownerOptions = assignees.some((member) => member.userId === currentUserId) ? assignees : [{ userId: currentUserId, name: "Me" }, ...assignees];
  return <Dialog open={open} className="planning-editor-dialog" titleId="supplier-editor-title" descriptionId="supplier-editor-description" onClose={onClose}>
    <h2 id="supplier-editor-title" className="dialog-title">{supplier ? `Edit ${supplier.name}` : "Add a venue or vendor"}</h2>
    <p id="supplier-editor-description" className="dialog-copy">Only the name and category are needed. Add the rest whenever you have it.</p>
    <form action={formAction} className="function-editor-form">
      <input type="hidden" name="weddingId" value={weddingId} />{supplier && <input type="hidden" name="supplierId" value={supplier.id} />}
      <div className="field-grid">
        <label className="field"><span className="field-label">Type</span><select className="field-control" name="kind" value={kind} onChange={(event) => setKind(event.target.value as "venue" | "vendor")}><option value="venue">Venue</option><option value="vendor">Vendor</option></select></label>
        <label className="field"><span className="field-label">Status</span><select className="field-control" name="status" defaultValue={supplier?.status ?? "researching"}>{Object.entries(statusLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><span className="field-help">Once it&apos;s Booked, you can add it to the budget from its card.</span></label>
        <label className="field"><span className="field-label">Name *</span><input className="field-control" name="name" required maxLength={200} defaultValue={String(value("name"))} /></label>
        <label className="field"><span className="field-label">Category *</span><input className="field-control" name="category" required maxLength={120} list="vendor-categories" placeholder="Choose or type, e.g. Caterer" defaultValue={String(value("category"))} /><datalist id="vendor-categories">{VENDOR_CATEGORIES.map((item) => <option key={item} value={item} />)}</datalist></label>
        <label className="field"><span className="field-label">Contact person</span><input className="field-control" name="contactPerson" maxLength={160} defaultValue={String(value("contact_person"))} /></label>
        <label className="field"><span className="field-label">Contact email</span><input className="field-control" type="email" name="contactEmail" maxLength={254} defaultValue={String(value("contact_email"))} /></label>
        <label className="field"><span className="field-label">Phone or WhatsApp</span><input className="field-control" type="tel" name="contactPhone" maxLength={80} placeholder="98450 12345" defaultValue={String(value("contact_phone"))} /><span className="field-help">Indian numbers can be typed without +91.</span></label>
        <label className="field"><span className="field-label">Responsible partner</span><select className="field-control" name="responsibleUserId" defaultValue={String(value("responsible_user_id"))}><option value="">Unassigned</option>{ownerOptions.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select></label>
        <label className="field"><span className="field-label">Website link</span><input className="field-control" type="url" name="websiteUrl" inputMode="url" maxLength={2048} placeholder="https://…" defaultValue={String(value("website_url"))} /></label>
        <label className="field"><span className="field-label">Map link</span><input className="field-control" type="url" name="mapUrl" inputMode="url" maxLength={2048} placeholder="https://…" defaultValue={String(value("map_url"))} /></label>
        <label className="field field-full"><span className="field-label">Source or recommendation</span><input className="field-control" name="source" maxLength={1000} defaultValue={String(value("source"))} /></label>
        <label className="field field-full"><span className="field-label">Notes</span><textarea className="field-control" name="notes" maxLength={10000} defaultValue={String(value("notes"))} /></label>
      </div>
      {kind === "venue" && <details className="more-details"><summary>Venue details (optional): rooms, catering, parking, rules</summary><fieldset className="supplier-venue-fields"><legend className="sr-only">Venue details</legend>
        <div className="field-grid">
          <label className="field field-full"><span className="field-label">Room availability information</span><textarea className="field-control" name="roomAvailabilityNotes" maxLength={5000} defaultValue={venue?.room_availability_notes ?? ""} /></label>
          <label className="field"><span className="field-label">Catering</span><textarea className="field-control" name="cateringNotes" maxLength={5000} defaultValue={venue?.catering_notes ?? ""} /></label>
          <label className="field"><span className="field-label">Outside-vendor rules</span><textarea className="field-control" name="outsideVendorNotes" maxLength={5000} defaultValue={venue?.outside_vendor_notes ?? ""} /></label>
          <label className="field"><span className="field-label">Parking</span><textarea className="field-control" name="parkingNotes" maxLength={5000} defaultValue={venue?.parking_notes ?? ""} /></label>
          <label className="field"><span className="field-label">Accessibility</span><textarea className="field-control" name="accessibilityNotes" maxLength={5000} defaultValue={venue?.accessibility_notes ?? ""} /></label>
          <PolicySelect label="Pet policy" name="petPolicy" value={venue?.pet_policy ?? "unknown"} />
          <PolicySelect label="Alcohol policy" name="alcoholPolicy" value={venue?.alcohol_policy ?? "unknown"} />
          <PolicySelect label="Music policy" name="musicPolicy" value={venue?.music_policy ?? "unknown"} />
          <label className="field"><span className="field-label">Weather-backup space</span><input className="field-control" name="weatherBackupSpace" maxLength={200} defaultValue={venue?.weather_backup_space ?? ""} /></label>
          <label className="field"><span className="field-label">Weather-backup capacity</span><input className="field-control" type="number" min="0" step="1" name="weatherBackupCapacity" defaultValue={venue?.weather_backup_capacity ?? ""} /></label>
        </div>
      </fieldset></details>}
      {state.error && <p className="auth-alert" role="alert">{state.error}</p>}
      <div className="dialog-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button></div>
    </form>
  </Dialog>;
}

function PolicySelect({ label, name, value }: { label: string; name: string; value: string }) {
  return <label className="field"><span className="field-label">{label}</span><select className="field-control" name={name} defaultValue={value}><option value="unknown">Unknown</option><option value="allowed">Allowed</option><option value="not_allowed">Not allowed</option><option value="conditional">Conditional</option></select></label>;
}

function ActionForm({ action, weddingId, children, submitLabel, className = "", resetOnSuccess = true, onSuccess }: {
  action: SupplierAction; weddingId: string; children: ReactNode; submitLabel: string; className?: string; resetOnSuccess?: boolean; onSuccess?: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const previous = useRef<SupplierFormState | undefined>(undefined);
  const [state, formAction, pending] = useActionState(action, {});
  useEffect(() => {
    if (state !== previous.current && state.message) {
      previous.current = state;
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.();
      router.refresh();
    } else if (state !== previous.current) previous.current = state;
  }, [state, router, resetOnSuccess, onSuccess]);
  return <form ref={formRef} action={formAction} className={`supplier-mini-form ${className}`}>
    <input type="hidden" name="weddingId" value={weddingId} />
    {children}
    {state.error && <p className="field-error" role="alert">{state.error}</p>}
    <div className="supplier-form-footer"><Button type="submit" variant="secondary" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>{state.message && <span className="field-help" role="status">{state.message}</span>}</div>
  </form>;
}

function SpaceCreateForm({ weddingId, supplierId }: { weddingId: string; supplierId: string }) {
  return <ActionForm action={addSupplierSpaceAction} weddingId={weddingId} submitLabel="Add event space" className="supplier-inline-form">
    <input type="hidden" name="supplierId" value={supplierId} />
    <label className="field"><span className="field-label">Space name</span><input className="field-control" name="name" required maxLength={160} /></label>
    <label className="field"><span className="field-label">Capacity</span><input className="field-control" name="capacity" type="number" min="0" step="1" placeholder="Unknown" /></label>
    <label className="field"><span className="field-label">Notes</span><input className="field-control" name="notes" maxLength={3000} /></label>
  </ActionForm>;
}

function SpaceEditor({ weddingId, supplierId, space }: { weddingId: string; supplierId: string; space: WeddingSupplier["spaces"][number] }) {
  const [editing, setEditing] = useState(false);
  if (!editing) return <Button variant="quiet" onClick={() => setEditing(true)} aria-label={`Edit ${space.name}`}>Edit</Button>;
  return <div className="supplier-space-edit"><ActionForm action={updateSupplierSpaceAction} weddingId={weddingId} submitLabel="Save space" className="supplier-inline-form">
    <input type="hidden" name="supplierId" value={supplierId} /><input type="hidden" name="spaceId" value={space.id} />
    <label className="field"><span className="field-label">Space name</span><input className="field-control" name="name" required defaultValue={space.name} /></label>
    <label className="field"><span className="field-label">Capacity</span><input className="field-control" name="capacity" type="number" min="0" step="1" defaultValue={space.capacity ?? ""} /></label>
    <label className="field"><span className="field-label">Notes</span><input className="field-control" name="notes" defaultValue={space.notes} /></label>
  </ActionForm><ActionForm action={updateSupplierSpaceAction} weddingId={weddingId} submitLabel="Archive space" className="supplier-inline-form"><input type="hidden" name="supplierId" value={supplierId} /><input type="hidden" name="spaceId" value={space.id} /><input type="hidden" name="archive" value="true" /><input type="hidden" name="name" value={space.name} /><input type="hidden" name="capacity" value={space.capacity ?? ""} /><input type="hidden" name="notes" value={space.notes} /></ActionForm><Button variant="quiet" onClick={() => setEditing(false)}>Close editor</Button></div>;
}

function AvailabilityForm({ weddingId, supplierId }: { weddingId: string; supplierId: string }) {
  return <details className="supplier-add-form"><summary>Record a requested date or availability check</summary><ActionForm action={addSupplierAvailabilityAction} weddingId={weddingId} submitLabel="Save date check">
    <input type="hidden" name="supplierId" value={supplierId} />
    <div className="field-grid">
      <label className="field"><span className="field-label">Requested date</span><input className="field-control" type="date" name="requestedDate" required /></label>
      <label className="field"><span className="field-label">Availability</span><select className="field-control" name="availabilityStatus"><option value="unknown">Unknown</option><option value="requested">Requested</option><option value="available">Available</option><option value="unavailable">Unavailable</option><option value="on_hold">On hold</option></select></label>
      <label className="field"><span className="field-label">Date checked</span><input className="field-control" type="date" name="checkedAt" /></label>
      <label className="field"><span className="field-label">Hold expires on</span><input className="field-control" type="date" name="holdExpiresOn" /></label>
      <label className="field field-full"><span className="field-label">Availability notes</span><input className="field-control" name="notes" maxLength={3000} /></label>
    </div>
    <p className="field-help">Available, unavailable and on-hold statuses require a check date. Each check is preserved as history.</p>
  </ActionForm></details>;
}

function QuoteForm({ weddingId, supplierId }: { weddingId: string; supplierId: string }) {
  const [items, setItems] = useState([{ kind: "service", label: "", amount: "" }]);
  return <details className="supplier-add-form"><summary>Add quote version</summary><ActionForm action={createSupplierQuoteAction} weddingId={weddingId} submitLabel="Save new quote version" onSuccess={() => setItems([{ kind: "service", label: "", amount: "" }])}>
    <input type="hidden" name="supplierId" value={supplierId} />
    <div className="field-grid">
      <label className="field"><span className="field-label">Quoted on</span><input className="field-control" type="date" name="quotedOn" required /></label>
      <label className="field"><span className="field-label">Currency</span><input className="field-control" name="currency" required maxLength={3} pattern="[A-Z]{3}" placeholder="EUR" /></label>
      <label className="field"><span className="field-label">Supplier-stated total</span><input className="field-control" name="totalAmount" type="number" min="0" step="0.01" placeholder="Not provided" /></label>
      <label className="field"><span className="field-label">Expires on</span><input className="field-control" type="date" name="expiresOn" /></label>
      <label className="field"><span className="field-label">Inclusions</span><textarea className="field-control" name="includes" maxLength={10000} /></label>
      <label className="field"><span className="field-label">Exclusions</span><textarea className="field-control" name="excludes" maxLength={10000} /></label>
    </div>
    <fieldset className="supplier-quote-items"><legend>Line items</legend>{items.map((item, index) => <div className="field-grid supplier-quote-item" key={index}>
      <label className="field"><span className="field-label">Type</span><select className="field-control" name="itemKind" value={item.kind} onChange={(event) => setItems((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, kind: event.target.value } : row))}><option value="service">Service</option><option value="tax">Tax</option><option value="additional">Additional charge</option></select></label>
      <label className="field"><span className="field-label">Description</span><input className="field-control" name="itemLabel" required maxLength={200} value={item.label} onChange={(event) => setItems((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, label: event.target.value } : row))} /></label>
      <label className="field"><span className="field-label">Amount</span><input className="field-control" type="number" name="itemAmount" min="0" step="0.01" placeholder="Unknown" value={item.amount} onChange={(event) => setItems((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, amount: event.target.value } : row))} /></label>
      {items.length > 1 && <Button type="button" variant="quiet" onClick={() => setItems((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} aria-label={`Remove line item ${index + 1}`}>Remove line</Button>}
    </div>)}
      <Button type="button" variant="quiet" onClick={() => setItems((rows) => [...rows, { kind: "service", label: "", amount: "" }])} disabled={items.length >= 10}>Add line item</Button>
    </fieldset>
    <p className="field-help">Blank amounts remain unknown. The stated total is stored separately and never inferred from possibly incomplete line items.</p>
  </ActionForm></details>;
}

function PreferenceForm({ weddingId, supplierId, preference, note }: { weddingId: string; supplierId: string; preference: string; note: string }) {
  return <ActionForm action={saveSupplierPreferenceAction} weddingId={weddingId} submitLabel="Save my preference" className="supplier-inline-form" resetOnSuccess={false}>
    <input type="hidden" name="supplierId" value={supplierId} />
    <label className="field"><span className="field-label">Your preference</span><select className="field-control" name="preference" required defaultValue={preference}><option value="">No preference recorded</option><option value="prefer">Prefer</option><option value="neutral">Neutral</option><option value="not_preferred">Not preferred</option></select></label>
    <label className="field"><span className="field-label">Note</span><input className="field-control" name="note" maxLength={2000} defaultValue={note} /></label>
  </ActionForm>;
}

function VisitForm({ weddingId, supplierId }: { weddingId: string; supplierId: string }) {
  return <details className="supplier-add-form"><summary>Add visit note</summary><ActionForm action={addSupplierVisitAction} weddingId={weddingId} submitLabel="Save visit note">
    <input type="hidden" name="supplierId" value={supplierId} />
    <label className="field"><span className="field-label">Visit date</span><input className="field-control" type="date" name="visitDate" /></label>
    <label className="field"><span className="field-label">Notes</span><textarea className="field-control" name="notes" required maxLength={10000} /></label>
  </ActionForm></details>;
}

function FollowUpForm({ weddingId, supplierId, assignees, currentUserId }: { weddingId: string; supplierId: string; assignees: SupplierAssignee[]; currentUserId: string }) {
  return <details className="supplier-add-form"><summary>Create follow-up task</summary><ActionForm action={addSupplierFollowUpTaskAction} weddingId={weddingId} submitLabel="Create task">
    <input type="hidden" name="supplierId" value={supplierId} />
    <label className="field"><span className="field-label">Task title</span><input className="field-control" name="title" required maxLength={200} /></label>
    <label className="field"><span className="field-label">Description</span><textarea className="field-control" name="description" maxLength={10000} /></label>
    <div className="field-grid">
      <label className="field"><span className="field-label">Owner</span><select className="field-control" name="ownerUserId" defaultValue={currentUserId}><option value="">Unassigned</option>{assignees.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select></label>
      <label className="field"><span className="field-label">Due date</span><input className="field-control" type="date" name="dueDate" /></label>
      <label className="field"><span className="field-label">Priority</span><select className="field-control" name="priority"><option value="normal">Normal</option><option value="low">Low</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
    </div>
  </ActionForm></details>;
}
