import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowUpRight, BedDouble, CalendarDays, CheckSquare2, Download, Scale, UsersRound, UtensilsCrossed, Wallet } from "lucide-react";
import { Card, EmptyState, PageHeading } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { requireCurrentWorkspace } from "@/lib/auth/access";
import { getDashboard, type Section } from "@/lib/data/dashboard";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/planning/money";
import { SEVERITY_LABELS } from "@/lib/planning/operations-rules";

const day = (value: string | null) => value ? formatDate(`${value}T12:00:00Z`, "UTC") : "Date to be set";

function Count({ href, value, label, tone = "neutral" }: { href: string; value: number; label: string; tone?: "neutral" | "warn" | "alert" }) {
  return <Link className={`dash-count dash-${value > 0 ? tone : "neutral"}`} href={href}><strong>{value}</strong><span>{label}</span><ArrowUpRight size={13} aria-hidden="true" /></Link>;
}

function DashSection<T>({ title, icon, section, area, children }: { title: string; icon: ReactNode; section: Section<T>; area: string; children: (data: T) => ReactNode }) {
  if (section.state === "forbidden") return null;
  return <Card title={title} action={<span className="dash-icon" aria-hidden="true">{icon}</span>}>
    {section.state === "error"
      ? <div className="error-state" role="alert"><p className="state-title">{area} could not load</p><p className="state-description">No figures are shown instead of the real ones. Refresh to try again.</p></div>
      : children(section.data)}
  </Card>;
}

