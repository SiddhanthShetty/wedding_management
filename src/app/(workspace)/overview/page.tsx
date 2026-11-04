import { ArrowUpRight, CalendarDays, Check, Clock3, UsersRound, Wallet } from "lucide-react";
import { Card, DemoNotice, PageHeading, StatusLabel } from "@/components/ui";
import { demoFunctions, demoTasks } from "@/lib/demo-data";
import { formatCurrency, formatDate, formatDay, formatMonth, formatNumber, formatTime } from "@/lib/format";
import { requireCurrentWorkspace } from "@/lib/auth/access";

export default async function OverviewPage() {
  await requireCurrentWorkspace();
  return <>
    <PageHeading eyebrow="Wedding planning" title="Good morning" description="A quick view of synthetic sample records for layout preview." />
    <div className="overview-grid" aria-label="Synthetic demo summary">
      <Stat icon={<CalendarDays size={16} />} label="Functions" value={formatNumber(3)} foot="2 confirmed · 1 tentative" />
      <Stat icon={<Check size={16} />} label="Open tasks" value={formatNumber(8)} foot="3 due this week" />
      <Stat icon={<UsersRound size={16} />} label="Guest responses" value={`${formatNumber(68)}%`} foot="Synthetic RSVP summary" />
      <Stat icon={<Wallet size={16} />} label="Confirmed spend" value={formatCurrency(16400)} foot="Sample figure · committed only" />
    </div>
    <div className="overview-columns">
      <Card title="Upcoming functions" subtitle="Synthetic dates in the demo workspace" action={<span className="topbar-crumb">View all <ArrowUpRight size={13} /></span>}>
        <div className="function-list">{demoFunctions.map((event) => <div className="function-row" key={event.name}><div className="date-tile"><span>{formatMonth(event.date)}</span><span>{formatDay(event.date)}</span></div><div className="row-main"><div className="row-title">{event.name}</div><div className="row-meta">{formatDate(event.date)} · {formatTime(event.date)} Dublin time · {event.venue}</div></div><StatusLabel>{event.status}</StatusLabel></div>)}</div>
      </Card>
      <Card title="A few next steps" subtitle="Sample tasks only">
        <div className="task-list">{demoTasks.map((task) => <div className="task-row" key={task.title}><span className={`task-check ${task.status === "Complete" ? "done" : ""}`} aria-label={task.status === "Complete" ? "Complete" : "Not complete"}>{task.status === "Complete" && <Check size={12} />}</span><div className="row-main"><div className="row-title">{task.title}</div><div className="row-meta">{task.detail}</div></div><span className="task-due">{task.due}</span></div>)}</div>
      </Card>
    </div>
    <div style={{ marginTop: 17 }}><DemoNotice>Demo mode is active. Summary values are synthetic and are not connected to a database.</DemoNotice></div>
  </>;
}

function Stat({ icon, label, value, foot }: { icon: React.ReactNode; label: string; value: string; foot: string }) {
  return <section className="card stat-card"><span className="stat-label">{label}</span><span className="stat-icon" aria-hidden="true">{icon}</span><div className="stat-value">{value}</div><div className="stat-foot"><Clock3 size={12} aria-hidden="true" />{foot}</div></section>;
}
