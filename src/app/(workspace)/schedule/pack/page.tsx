import Link from "next/link";
import { requireCurrentWorkspace } from "@/lib/auth/access";
import { getOperationsWorkspace } from "@/lib/data/operations";
import { PrintButton } from "@/components/print-button";
import { EmptyState } from "@/components/ui";
import { describeStatus } from "@/lib/planning/status-vocabulary";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { ARRANGEMENT_LABELS, checklistProgress, scheduleWarnings, SEVERITY_LABELS, sortIssues } from "@/lib/planning/operations-rules";

/**
 * Printable operational pack. It is a snapshot: the generation time is printed on every page
 * section, and nothing is cached for offline use by this app.
 */
export default async function OperationalPackPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const workspace = await requireCurrentWorkspace("logistics");
  const params = await searchParams;
  const data = await getOperationsWorkspace(workspace.wedding.id);
  const tz = data.wedding.timezone;
  const selected = data.functions.filter((fn) => !params.function || fn.id === params.function);
  const members = new Map(data.members.map((member) => [member.userId, member.name]));
  const owner = (row: { owner_user_id: string | null; owner_name: string }) => row.owner_user_id ? members.get(row.owner_user_id) ?? "Member" : row.owner_name || "Unassigned";
  const supplier = new Map(data.suppliers.map((row) => [row.id, row]));
  const warnings = scheduleWarnings({ items: data.items, dependencies: data.dependencies, functionWindows: new Map(data.functions.map((fn) => [fn.id, fn])) });
  const generated = `${formatDateTime(data.generatedAt, tz)} (${tz})`;
  return <div className="ops-pack">
    <div className="ops-pack-toolbar no-print">
      <Link className="button button-secondary" href="/schedule">Back to schedules</Link>
      <form className="inline-action-form" method="get"><label className="sr-only" htmlFor="pack-function">Function</label>
        <select id="pack-function" name="function" className="field-control" defaultValue={typeof params.function === "string" ? params.function : ""}><option value="">All functions</option>{data.functions.map((fn) => <option key={fn.id} value={fn.id}>{fn.name}</option>)}</select>
        <button className="button button-secondary" type="submit">Show</button></form>
      <PrintButton label="Print pack" />
    </div>
    <header className="ops-pack-header">
      <h1 className="page-title">{data.wedding.name} · Operational pack</h1>
      <p className="ops-pack-stamp"><strong>Generated {generated}.</strong> This is a snapshot. Changes made after this time are not included; check the live schedule before acting on it. Contains private contact details: keep printed copies secure and destroy them after the event.</p>
    </header>
    {!selected.length && (params.function ? <EmptyState title="Function not found" description="It may have been archived, or the link is out of date. Choose another function above." /> : <EmptyState title="No functions" description="Create functions and schedule items first." />)}
    {selected.map((fn) => {
      const items = data.items.filter((item) => item.function_id === fn.id && item.status !== "cancelled");
      const issues = sortIssues(data.issues.filter((issue) => issue.function_id === fn.id && issue.status !== "resolved"));
      const arrangements = data.arrangements.filter((row) => row.function_id === fn.id && row.status !== "cancelled");
      return <section key={fn.id} className="ops-pack-section">
        <h2 className="card-title">{fn.name}{fn.starts_at ? ` · ${formatDate(fn.starts_at, tz)}` : ""}{fn.venue_name ? ` · ${fn.venue_name}` : ""}</h2>
        <p className="ops-pack-stamp">Generated {generated}</p>
        <h3>Run sheet</h3>
        {!items.length ? <p>No schedule items.</p> : <table className="data-table"><thead><tr><th scope="col">Time</th><th scope="col">Activity</th><th scope="col">Location</th><th scope="col">Owner / backup</th><th scope="col">Vendor</th><th scope="col">Status</th></tr></thead>
          <tbody>{items.map((item) => { const vendor = item.supplier_id ? supplier.get(item.supplier_id) : null; const notes = warnings.filter((warning) => warning.itemId === item.id); return <tr key={item.id}>
            <td>{formatTime(item.planned_start, tz)}–{formatTime(item.planned_end, tz)}</td>
            <td>{item.activity}{item.setup_requirements && <div className="table-secondary">Setup: {item.setup_requirements}</div>}{item.packup_requirements && <div className="table-secondary">Pack-up: {item.packup_requirements}</div>}{notes.map((warning, index) => <div key={index} className="table-secondary">⚠ {warning.message}</div>)}</td>
            <td>{item.location}</td><td>{owner(item)}{item.backup_contact && <div className="table-secondary">Backup: {item.backup_contact}</div>}</td>
            <td>{vendor ? `${vendor.name}${item.vendor_arrival_at ? ` · arrives ${formatTime(item.vendor_arrival_at, tz)}` : ""}${vendor.contact_phone ? ` · ${vendor.contact_phone}` : ""}` : "—"}</td>
            <td>{describeStatus("schedule", item.status).text}{item.delay_note ? ` · ${item.delay_note}` : ""}</td>
          </tr>; })}</tbody></table>}
        {issues.length > 0 && <><h3>Open issues</h3><ul>{issues.map((issue) => <li key={issue.id}>{SEVERITY_LABELS[issue.severity]} · {issue.title} · {owner(issue)} · {describeStatus("issue", issue.status).text}</li>)}</ul></>}
        {arrangements.length > 0 && <><h3>Arrangements</h3><ul>{arrangements.map((row) => { const lines = data.checklist.filter((line) => line.arrangement_id === row.id); const progress = checklistProgress(lines); return <li key={row.id}>
          <strong>{ARRANGEMENT_LABELS[row.category]}: {row.title}</strong> · {owner(row)} · {describeStatus("arrangement", row.status).text}{lines.length ? ` · ${progress.done}/${progress.total} done` : ""}
          {lines.length > 0 && <ul>{lines.map((line) => <li key={line.id}>{line.is_done ? "☑" : "☐"} {line.label}</li>)}</ul>}
        </li>; })}</ul></>}
      </section>;
    })}
  </div>;
}
