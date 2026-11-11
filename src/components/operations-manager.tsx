"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, ClipboardCheck, Printer, Truck, UserRound } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { TabList } from "@/components/tab-list";
import { useRememberedState } from "@/components/use-remembered";
import { Checkbox, Select, TextArea, TextInput } from "@/components/form-fields";
import { Card, EmptyState, PageHeading, StageBadge } from "@/components/ui";
import { describeStatus, statusOptions } from "@/lib/planning/status-vocabulary";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { addMinutesToLocal, defaultScheduleStart, instantToLocalInput } from "@/lib/planning/local-time";
import {
  ARRANGEMENT_LABELS, checklistProgress, minutesLate, ownerKey, scheduleWarnings,
  SEVERITY_LABELS, sortIssues, unresolvedIssueCounts, type ArrangementCategory, type IssueSeverity, type ScheduleStatus,
} from "@/lib/planning/operations-rules";
import type { OperationsWorkspace } from "@/lib/data/operations";
import {
  addChecklistLineAction, addScheduleDependencyAction, createArrangementAction, createIssueAction, createScheduleItemAction, recordScheduleProgressAction,
  removeScheduleDependencyAction, toggleChecklistLineAction, updateArrangementAction, updateIssueAction, updateScheduleItemAction,
} from "@/app/actions/operations";

export type OperationsTab = "timeline" | "vendors" | "coordinators" | "issues" | "arrangements";
type Data = OperationsWorkspace;
type Item = Data["items"][number];

const TABS: Array<{ id: OperationsTab; label: string; icon: typeof CalendarClock }> = [
  { id: "timeline", label: "Function timeline", icon: CalendarClock },
  { id: "vendors", label: "Vendor arrivals", icon: Truck },
  { id: "coordinators", label: "Coordinator view", icon: UserRound },
  { id: "issues", label: "Issues", icon: AlertTriangle },
  { id: "arrangements", label: "Things to arrange", icon: ClipboardCheck },
];

function ScheduleBadge({ status }: { status: ScheduleStatus }) { return <StageBadge kind="schedule" status={status} />; }
function SeverityBadge({ severity }: { severity: IssueSeverity }) {
  const kind = severity === "critical" || severity === "high" ? "overdue" : severity === "medium" ? "pending" : "neutral";
  return <span className={`status status-${kind}`}><span aria-hidden="true">!</span>{SEVERITY_LABELS[severity]}</span>;
}

function useLookups(data: Data) {
  return useMemo(() => {
    const memberName = new Map(data.members.map((member) => [member.userId, member.name]));
    return {
      memberName,
      functionName: new Map(data.functions.map((fn) => [fn.id, fn.name])),
      supplier: new Map(data.suppliers.map((supplier) => [supplier.id, supplier])),
      ownerLabel: (row: { owner_user_id: string | null; owner_name: string }) => row.owner_user_id ? memberName.get(row.owner_user_id) ?? "Member" : row.owner_name || "Unassigned",
    };
  }, [data]);
}