export default async function OverviewPage() {
  const workspace = await requireCurrentWorkspace();
  const data = await getDashboard(workspace.wedding.id);
  const tz = data.wedding.timezone;
  const hidden = (["functions", "suppliers", "rsvp", "travel"] as const).filter((key) => data[key].state === "forbidden").length;
  const isNew = data.functions.state === "ok" && data.functions.data.total === 0
    && (data.rsvp.state !== "ok" || data.rsvp.data.guests === 0) && (data.tasks.state !== "ok" || data.tasks.data.total === 0);
  return <div className="dashboard">
    <PageHeading eyebrow={`Welcome, ${data.displayName}`} title={data.wedding.name}
      description={`Everything that needs attention, from your wedding's own records. Updated ${formatDateTime(data.generatedAt, tz)} (${tz}).`}
      action={<div className="heading-actions no-print"><a className="button button-secondary" href="/overview/export" download><Download size={15} aria-hidden="true" /> Export CSV</a><PrintButton label="Print summary" /></div>} />
    {isNew && <Card title="Getting started" subtitle="Your workspace is empty. These steps set up the rest of the app.">
      <ol className="dash-steps">
        {data.isOwner && <li><Link className="text-link" href="/settings">Check the wedding details</Link>: names, date, timezone and currency.</li>}
        <li><Link className="text-link" href="/functions">Add your functions</Link>, for example welcome dinner, ceremony and reception.</li>
        <li><Link className="text-link" href="/guests">Add households and guests</Link>, then invite them to each function.</li>
        <li><Link className="text-link" href="/venues-vendors">Shortlist venues and vendors</Link>, and record quotes as they arrive.</li>
        <li><Link className="text-link" href="/tasks">Create tasks</Link> with owners and due dates.</li>
      </ol>
    </Card>}
    <div className="dash-grid">
      <DashSection title="Upcoming functions" icon={<CalendarDays size={16} />} section={data.functions} area="Functions">{(functions) => !functions.upcoming.length
        ? <EmptyState title="No upcoming functions" description={functions.total ? "All functions are in the past, cancelled or undated." : "Add your first function to see it here."} />
        : <ul className="dash-list">{functions.upcoming.map((fn) => <li key={fn.id}><Link href="/functions"><span className="row-title">{fn.name}</span><span className="row-meta">{day(fn.function_date)} · {fn.status === "confirmed" ? "Confirmed" : "Tentative"}{fn.venue_name ? ` · ${fn.venue_name}` : ""}</span></Link></li>)}</ul>}
      </DashSection>
      <DashSection title="Tasks" icon={<CheckSquare2 size={16} />} section={data.tasks} area="Tasks">{(tasks) => <>
        <div className="dash-counts"><Count href="/tasks?view=mine-open" value={tasks.mineOpen} label="my open tasks" /><Count href="/tasks?view=mine-overdue" value={tasks.mineOverdue} label="mine overdue" tone="alert" /><Count href="/tasks?view=overdue" value={tasks.overdue} label="overdue overall" tone="alert" /><Count href="/tasks?view=due-soon" value={tasks.dueSoon} label="due in 7 days" tone="warn" /></div>
        {tasks.mine.length > 0 && <ul className="dash-list">{tasks.mine.map((task) => <li key={task.id}><Link href="/tasks?view=mine-open"><span className="row-title">{task.title}</span><span className={`row-meta ${task.overdue ? "dash-overdue" : ""}`}>{task.due_date ? `${task.overdue ? "Overdue · " : "Due "}${day(task.due_date)}` : "No due date"}</span></Link></li>)}</ul>}
      </>}</DashSection>
      <DashSection title="Decisions awaiting action" icon={<Scale size={16} />} section={data.decisions} area="Decisions">{(decisions) => <>
        <div className="dash-counts"><Count href="/decisions?status=open" value={decisions.open} label="open decisions" tone="warn" /></div>
        {decisions.items.length > 0 && <ul className="dash-list">{decisions.items.map((decision) => <li key={decision.id}><Link href="/decisions?status=open"><span className="row-title">{decision.question}</span></Link></li>)}</ul>}
      </>}</DashSection>
      <DashSection title="Expiring holds and quotes" icon={<CalendarDays size={16} />} section={data.suppliers} area="Venues and vendors">{(suppliers) => <>
        <div className="dash-counts"><Count href="/venues-vendors?filter=expiring" value={new Set(suppliers.items.map((item) => item.supplierId)).size} label="vendors with holds or quotes expiring in 14 days" tone="warn" /></div>
        {suppliers.items.length > 0 && <ul className="dash-list">{suppliers.items.slice(0, 5).map((item, index) => <li key={index}><Link href="/venues-vendors?filter=expiring"><span className="row-title">{item.supplierName} · {item.label}</span><span className="row-meta">{item.kind === "hold" ? "Hold" : "Quote"} expires {day(item.date)}</span></Link></li>)}</ul>}
      </>}</DashSection>
      <DashSection title="Budget and payments" icon={<Wallet size={16} />} section={data.finance} area="Budget">{(finance) => <>
        {!finance.totals.length ? <EmptyState title="No financial records" description="Totals appear once you record estimates or bookings." /> :
          <dl className="dash-money">{finance.totals.map((total) => <div key={total.currency}>
            <dt>{total.currency}</dt>
            <dd>Budget {total.budget === null ? "not set" : formatMoney(total.budget, total.currency)} · Forecast {formatMoney(total.forecast, total.currency)} · Committed {formatMoney(total.committed, total.currency)} · Paid {formatMoney(total.netPaid, total.currency)} · Outstanding {formatMoney(total.outstanding, total.currency)}</dd>
          </div>)}</dl>}
        <div className="dash-counts"><Count href="/budget?due=30#upcoming-payments" value={finance.due.length} label="payments due in 30 days" tone="warn" /></div>
        {finance.due.length > 0 && <ul className="dash-list">{finance.due.slice(0, 5).map((row) => <li key={row.id}><Link href="/budget?due=30#upcoming-payments"><span className="row-title">{row.booking} · {row.label}</span><span className="row-meta">{formatMoney(row.remaining, row.currency)} due {day(row.due_date)}</span></Link></li>)}</ul>}
        <p className="field-help">Totals are grouped by currency and never converted. They are calculated by the same rules as the Budget page.</p>
      </>}</DashSection>
      <DashSection title="RSVP progress" icon={<UsersRound size={16} />} section={data.rsvp} area="Guest responses">{(rsvp) => !rsvp.functions.length
        ? <EmptyState title="No invitations yet" description={rsvp.guests ? "Invite guests to a function to track responses." : "Add guests, then invite them to functions."} />
        : <ul className="dash-list">{rsvp.functions.map((fn) => <li key={fn.id}><Link href={`/guests?view=invitations&function=${fn.id}`}>
          <span className="row-title">{fn.name}</span>
          <span className="row-meta">{fn.yes} yes · {fn.no} no · {fn.maybe} maybe · {fn.pending} awaiting · {fn.invited} invited</span>
          <span className="dash-bar" aria-hidden="true"><span style={{ width: `${fn.invited ? Math.round(((fn.invited - fn.pending) / fn.invited) * 100) : 0}%` }} /></span>
        </Link></li>)}</ul>}
      </DashSection>
      <DashSection title="Catering review" icon={<UtensilsCrossed size={16} />} section={data.catering} area="Catering">{(catering) => <>
        <div className="dash-counts"><Count href="/logistics" value={catering.flagged.length} label="meal services need review" tone="warn" /></div>
        {catering.flagged.length > 0 ? <ul className="dash-list">{catering.flagged.map((row) => <li key={row.id}><Link href={`/logistics#service-${row.id}`}><span className="row-title">{row.function_name} · {row.name}</span><span className="row-meta">{row.reasons.join(" ")}</span></Link></li>)}</ul>
          : <p className="field-help">{catering.services ? "No differences need review." : "No meal services yet."}</p>}
      </>}</DashSection>
      <DashSection title="Rooms and transport" icon={<BedDouble size={16} />} section={data.travel} area="Stays and transport">{(travel) => <div className="dash-counts">
        <Count href="/travel?tab=needs&filter=rooms-missing" value={travel.roomsNotAssigned} label="need a room · not assigned" tone="alert" />
        <Count href="/travel?tab=needs&filter=arrivals-missing" value={travel.arrivalsNotAssigned} label="need arrival transport" tone="alert" />
        <Count href="/travel?tab=needs&filter=departures-missing" value={travel.departuresNotAssigned} label="need departure transport" tone="alert" />
        <Count href="/travel?tab=needs&filter=room-unknown" value={travel.roomNeedUnknown} label="room need unknown" />
      </div>}</DashSection>
      <DashSection title="Wedding-day issues" icon={<AlertTriangle size={16} />} section={data.issues} area="Issues">{(issues) => <>
        <div className="dash-counts"><Count href="/schedule?tab=issues" value={issues.total} label="unresolved" tone="warn" /><Count href="/schedule?tab=issues" value={issues.critical} label="critical" tone="alert" /></div>
        {issues.items.length > 0 && <ul className="dash-list">{issues.items.map((issue) => <li key={issue.id}><Link href="/schedule?tab=issues"><span className="row-title">{issue.title}</span><span className="row-meta">{SEVERITY_LABELS[issue.severity]}</span></Link></li>)}</ul>}
      </>}</DashSection>
    </div>
    {hidden > 0 && <p className="readonly-note">Some areas are hidden because your access does not include them.</p>}
  </div>;
}
