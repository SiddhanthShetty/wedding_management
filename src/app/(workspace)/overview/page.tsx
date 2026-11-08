import Link from "next/link";
import { TimeZoneNotice } from "@/components/time-zone-notice";
import { Suspense, type ReactNode } from "react";
import { AlertTriangle, ArrowUpRight, BedDouble, CalendarDays, CheckSquare2, Download, Scale, UsersRound, UtensilsCrossed, Wallet } from "lucide-react";
import { Card, EmptyState, PageHeading } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { Term } from "@/components/term";
import { requireCurrentWorkspace } from "@/lib/auth/access";
import {
  getDashboard, getDashboardHeader, loadCateringSection, loadDecisionsSection, loadFinanceSection, loadFunctionsSection, loadIssuesSection,
  loadRsvpSection, loadSuppliersSection, loadTasksSection, loadTravelSection, type Section,
} from "@/lib/data/dashboard";
import { getSetupState } from "@/lib/data/setup";
import { SetupChecklist } from "@/components/setup-checklist";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/planning/money";
import { SEVERITY_LABELS } from "@/lib/planning/operations-rules";
import { attentionItems } from "@/lib/planning/attention";

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

/** Placeholder shown while a section streams in. Never shows numbers. */
function SectionSkeleton({ title }: { title: string }) {
  return <Card title={title}><div className="loading-state" role="status" aria-label={`Loading ${title}`}><span className="skeleton" aria-hidden="true" /><span className="state-description">Loading…</span></div></Card>;
}

/** Waits for one section (cached per request) and renders it, so each card appears as soon as its data is ready. */
async function Slot<T>({ load, children }: { load: Promise<Section<T>>; children: (section: Section<T>) => ReactNode }) {
  return <>{children(await load)}</>;
}

async function Attention({ weddingId }: { weddingId: string }) {
  const data = await getDashboard(weddingId);
  const isNew = data.functions.state === "ok" && data.functions.data.total === 0
    && (data.rsvp.state !== "ok" || data.rsvp.data.guests === 0) && (data.tasks.state !== "ok" || data.tasks.data.total === 0);
  if (isNew) return null;
  const items = attentionItems({
    today: data.today,
    tasks: data.tasks.state === "ok" ? data.tasks.data : undefined,
    decisions: data.decisions.state === "ok" ? data.decisions.data : undefined,
    suppliers: data.suppliers.state === "ok" ? data.suppliers.data : undefined,
    payments: data.finance.state === "ok" ? data.finance.data.due : undefined,
    rsvp: data.rsvp.state === "ok" ? data.rsvp.data.functions : undefined,
    catering: data.catering.state === "ok" ? data.catering.data : undefined,
    travel: data.travel.state === "ok" ? data.travel.data : undefined,
    issues: data.issues.state === "ok" ? data.issues.data : undefined,
  });
  const failed = (["tasks", "decisions", "suppliers", "finance", "rsvp", "catering", "travel", "issues"] as const).some((key) => data[key].state === "error");
  return <Card title="What needs you today" subtitle={items.length ? "The most urgent things first. Each button opens exactly those records." : undefined} className="attention-card">
    {!items.length ? <p className="attention-clear">{failed ? "Some areas could not load, so this list may be incomplete. Refresh to try again." : "You're all caught up. Nothing urgent right now."}</p> :
      <ol className="attention-list">{items.map((item) => <li key={item.id} className={`attention-item attention-${item.tone}`}>
        <div><p className="row-title">{item.title}</p><p className="row-meta">{item.detail}</p></div>
        <Link className="button button-secondary" href={item.href}>{item.action}</Link>
      </li>)}</ol>}
    {items.length > 0 && failed && <p className="field-help">Some areas could not load, so this list may be incomplete.</p>}
  </Card>;
}