export function OperationsManager({ data, initialTab, initialFunctionId, tabFromUrl = false }: { data: Data; initialTab: OperationsTab; initialFunctionId: string | null; tabFromUrl?: boolean }) {
  const [tab, setTab] = useRememberedState<OperationsTab>("schedule-tab", initialTab, ["timeline", "vendors", "coordinators", "issues", "arrangements"], tabFromUrl);
  const lookups = useLookups(data);
  const warnings = useMemo(() => scheduleWarnings({
    items: data.items, dependencies: data.dependencies,
    functionWindows: new Map(data.functions.map((fn) => [fn.id, { starts_at: fn.starts_at, ends_at: fn.ends_at }])),
    ownerLabel: (key) => key.startsWith("member:") ? lookups.memberName.get(key.slice(7)) ?? "A member" : key.slice(5),
  }), [data, lookups]);
  const issueCounts = unresolvedIssueCounts(data.issues);
  const selectTab = (next: OperationsTab) => {
    setTab(next);
    const url = new URL(window.location.href); url.searchParams.set("tab", next); window.history.replaceState(null, "", url);
  };
  return <div className="ops-page">
    <PageHeading eyebrow="Wedding week" title="Run sheets & things to arrange"
      description="Run sheets per function, vendor arrivals, issues and supporting arrangements. Recording a delay never moves the rest of the schedule; affected items are flagged for you to review."
      action={<Link className="button button-secondary" href={`/schedule/pack${initialFunctionId ? `?function=${initialFunctionId}` : ""}`}><Printer size={15} aria-hidden="true" /> Operational pack</Link>} />
    <div className="metric-inline travel-gaps">
      <a className="metric-chip" href="/schedule?tab=issues"><strong>{issueCounts.total}</strong> unresolved issue(s){issueCounts.critical ? ` · ${issueCounts.critical} critical` : ""}</a>
      <a className="metric-chip" href="/schedule?tab=timeline"><strong>{new Set(warnings.map((warning) => warning.itemId)).size}</strong> item(s) with warnings</a>
    </div>
    <TabList tabs={TABS} selected={tab} onSelect={selectTab} label="Operations sections" idPrefix="ops" />
    {!data.canEdit && <p className="readonly-note" role="note">You can view this but not change it. Ask the couple if you need something changed.</p>}
    <section role="tabpanel" id={`ops-panel-${tab}`} aria-labelledby={`ops-tab-${tab}`} tabIndex={0} className="section-stack">
      {tab === "timeline" && <TimelinePanel data={data} lookups={lookups} warnings={warnings} initialFunctionId={initialFunctionId} />}
      {tab === "vendors" && <VendorPanel data={data} lookups={lookups} />}
      {tab === "coordinators" && <CoordinatorPanel data={data} lookups={lookups} />}
      {tab === "issues" && <IssuePanel data={data} lookups={lookups} />}
      {tab === "arrangements" && <ArrangementPanel data={data} lookups={lookups} />}
    </section>
    <p className="generated-note">Loaded {formatDateTime(data.generatedAt, data.wedding.timezone)} ({data.wedding.timezone}). This page needs a connection; offline editing is not available.</p>
  </div>;
}

type Lookups = ReturnType<typeof useLookups>;

function OwnerFields({ data, owner }: { data: Data; owner?: { owner_user_id: string | null; owner_name: string } }) {
  return <>
    <Select label="Owner (member)" name="owner_user_id" defaultValue={owner?.owner_user_id ?? ""}><option value="">Not a member / none</option>{data.members.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</Select>
    <TextInput label="Owner name (if not a member)" name="owner_name" maxLength={160} defaultValue={owner?.owner_name ?? ""} placeholder="For example the venue coordinator" />
  </>;
}

function ScheduleFields({ data, item, functionId }: { data: Data; item?: Item; functionId: string }) {
  const tz = data.wedding.timezone;
  // New items start where the function's last item ends (or at the function's start) and last an hour.
  const fn = data.functions.find((row) => row.id === functionId);
  const last = data.items.filter((row) => row.function_id === functionId && row.status !== "cancelled").at(-1);
  const suggestedStart = item ? "" : defaultScheduleStart({ lastItemEnd: last?.planned_end ?? null, functionStart: fn?.starts_at ?? null, functionDate: fn?.function_date ?? null, timezone: tz });
  return <>
    <input type="hidden" name="function_id" value={item?.function_id ?? functionId} />
    <TextInput label="Activity" name="activity" required maxLength={200} defaultValue={item?.activity} />
    <TextInput label="Location" name="location" maxLength={300} defaultValue={item?.location} />
    <TextInput label={`Planned start (${tz})`} name="planned_start" type="datetime-local" required defaultValue={item ? instantToLocalInput(item.planned_start, tz) : suggestedStart} />
    <TextInput label={`Planned end (${tz})`} name="planned_end" type="datetime-local" required defaultValue={item ? instantToLocalInput(item.planned_end, tz) : suggestedStart && addMinutesToLocal(suggestedStart, 60)} hint={item ? undefined : "Suggested: right after the previous item, for an hour."} />
    {item && <TextInput label="Actual start" name="actual_start" type="datetime-local" defaultValue={instantToLocalInput(item.actual_start, tz)} />}
    {item && <TextInput label="Actual end" name="actual_end" type="datetime-local" defaultValue={instantToLocalInput(item.actual_end, tz)} />}
    <OwnerFields data={data} owner={item} />
    <TextInput label="Backup contact" name="backup_contact" maxLength={300} defaultValue={item?.backup_contact} />
    <Select label="Linked vendor" name="supplier_id" defaultValue={item?.supplier_id ?? ""}><option value="">None</option>{data.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name} · {supplier.category}</option>)}</Select>
    <TextInput label={`Vendor arrival (${tz})`} name="vendor_arrival_at" type="datetime-local" defaultValue={instantToLocalInput(item?.vendor_arrival_at, tz)} />
    <Select label="Status" name="status" defaultValue={item?.status ?? "planned"}>{statusOptions("schedule").map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</Select>
    <TextInput label="Delay note" name="delay_note" maxLength={1000} defaultValue={item?.delay_note} hint="Required when the status is Delayed." />
    <TextArea label="Setup requirements" name="setup_requirements" maxLength={2000} defaultValue={item?.setup_requirements} />
    <TextArea label="Pack-up requirements" name="packup_requirements" maxLength={2000} defaultValue={item?.packup_requirements} />
    <TextArea label="Notes" name="notes" maxLength={2000} defaultValue={item?.notes} className="field-full" />
  </>;
}

