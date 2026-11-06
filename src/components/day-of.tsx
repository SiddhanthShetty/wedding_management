"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Select, TextInput } from "@/components/form-fields";
import { EmptyState, StageBadge } from "@/components/ui";
import { formatTime } from "@/lib/format";
import { instantToLocalDate } from "@/lib/planning/local-time";
import { dayOfView, defaultDayOfFunction, minutesLate, SEVERITY_LABELS, sortIssues } from "@/lib/planning/operations-rules";
import type { OperationsWorkspace } from "@/lib/data/operations";
import { createIssueAction, recordScheduleProgressAction } from "@/app/actions/operations";

type Data = OperationsWorkspace;
type Item = Data["items"][number];

/** Large-type wedding-day screen for a coordinator's phone. Refreshes itself every minute. */
export function DayOf({ data }: { data: Data }) {
  const router = useRouter();
  const tz = data.wedding.timezone;
  const [now, setNow] = useState(() => new Date(data.generatedAt));
  const [functionId, setFunctionId] = useState(() => defaultDayOfFunction(data.functions, instantToLocalDate(new Date(data.generatedAt), tz))?.id ?? "");
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 15_000);
    const refresh = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 60_000);
    return () => { clearInterval(tick); clearInterval(refresh); };
  }, [router]);
  const members = new Map(data.members.map((member) => [member.userId, member.name]));
  const owner = (row: { owner_user_id: string | null; owner_name: string }) => row.owner_user_id ? members.get(row.owner_user_id) ?? "Member" : row.owner_name || "No owner";
  const suppliers = new Map(data.suppliers.map((supplier) => [supplier.id, supplier]));
  const view = useMemo(() => dayOfView(data.items.filter((item) => item.function_id === functionId), now), [data.items, functionId, now]);
  const issues = sortIssues(data.issues).filter((issue) => issue.status !== "resolved" && (issue.severity === "critical" || issue.severity === "high"));

  if (!data.functions.length) return <EmptyState title="No functions yet" description="Add functions and run sheets first." />;
  return <div className="dayof">
    <header className="dayof-header">
      <div><p className="eyebrow">Day-of</p><p className="dayof-clock" aria-live="off">{formatTime(now, tz)}</p></div>
      <div className="dayof-controls">
        <Select label="Function" value={functionId} onChange={(event) => setFunctionId(event.target.value)}>{data.functions.map((fn) => <option key={fn.id} value={fn.id}>{fn.name}</option>)}</Select>
        <button type="button" className="button button-secondary" onClick={() => router.refresh()}><RefreshCw size={15} aria-hidden="true" /> Refresh</button>
      </div>
    </header>
    <p className="generated-note">Updated {formatTime(data.generatedAt, tz)}. Refreshes every minute while open; needs a connection.</p>
    {issues.length > 0 && <section aria-labelledby="dayof-issues" className="dayof-section dayof-alert">
      <h2 id="dayof-issues">Urgent issues</h2>
      <ul className="dayof-list">{issues.map((issue) => <li key={issue.id}><strong>{SEVERITY_LABELS[issue.severity]}:</strong> {issue.title} · {owner(issue)}</li>)}</ul>
    </section>}
    <section aria-labelledby="dayof-now" className="dayof-section"><h2 id="dayof-now">Now</h2>
      {view.now.length ? view.now.map((item) => <ItemCard key={item.id} item={item} emphasis data={data} now={now} owner={owner} vendorName={suppliers.get(item.supplier_id ?? "")?.name} />) : <p className="dayof-empty">Nothing is scheduled right now.</p>}</section>
    {view.late.filter((item) => !view.now.includes(item)).length > 0 && <section aria-labelledby="dayof-late" className="dayof-section"><h2 id="dayof-late">Should have started</h2>
      {view.late.filter((item) => !view.now.includes(item)).map((item) => <ItemCard key={item.id} item={item} data={data} now={now} owner={owner} vendorName={suppliers.get(item.supplier_id ?? "")?.name} />)}</section>}
    <section aria-labelledby="dayof-next" className="dayof-section"><h2 id="dayof-next">Next</h2>
      {view.next.length ? view.next.map((item) => <ItemCard key={item.id} item={item} data={data} now={now} owner={owner} vendorName={suppliers.get(item.supplier_id ?? "")?.name} />) : <p className="dayof-empty">Nothing else planned for this function.</p>}</section>
    {view.arrivals.length > 0 && <section aria-labelledby="dayof-arrivals" className="dayof-section"><h2 id="dayof-arrivals">Vendor arrivals (next 3 hours)</h2>
      <ul className="dayof-list">{view.arrivals.map((item) => { const vendor = suppliers.get(item.supplier_id ?? ""); return <li key={item.id}><strong>{formatTime(item.vendor_arrival_at!, tz)}</strong> {vendor?.name ?? "Vendor"} for {item.activity}{vendor?.contact_phone ? <> · <a className="text-link" href={`tel:${vendor.contact_phone.replace(/[^\d+]/g, "")}`}>{vendor.contact_phone}</a></> : null}</li>; })}</ul>
    </section>}
    {data.canEdit && <section className="dayof-section"><h2>Report an issue</h2>
      <ActionForm action={createIssueAction} submitLabel="Log issue" variant="primary" resetOnSuccess idempotent className="field-grid">
        <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="function_id" value={functionId} />
        <TextInput label="What's wrong?" name="title" required maxLength={200} />
        <Select label="How urgent?" name="severity" defaultValue="high">{Object.entries(SEVERITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
      </ActionForm>
    </section>}
  </div>;
}

function Hidden({ data, item, kind }: { data: Data; item: Item; kind: string }) {
  return <><input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="itemId" value={item.id} /><input type="hidden" name="version" value={item.version} /><input type="hidden" name="kind" value={kind} /></>;
}

function ItemCard({ data, item, now, owner, vendorName, emphasis }: { data: Data; item: Item; now: Date; owner: (row: { owner_user_id: string | null; owner_name: string }) => string; vendorName?: string; emphasis?: boolean }) {
  const tz = data.wedding.timezone;
  const late = minutesLate(item, now);
  return <article className={`dayof-item ${emphasis ? "is-now" : ""}`}>
    <p className="dayof-time">{formatTime(item.planned_start, tz)}–{formatTime(item.planned_end, tz)}{late ? <span className="dayof-late"> · {late} min late</span> : null}</p>
    <h3 className="dayof-activity">{item.activity}</h3>
    <p className="dayof-meta">{[item.location, owner(item), vendorName].filter(Boolean).join(" · ")}</p>
    {item.delay_note && <p className="travel-delay">{item.delay_note}</p>}
    <StageBadge kind="schedule" status={item.status} />
    {data.canEdit && <div className="dayof-quick">
      {!item.actual_start && <ActionForm action={recordScheduleProgressAction} submitLabel="Started" variant="primary" className="inline-action-form"><Hidden data={data} item={item} kind="start" /></ActionForm>}
      <ActionForm action={recordScheduleProgressAction} submitLabel="Done" variant="secondary" className="inline-action-form"><Hidden data={data} item={item} kind="done" /></ActionForm>
      <details className="dayof-delay"><summary>Running late</summary>
        <ActionForm action={recordScheduleProgressAction} submitLabel="Save delay" className="inline-action-form"><Hidden data={data} item={item} kind="delay" /><TextInput label="What happened?" name="delay_note" required maxLength={1000} /></ActionForm>
      </details>
    </div>}
  </article>;
}