/** Names, days to go and the next function, in the couple's theme colours. */
function OverviewHero({ header, weddingId }: { header: Awaited<ReturnType<typeof getDashboardHeader>>; weddingId: string }) {
  if (!header.coupleNames && header.daysToGo === null) return null;
  return <section className="overview-hero" aria-label="Your wedding">
    <div>
      <p className="eyebrow">{header.wedding.name}</p>
      <h2 className="overview-hero-names">{header.coupleNames || header.wedding.name}</h2>
      <Suspense fallback={null}><NextFunction weddingId={weddingId} /></Suspense>
    </div>
    {header.daysToGo !== null && <div className="overview-hero-count" aria-label={header.daysToGo > 0 ? `${header.daysToGo} days to go` : header.daysToGo === 0 ? "The wedding is today" : "The wedding has happened"}>
      {header.daysToGo > 0 ? <><strong>{header.daysToGo}</strong><span>{header.daysToGo === 1 ? "day to go" : "days to go"}</span></> : header.daysToGo === 0 ? <><strong>Today</strong><span>is the day</span></> : <><strong>♥</strong><span>Married</span></>}
    </div>}
  </section>;
}

async function NextFunction({ weddingId }: { weddingId: string }) {
  const section = await loadFunctionsSection(weddingId);
  if (section.state !== "ok" || !section.data.upcoming[0]) return null;
  const next = section.data.upcoming[0];
  return <p className="overview-hero-next">Next: <Link className="text-link" href="/functions">{next.name}</Link> · {day(next.function_date)}{next.venue_name ? ` · ${next.venue_name}` : ""}</p>;
}

async function Setup({ weddingId }: { weddingId: string }) {
  return <SetupChecklist weddingId={weddingId} state={await getSetupState(weddingId)} />;
}

async function HiddenNote({ weddingId }: { weddingId: string }) {
  const data = await getDashboard(weddingId);
  const hidden = (["functions", "suppliers", "rsvp", "travel"] as const).filter((key) => data[key].state === "forbidden").length;
  return hidden > 0 ? <p className="readonly-note">Some areas are hidden because your access does not include them.</p> : null;
}