function TimelinePanel({ data, lookups, warnings, initialFunctionId }: { data: Data; lookups: Lookups; warnings: ReturnType<typeof scheduleWarnings>; initialFunctionId: string | null }) {
  const [functionId, setFunctionId] = useState(initialFunctionId ?? data.functions[0]?.id ?? "");
  const tz = data.wedding.timezone;
  const items = data.items.filter((item) => item.function_id === functionId);
  const activity = new Map(data.items.map((item) => [item.id, item.activity]));
  if (!data.functions.length) return <Card><EmptyState title="No functions yet" description="Create functions on the Functions page, then build a run sheet for each one." /></Card>;
  return <>
    <Card>
      <Select label="Function" value={functionId} onChange={(event) => { setFunctionId(event.target.value); const url = new URL(window.location.href); url.searchParams.set("function", event.target.value); window.history.replaceState(null, "", url); }}>
        {data.functions.map((fn) => <option key={fn.id} value={fn.id}>{fn.name}{fn.starts_at ? ` · ${formatDate(fn.starts_at, tz)}` : ""}</option>)}
      </Select>
    </Card>
    {!items.length ? <Card><EmptyState title="No schedule items" description="Add the first activity for this function: arrivals, setup, ceremony moments, speeches and pack-up." /></Card> :
      <ol className="ops-timeline" aria-label="Run sheet">{items.map((item) => {
        const itemWarnings = warnings.filter((warning) => warning.itemId === item.id);
        const late = minutesLate(item);
        const vendor = item.supplier_id ? lookups.supplier.get(item.supplier_id) : null;
        const deps = data.dependencies.filter((dep) => dep.item_id === item.id);
        return <li key={item.id} className={`ops-item ${item.status === "cancelled" ? "is-muted" : ""}`}>
          <div className="ops-time"><strong>{formatTime(item.planned_start, tz)}</strong><span>– {formatTime(item.planned_end, tz)}</span>{item.actual_start && <span className="ops-actual">Actual {formatTime(item.actual_start, tz)}{item.actual_end ? `–${formatTime(item.actual_end, tz)}` : ""}</span>}</div>
          <div className="ops-body">
            <div className="ops-head"><h3 className="row-title">{item.activity}</h3><ScheduleBadge status={item.status} />{late ? <span className="status status-overdue">{late} min late</span> : null}</div>
            <p className="row-meta">{[item.location, `Owner: ${lookups.ownerLabel(item)}`, item.backup_contact && `Backup: ${item.backup_contact}`, vendor && `Vendor: ${vendor.name}`].filter(Boolean).join(" · ")}</p>
            {item.delay_note && <p className="travel-delay">{item.delay_note}</p>}
            {(item.setup_requirements || item.packup_requirements) && <p className="row-meta">{item.setup_requirements && <>Setup: {item.setup_requirements}. </>}{item.packup_requirements && <>Pack-up: {item.packup_requirements}</>}</p>}
            {deps.length > 0 && <p className="row-meta">After: {deps.map((dep) => activity.get(dep.depends_on_item_id)).join(", ")}</p>}
            {itemWarnings.length > 0 && <ul className="travel-warning">{itemWarnings.map((warning, index) => <li key={index}>{warning.message}</li>)}</ul>}
            {data.canEdit && item.status !== "cancelled" && item.status !== "done" && <div className="ops-quick">
              {!item.actual_start && <ProgressButton data={data} item={item} kind="start" label="Started now" />}
              <ProgressButton data={data} item={item} kind="done" label="Done now" />
              <ActionForm action={recordScheduleProgressAction} submitLabel="Record delay" className="inline-action-form" ariaLabel={`Record a delay for ${item.activity}`}>
                <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="itemId" value={item.id} /><input type="hidden" name="version" value={item.version} /><input type="hidden" name="kind" value="delay" />
                <TextInput label="Delay note" name="delay_note" maxLength={1000} required placeholder="Band arriving 20 min late" />
              </ActionForm>
            </div>}
            {data.canEdit && <details className="travel-edit"><summary>Edit item and dependencies</summary>
              <ActionForm action={updateScheduleItemAction} submitLabel="Save item" className="field-grid">
                <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="itemId" value={item.id} /><input type="hidden" name="version" value={item.version} />
                <ScheduleFields data={data} item={item} functionId={functionId} />
              </ActionForm>
              <div className="travel-subforms">
                {deps.map((dep) => <ActionForm key={dep.depends_on_item_id} action={removeScheduleDependencyAction} submitLabel={`Remove “after ${activity.get(dep.depends_on_item_id)}”`} variant="quiet" className="inline-action-form">
                  <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="itemId" value={item.id} /><input type="hidden" name="dependsOn" value={dep.depends_on_item_id} />
                </ActionForm>)}
                <ActionForm action={addScheduleDependencyAction} submitLabel="Add dependency" className="inline-action-form">
                  <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="itemId" value={item.id} />
                  <Select label="Must happen after" name="dependsOn" required>{data.items.filter((other) => other.id !== item.id && other.function_id === item.function_id).map((other) => <option key={other.id} value={other.id}>{other.activity}</option>)}</Select>
                </ActionForm>
              </div>
            </details>}
          </div>
        </li>;
      })}</ol>}
    {data.canEdit && functionId && <Card title="Add a schedule item" subtitle="Times are in the wedding timezone. Overlapping owners or locations produce warnings, not automatic changes.">
      <ActionForm key={`${functionId}:${items.length}`} action={createScheduleItemAction} submitLabel="Add item" resetOnSuccess idempotent className="field-grid">
        <input type="hidden" name="weddingId" value={data.wedding.id} />
        <ScheduleFields data={data} functionId={functionId} />
        {items.length > 0 && <Select label="Happens after" name="depends_on" multiple size={Math.min(5, items.length)} hint="Optional. Hold Ctrl or Cmd to choose several.">{items.map((item) => <option key={item.id} value={item.id}>{item.activity}</option>)}</Select>}
      </ActionForm>
    </Card>}
  </>;
}

