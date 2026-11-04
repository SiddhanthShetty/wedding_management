"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { Card, DataTable, EmptyState, PageHeading, StatusLabel } from "@/components/ui";
import { demoCosts, demoFunctions, demoGuests, demoTasks, demoVendors } from "@/lib/demo-data";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";

type SectionKey = "functions" | "tasks" | "venues-vendors" | "budget" | "guests" | "logistics" | "documents" | "settings";
const config: Record<SectionKey, { title: string; description: string; eyebrow: string }> = {
  functions: { title: "Functions", description: "Your wedding events, shown with synthetic preview details.", eyebrow: "Plan the moments" },
  tasks: { title: "Tasks", description: "A sample planning list. Task changes are not saved in this shell.", eyebrow: "Keep things moving" },
  "venues-vendors": { title: "Venues & Vendors", description: "A synthetic shortlist for demonstrating tables, filters and status labels.", eyebrow: "Your shortlist" },
  budget: { title: "Budget", description: "Demo amounts show estimated and committed figures separately.", eyebrow: "Planning finances" },
  guests: { title: "Guests", description: "Synthetic people grouped into households; each person remains an individual record.", eyebrow: "Guest list" },
  logistics: { title: "Logistics", description: "Accommodation, transport and schedules will appear here in a later planning slice.", eyebrow: "Getting everyone there" },
  documents: { title: "Documents", description: "Private documents are not enabled in this shell preview.", eyebrow: "Wedding files" },
  settings: { title: "Settings", description: "Wedding details and authorised workspace members.", eyebrow: "Workspace" },
};

export function SectionPage({ section }: { section: SectionKey }) {
  const [query, setQuery] = useState("");
  const [taskStatus, setTaskStatus] = useState("All statuses");
  const [guestResponse, setGuestResponse] = useState("All responses");
  const page = config[section];
  const guests = useMemo(() => demoGuests.filter((guest) => `${guest.name} ${guest.household}`.toLowerCase().includes(query.toLowerCase())), [query]);

  return <>
    <PageHeading eyebrow={page.eyebrow} title={page.title} description={page.description} />
    <div className="section-stack">
      {section === "functions" && <Card title="Wedding functions" subtitle="Synthetic preview records"><DataTable label="Synthetic wedding functions" headers={["Function", "Date & time", "Venue", "Status"]}>{demoFunctions.map((item) => <tr key={item.name}><td><span className="table-primary">{item.name}</span></td><td>{formatDate(item.date)}<span className="table-secondary">{formatTime(item.date)} Dublin time</span></td><td>{item.venue}</td><td><StatusLabel>{item.status}</StatusLabel></td></tr>)}</DataTable></Card>}

      {section === "tasks" && <Card title="Task list" subtitle="Sample records · owner and due dates are illustrative"><div className="table-toolbar"><div className="filter-group"><div className="input-wrap"><Search size={15} aria-hidden="true" /><label className="sr-only" htmlFor="task-search">Filter demo tasks</label><input id="task-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter demo tasks" /></div><label className="sr-only" htmlFor="task-status">Filter task status</label><select id="task-status" className="filter-select" value={taskStatus} onChange={(event) => setTaskStatus(event.target.value)}><option>All statuses</option><option>Pending</option><option>Complete</option></select></div><span className="topbar-crumb"><SlidersHorizontal size={13} /> Preview filters</span></div><DataTable label="Synthetic tasks" headers={["Task", "Function", "Due", "Status"]}>{demoTasks.filter((item) => `${item.title} ${item.detail}`.toLowerCase().includes(query.toLowerCase()) && (taskStatus === "All statuses" || item.status === taskStatus)).map((item) => <tr key={item.title}><td><span className="table-primary">{item.title}</span></td><td>{item.detail.split(" · ")[0]}</td><td>{item.due}</td><td><StatusLabel>{item.status}</StatusLabel></td></tr>)}</DataTable></Card>}

      {section === "venues-vendors" && <Card title="Shortlist" subtitle="Synthetic sample supplier data"><DataTable label="Synthetic venue and vendor shortlist" headers={["Name", "Category", "Function", "Sample amount", "Status"]}>{demoVendors.map((item) => <tr key={item.name}><td><span className="table-primary">{item.name}</span></td><td>{item.category}</td><td>{item.function}</td><td>{formatCurrency(item.amount)}</td><td><StatusLabel>{item.status}</StatusLabel></td></tr>)}</DataTable></Card>}

      {section === "budget" && <><div className="metric-inline"><span className="metric-chip"><strong>{formatCurrency(21800)}</strong> estimated · synthetic</span><span className="metric-chip"><strong>{formatCurrency(16400)}</strong> confirmed · synthetic</span><span className="metric-chip"><strong>{formatCurrency(3200)}</strong> paid · synthetic</span></div><Card title="Sample costs" subtitle="Estimated and confirmed amounts are kept distinct"><DataTable label="Synthetic sample costs" headers={["Item", "Category", "Amount", "Status"]}>{demoCosts.map((item) => <tr key={item.name}><td><span className="table-primary">{item.name}</span></td><td>{item.category}</td><td>{formatCurrency(item.amount)}</td><td><StatusLabel>{item.status}</StatusLabel></td></tr>)}</DataTable></Card></>}

      {section === "guests" && <Card title="People and households" subtitle="Synthetic demo data · response state belongs to each individual"><div className="table-toolbar"><div className="input-wrap"><Search size={15} aria-hidden="true" /><label className="sr-only" htmlFor="guest-search">Search demo guests</label><input id="guest-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people or households" /></div><label className="sr-only" htmlFor="guest-response">Filter response</label><select id="guest-response" className="filter-select" aria-label="Filter guest response" value={guestResponse} onChange={(event) => setGuestResponse(event.target.value)}><option>All responses</option><option>Responded</option><option>Awaiting response</option></select></div><DataTable label="Synthetic guests grouped by household" headers={["Person", "Household", "Invitations", "Response"]}>{guests.filter((guest) => guestResponse === "All responses" || guest.response === guestResponse).map((guest) => <tr key={guest.name}><td><span className="table-primary">{guest.name}</span></td><td>{guest.household}</td><td>{guest.invited}</td><td><StatusLabel>{guest.status === "Confirmed" ? "Confirmed" : "Pending"}</StatusLabel><span className="table-secondary">{guest.response}</span></td></tr>)}</DataTable>{guests.length === 0 && <EmptyState title="No matching demo guests" description="Try a different name or household." />}</Card>}

      {section === "logistics" && <div className="section-grid"><Card title="Schedules" subtitle="Wedding-day timings"><EmptyState title="No schedule in this preview" description="A later milestone will add confirmed run sheets and day-of views." /></Card><Card title="Stays & transport" subtitle="Guest arrangements"><EmptyState title="No arrangements in this preview" description="Accommodation and transport records are not enabled in the shell." /></Card></div>}

      {section === "documents" && <Card title="Private document library"><EmptyState title="Documents are not connected" description="File storage and access control are not implemented in this shell. No files have been uploaded." /></Card>}

    </div>
  </>;
}