export default async function OverviewPage() {
  const workspace = await requireCurrentWorkspace();
  const id = workspace.wedding.id;
  const header = await getDashboardHeader(id);
  const tz = header.wedding.timezone;
  return <div className="dashboard">
    <TimeZoneNotice weddingZone={header.wedding.timezone} currency={header.wedding.currency} canChange={header.isOwner} />
    <OverviewHero header={header} weddingId={id} />
    <PageHeading eyebrow={`Welcome, ${header.displayName}`} title="What's happening"
      description={`Everything that needs attention, from your wedding's own records. Updated ${formatDateTime(header.generatedAt, tz)} (${tz}).`}
      action={<div className="heading-actions no-print"><a className="button button-secondary" href="/overview/export" download><Download size={15} aria-hidden="true" /> Export CSV</a><PrintButton label="Print summary" /></div>} />
    <Suspense fallback={<SectionSkeleton title="What needs you today" />}><Attention weddingId={id} /></Suspense>
    <Suspense fallback={null}><Setup weddingId={id} /></Suspense>
    <div className="dash-grid">
      <Suspense fallback={<SectionSkeleton title="Upcoming functions" />}><Slot load={loadFunctionsSection(id)}>{(section) => <DashSection title="Upcoming functions" icon={<CalendarDays size={16} />} section={section} area="Functions">{(functions) => !functions.upcoming.length
        ? <EmptyState title="No upcoming functions" description={functions.total ? "All functions are in the past, cancelled or undated." : "Add your first function to see it here."} />
        : <ul className="dash-list">{functions.upcoming.map((fn) => <li key={fn.id}><Link href="/functions"><span className="row-title">{fn.name}</span><span className="row-meta">{day(fn.function_date)} · {fn.status === "confirmed" ? "Confirmed" : "Tentative"}{fn.venue_name ? ` · ${fn.venue_name}` : ""}</span></Link></li>)}</ul>}
      </DashSection>}</Slot></Suspense>
      <Suspense fallback={<SectionSkeleton title="Tasks" />}><Slot load={loadTasksSection(id)}>{(section) => <DashSection title="Tasks" icon={<CheckSquare2 size={16} />} section={section} area="Tasks">{(tasks) => <>
        <div className="dash-counts"><Count href="/tasks?view=mine-open" value={tasks.mineOpen} label="my open tasks" /><Count href="/tasks?view=mine-overdue" value={tasks.mineOverdue} label="mine overdue" tone="alert" /><Count href="/tasks?view=overdue" value={tasks.overdue} label="overdue overall" tone="alert" /><Count href="/tasks?view=due-soon" value={tasks.dueSoon} label="due in 7 days" tone="warn" /></div>
        {tasks.mine.length > 0 && <ul className="dash-list">{tasks.mine.map((task) => <li key={task.id}><Link href="/tasks?view=mine-open"><span className="row-title">{task.title}</span><span className={`row-meta ${task.overdue ? "dash-overdue" : ""}`}>{task.due_date ? `${task.overdue ? "Overdue · " : "Due "}${day(task.due_date)}` : "No due date"}</span></Link></li>)}</ul>}
      </>}</DashSection>}</Slot></Suspense>
      <Suspense fallback={<SectionSkeleton title="Decisions awaiting action" />}><Slot load={loadDecisionsSection(id)}>{(section) => <DashSection title="Decisions awaiting action" icon={<Scale size={16} />} section={section} area="Decisions">{(decisions) => <>
        <div className="dash-counts"><Count href="/decisions?status=open" value={decisions.open} label="open decisions" tone="warn" /></div>
        {decisions.items.length > 0 && <ul className="dash-list">{decisions.items.map((decision) => <li key={decision.id}><Link href="/decisions?status=open"><span className="row-title">{decision.question}</span></Link></li>)}</ul>}
      </>}</DashSection>}</Slot></Suspense>
      <Suspense fallback={<SectionSkeleton title="Expiring holds and quotes" />}><Slot load={loadSuppliersSection(id)}>{(section) => <DashSection title="Expiring holds and quotes" icon={<CalendarDays size={16} />} section={section} area="Venues and vendors">{(suppliers) => <>
        <div className="dash-counts"><Count href="/venues-vendors?filter=expiring" value={new Set(suppliers.items.map((item) => item.supplierId)).size} label="vendors with holds or quotes expiring in 14 days" tone="warn" /></div>
        {suppliers.items.length > 0 && <ul className="dash-list">{suppliers.items.slice(0, 5).map((item, index) => <li key={index}><Link href="/venues-vendors?filter=expiring"><span className="row-title">{item.supplierName} · {item.label}</span><span className="row-meta">{item.kind === "hold" ? "Hold" : "Quote"} expires {day(item.date)}</span></Link></li>)}</ul>}
      </>}</DashSection>}</Slot></Suspense>
      <Suspense fallback={<SectionSkeleton title="Budget and payments" />}><Slot load={loadFinanceSection(id)}>{(section) => <DashSection title="Budget and payments" icon={<Wallet size={16} />} section={section} area="Budget">{(finance) => <>
        {!finance.totals.length ? <EmptyState title="No financial records" description="Totals appear once you record estimates or bookings." /> :
          <dl className="dash-money">{finance.totals.map((total) => <div key={total.currency}>
            <dt>{total.currency}</dt>
            <dd>Budget {total.budget === null ? "not set" : formatMoney(total.budget, total.currency)} · <Term term="forecast">Expected</Term> {formatMoney(total.forecast, total.currency)} · <Term term="committed">Agreed</Term> {formatMoney(total.committed, total.currency)} · Paid {formatMoney(total.netPaid, total.currency)} · <Term term="outstanding">Still to pay</Term> {formatMoney(total.outstanding, total.currency)}</dd>
          </div>)}</dl>}
        <div className="dash-counts"><Count href="/budget?due=30#upcoming-payments" value={finance.due.length} label="payments due in 30 days" tone="warn" /></div>
        {finance.due.length > 0 && <ul className="dash-list">{finance.due.slice(0, 5).map((row) => <li key={row.id}><Link href="/budget?due=30#upcoming-payments"><span className="row-title">{row.booking} · {row.label}</span><span className="row-meta">{formatMoney(row.remaining, row.currency)} due {day(row.due_date)}</span></Link></li>)}</ul>}
        <p className="field-help">Totals are grouped by currency and never converted. They are calculated by the same rules as the Budget page.</p>
      </>}</DashSection>}</Slot></Suspense>
      <Suspense fallback={<SectionSkeleton title="RSVP progress" />}><Slot load={loadRsvpSection(id)}>{(section) => <DashSection title="RSVP progress" icon={<UsersRound size={16} />} section={section} area="Guest responses">{(rsvp) => <>{!rsvp.functions.length
        ? <EmptyState title="No invitations yet" description={rsvp.guests ? "Invite guests to a function to track responses." : "Add guests, then invite them to functions."} />
        : <ul className="dash-list">{rsvp.functions.map((fn) => <li key={fn.id}><Link href={`/guests?view=invitations&function=${fn.id}`}>
          <span className="row-title">{fn.name}</span>
          <span className="row-meta">{fn.yes} yes · {fn.no} no · {fn.maybe} maybe · {fn.pending} awaiting · {fn.invited} invited</span>
          <span className="dash-bar" aria-hidden="true"><span style={{ width: `${fn.invited ? Math.round(((fn.invited - fn.pending) / fn.invited) * 100) : 0}%` }} /></span>
        </Link></li>)}</ul>}
        {rsvp.functions.some((fn) => fn.pending > 0) && <p className="dash-actions">Send reminders: {rsvp.functions.filter((fn) => fn.pending > 0).map((fn, index) => <span key={fn.id}>{index > 0 ? " · " : ""}<Link className="text-link" href={`/messages?function=${fn.id}&kind=reminder`}>{fn.name} ({fn.pending})</Link></span>)}</p>}
      </>}</DashSection>}</Slot></Suspense>
      <Suspense fallback={<SectionSkeleton title="Catering review" />}><Slot load={loadCateringSection(id)}>{(section) => <DashSection title="Catering review" icon={<UtensilsCrossed size={16} />} section={section} area="Catering">{(catering) => <>
        <div className="dash-counts"><Count href="/logistics" value={catering.flagged.length} label="meal services need review" tone="warn" /></div>
        {catering.flagged.length > 0 ? <ul className="dash-list">{catering.flagged.map((row) => <li key={row.id}><Link href={`/logistics#service-${row.id}`}><span className="row-title">{row.function_name} · {row.name}</span><span className="row-meta">{row.reasons.join(" ")}</span></Link></li>)}</ul>
          : <p className="field-help">{catering.services ? "No differences need review." : "No meal services yet."}</p>}
      </>}</DashSection>}</Slot></Suspense>
      <Suspense fallback={<SectionSkeleton title="Rooms and transport" />}><Slot load={loadTravelSection(id)}>{(section) => <DashSection title="Rooms and transport" icon={<BedDouble size={16} />} section={section} area="Stays and transport">{(travel) => <div className="dash-counts">
        <Count href="/travel?tab=needs&filter=rooms-missing" value={travel.roomsNotAssigned} label="need a room · not assigned" tone="alert" />
        <Count href="/travel?tab=needs&filter=arrivals-missing" value={travel.arrivalsNotAssigned} label="need arrival transport" tone="alert" />
        <Count href="/travel?tab=needs&filter=departures-missing" value={travel.departuresNotAssigned} label="need departure transport" tone="alert" />
        <Count href="/travel?tab=needs&filter=room-unknown" value={travel.roomNeedUnknown} label="room need unknown" />
      </div>}</DashSection>}</Slot></Suspense>
      <Suspense fallback={<SectionSkeleton title="Wedding-day issues" />}><Slot load={loadIssuesSection(id)}>{(section) => <DashSection title="Wedding-day issues" icon={<AlertTriangle size={16} />} section={section} area="Issues">{(issues) => <>
        <div className="dash-counts"><Count href="/schedule?tab=issues" value={issues.total} label="unresolved" tone="warn" /><Count href="/schedule?tab=issues" value={issues.critical} label="critical" tone="alert" /></div>
        {issues.items.length > 0 && <ul className="dash-list">{issues.items.map((issue) => <li key={issue.id}><Link href="/schedule?tab=issues"><span className="row-title">{issue.title}</span><span className="row-meta">{SEVERITY_LABELS[issue.severity]}</span></Link></li>)}</ul>}
      </>}</DashSection>}</Slot></Suspense>
    </div>
    <Suspense fallback={null}><HiddenNote weddingId={id} /></Suspense>
  </div>;
}