function ProgressButton({ data, item, kind, label }: { data: Data; item: Item; kind: "start" | "done"; label: string }) {
  return <ActionForm action={recordScheduleProgressAction} submitLabel={label} className="inline-action-form" ariaLabel={`${label}: ${item.activity}`}>
    <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="itemId" value={item.id} /><input type="hidden" name="version" value={item.version} /><input type="hidden" name="kind" value={kind} />
  </ActionForm>;
}

function VendorPanel({ data, lookups }: { data: Data; lookups: Lookups }) {
  const tz = data.wedding.timezone;
  const rows = data.items.filter((item) => item.supplier_id && item.status !== "cancelled")
    .sort((a, b) => (a.vendor_arrival_at ?? a.planned_start).localeCompare(b.vendor_arrival_at ?? b.planned_start));
  if (!rows.length) return <Card><EmptyState title="No vendor arrivals" description="Link a vendor to a schedule item and add their arrival time to build this view." /></Card>;
  return <Card title="Vendor arrivals" subtitle="Ordered by arrival time (or planned start when no arrival time is set).">
    <div className="table-scroll"><table className="data-table"><caption className="sr-only">Vendor arrivals</caption>
      <thead><tr><th scope="col">Arrives</th><th scope="col">Vendor</th><th scope="col">Function</th><th scope="col">For</th><th scope="col">Setup / pack-up</th><th scope="col">Contact</th></tr></thead>
      <tbody>{rows.map((item) => { const vendor = lookups.supplier.get(item.supplier_id!); return <tr key={item.id}>
        <td>{item.vendor_arrival_at ? formatDateTime(item.vendor_arrival_at, tz) : <span className="table-secondary">Not set · starts {formatDateTime(item.planned_start, tz)}</span>}</td>
        <td><span className="table-primary">{vendor?.name ?? "Vendor"}</span><span className="table-secondary">{vendor?.category}</span></td>
        <td>{lookups.functionName.get(item.function_id)}</td>
        <td>{item.activity}<span className="table-secondary">{formatTime(item.planned_start, tz)}–{formatTime(item.planned_end, tz)} · {item.location}</span></td>
        <td>{[item.setup_requirements, item.packup_requirements && `Pack-up: ${item.packup_requirements}`].filter(Boolean).join(" · ") || "—"}</td>
        <td>{[vendor?.contact_person, vendor?.contact_phone].filter(Boolean).join(" · ") || "—"}</td>
      </tr>; })}</tbody></table></div>
  </Card>;
}

function CoordinatorPanel({ data, lookups }: { data: Data; lookups: Lookups }) {
  const tz = data.wedding.timezone;
  const groups = new Map<string, { label: string; items: Item[]; issues: Data["issues"]; arrangements: Data["arrangements"] }>();
  const bucket = (row: { owner_user_id: string | null; owner_name: string }) => {
    const key = ownerKey(row) ?? "unassigned";
    if (!groups.has(key)) groups.set(key, { label: key === "unassigned" ? "Unassigned" : lookups.ownerLabel(row), items: [], issues: [], arrangements: [] });
    return groups.get(key)!;
  };
  data.items.filter((item) => item.status !== "cancelled" && item.status !== "done").forEach((item) => bucket(item).items.push(item));
  data.issues.filter((issue) => issue.status !== "resolved").forEach((issue) => bucket(issue).issues.push(issue));
  data.arrangements.filter((row) => row.status !== "done" && row.status !== "cancelled").forEach((row) => bucket(row).arrangements.push(row));
  if (!groups.size) return <Card><EmptyState title="Nothing outstanding" description="Open schedule items, issues and arrangements appear here grouped by owner." /></Card>;
  return <>{[...groups.entries()].sort(([a], [b]) => Number(a === "unassigned") - Number(b === "unassigned")).map(([key, group]) => <Card key={key} title={group.label} subtitle={`${group.items.length} schedule item(s) · ${group.issues.length} open issue(s) · ${group.arrangements.length} arrangement(s)`}>
    {group.items.length > 0 && <ul className="reference-list">{group.items.map((item) => <li key={item.id} className="reference-row"><span><span className="row-title">{formatDateTime(item.planned_start, tz)} · {item.activity}</span><span className="row-meta">{lookups.functionName.get(item.function_id)} · {item.location || "No location"} · {describeStatus("schedule", item.status).text}</span></span></li>)}</ul>}
    {group.issues.length > 0 && <ul className="reference-list">{sortIssues(group.issues).map((issue) => <li key={issue.id} className="reference-row"><span><span className="row-title">{issue.title}</span><span className="row-meta">{SEVERITY_LABELS[issue.severity]} · {describeStatus("issue", issue.status).text}</span></span></li>)}</ul>}
    {group.arrangements.length > 0 && <ul className="reference-list">{group.arrangements.map((row) => <li key={row.id} className="reference-row"><span><span className="row-title">{row.title}</span><span className="row-meta">{ARRANGEMENT_LABELS[row.category]} · {describeStatus("arrangement", row.status).text}{row.due_date ? ` · due ${formatDate(`${row.due_date}T12:00:00Z`, "UTC")}` : ""}</span></span></li>)}</ul>}
  </Card>)}</>;
}

function IssuePanel({ data, lookups }: { data: Data; lookups: Lookups }) {
  const [showResolved, setShowResolved] = useState(false);
  const tz = data.wedding.timezone;
  const issues = sortIssues(data.issues).filter((issue) => showResolved || issue.status !== "resolved");
  return <>
    {data.canEdit && <Card title="Log an issue" subtitle="Anything that needs attention: late deliveries, missing items, access problems.">
      <ActionForm action={createIssueAction} submitLabel="Log issue" resetOnSuccess idempotent className="field-grid">
        <input type="hidden" name="weddingId" value={data.wedding.id} />
        <TextInput label="Issue" name="title" required maxLength={200} />
        <Select label="Severity" name="severity" defaultValue="medium">{Object.entries(SEVERITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        <Select label="Function" name="function_id" defaultValue=""><option value="">Not specific</option>{data.functions.map((fn) => <option key={fn.id} value={fn.id}>{fn.name}</option>)}</Select>
        <Select label="Schedule item" name="schedule_item_id" defaultValue=""><option value="">None</option>{data.items.map((item) => <option key={item.id} value={item.id}>{lookups.functionName.get(item.function_id)} · {item.activity}</option>)}</Select>
        <OwnerFields data={data} />
        <TextArea label="Details" name="details" maxLength={4000} className="field-full" />
      </ActionForm>
    </Card>}
    <Card title="Issue list" subtitle="Unresolved first, then by severity." action={<Checkbox label="Show resolved" checked={showResolved} onChange={(event) => setShowResolved(event.target.checked)} />}>
      {!issues.length ? <EmptyState title="No open issues" description="Logged issues appear here with their severity and owner." /> :
        <ul className="ops-issues">{issues.map((issue) => <li key={issue.id} className={`travel-guest ${issue.status === "resolved" ? "is-muted" : ""}`}>
          <div className="ops-head"><h3 className="row-title">{issue.title}</h3><SeverityBadge severity={issue.severity} /><StageBadge kind="issue" status={issue.status} /></div>
          <p className="row-meta">Owner: {lookups.ownerLabel(issue)}{issue.function_id ? ` · ${lookups.functionName.get(issue.function_id)}` : ""} · logged {formatDateTime(issue.created_at, tz)}{issue.resolved_at ? ` · resolved ${formatDateTime(issue.resolved_at, tz)}` : ""}</p>
          {issue.details && <p>{issue.details}</p>}
          {issue.resolution_note && <p className="row-meta">Resolution: {issue.resolution_note}</p>}
          {data.canEdit && <details className="travel-edit"><summary>Update issue</summary>
            <ActionForm action={updateIssueAction} submitLabel="Save issue" className="field-grid">
              <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="issueId" value={issue.id} /><input type="hidden" name="version" value={issue.version} />
              <Select label="Status" name="status" defaultValue={issue.status}>{statusOptions("issue").map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</Select>
              <Select label="Severity" name="severity" defaultValue={issue.severity}>{Object.entries(SEVERITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
              <OwnerFields data={data} owner={issue} />
              <TextArea label="Resolution note" name="resolution_note" maxLength={2000} defaultValue={issue.resolution_note} className="field-full" hint="Required to resolve." />
            </ActionForm>
          </details>}
        </li>)}</ul>}
    </Card>
  </>;
}

function ArrangementFields({ data, row }: { data: Data; row?: Data["arrangements"][number] }) {
  const tz = data.wedding.timezone;
  return <>
    <Select label="Category" name="category" defaultValue={row?.category ?? "decor"}>{Object.entries(ARRANGEMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
    <TextInput label="Title" name="title" required maxLength={200} defaultValue={row?.title} />
    <Select label="Function" name="function_id" defaultValue={row?.function_id ?? ""}><option value="">Whole wedding</option>{data.functions.map((fn) => <option key={fn.id} value={fn.id}>{fn.name}</option>)}</Select>
    <Select label="Status" name="status" defaultValue={row?.status ?? "not_started"}>{statusOptions("arrangement").map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</Select>
    <OwnerFields data={data} owner={row} />
    <Select label="Vendor" name="supplier_id" defaultValue={row?.supplier_id ?? ""}><option value="">None</option>{data.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</Select>
    <TextInput label="Due date" name="due_date" type="date" defaultValue={row?.due_date ?? ""} />
    <TextInput label={`Fitting, performance or delivery time (${tz})`} name="event_at" type="datetime-local" defaultValue={instantToLocalInput(row?.event_at, tz)} />
    <TextInput label="Quantity" name="quantity" type="number" inputMode="numeric" min={0} defaultValue={row?.quantity ?? ""} hint="For example the number of hampers." />
    <TextInput label="Reference or design link" name="reference_url" type="url" defaultValue={row?.reference_url ?? ""} placeholder="https://" hint="Links only; files can be attached once document storage is set up." />
    <TextArea label="Details" name="details" maxLength={4000} defaultValue={row?.details} className="field-full" />
  </>;
}

function ArrangementPanel({ data, lookups }: { data: Data; lookups: Lookups }) {
  const [category, setCategory] = useState<ArrangementCategory | "all">("all");
  const tz = data.wedding.timezone;
  const rows = data.arrangements.filter((row) => category === "all" || row.category === category);
  return <>
    <div className="filter-group" role="group" aria-label="Filter arrangements">
      {(["all", ...Object.keys(ARRANGEMENT_LABELS)] as Array<ArrangementCategory | "all">).map((value) => <button key={value} type="button" className={`chip ${category === value ? "is-active" : ""}`} aria-pressed={category === value} onClick={() => setCategory(value)}>{value === "all" ? "All" : ARRANGEMENT_LABELS[value]}</button>)}
    </div>
    {data.canEdit && <Card title="Add an arrangement" subtitle="Decor, outfits and fittings, ceremony materials, gifts and hampers, shot lists, music and performances.">
      <ActionForm action={createArrangementAction} submitLabel="Add arrangement" resetOnSuccess idempotent className="field-grid">
        <input type="hidden" name="weddingId" value={data.wedding.id} />
        <ArrangementFields data={data} />
        <TextArea label="Checklist (one line per item)" name="checklist" rows={4} className="field-full" hint="For example each shot in a photography list or each item in a hamper." />
      </ActionForm>
    </Card>}
    {!rows.length ? <Card><EmptyState title="No arrangements here yet" description="Add one to track owners, due dates, approved designs and checklists." /></Card> :
      rows.map((row) => {
        const lines = data.checklist.filter((line) => line.arrangement_id === row.id);
        const progress = checklistProgress(lines);
        return <Card key={row.id} title={row.title} subtitle={[ARRANGEMENT_LABELS[row.category], row.function_id ? lookups.functionName.get(row.function_id) : "Whole wedding", `Owner: ${lookups.ownerLabel(row)}`, row.due_date && `Due ${formatDate(`${row.due_date}T12:00:00Z`, "UTC")}`, row.event_at && formatDateTime(row.event_at, tz)].filter(Boolean).join(" · ")}
          action={<StageBadge kind="arrangement" status={row.status} />}>
          {row.details && <p>{row.details}</p>}
          {row.reference_url && <p className="row-meta"><a className="text-link" href={row.reference_url} target="_blank" rel="noopener noreferrer">Reference / design</a> · {row.design_approved_at ? `Approved by ${lookups.memberName.get(row.design_approved_by_user_id ?? "") ?? "a member"} on ${formatDate(row.design_approved_at, tz)}` : "Not approved"}</p>}
          {row.quantity !== null && <p className="row-meta">Quantity: {row.quantity}</p>}
          {lines.length > 0 && <><p className="row-meta">{progress.done} of {progress.total} done</p><ul className="checklist">{lines.map((line) => <li key={line.id}>
            {data.canEdit ? <ActionForm action={toggleChecklistLineAction} submitLabel={line.is_done ? "Undo" : "Mark done"} variant="quiet" className="inline-action-form" ariaLabel={line.label}>
              <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="lineId" value={line.id} /><input type="hidden" name="isDone" value={String(!line.is_done)} />
              <span className={line.is_done ? "checklist-done" : ""}>{line.is_done ? "✓ " : ""}{line.label}</span>
            </ActionForm> : <span className={line.is_done ? "checklist-done" : ""}>{line.is_done ? "✓ " : "○ "}{line.label}</span>}
          </li>)}</ul></>}
          {data.canEdit && <details className="travel-edit"><summary>Edit, approve design or add checklist line</summary>
            <ActionForm action={updateArrangementAction} submitLabel="Save arrangement" className="field-grid">
              <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="arrangementId" value={row.id} /><input type="hidden" name="version" value={row.version} />
              <ArrangementFields data={data} row={row} />
              <Checkbox label="This reference is the approved design" name="approve_design" defaultChecked={Boolean(row.design_approved_at)} hint="Changing the link clears an earlier approval." />
            </ActionForm>
            <ActionForm action={addChecklistLineAction} submitLabel="Add line" resetOnSuccess className="inline-action-form">
              <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="arrangementId" value={row.id} />
              <TextInput label="New checklist line" name="label" required maxLength={300} />
            </ActionForm>
          </details>}
        </Card>;
      })}
  </>;
}
