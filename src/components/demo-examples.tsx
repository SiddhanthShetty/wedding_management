"use client";

import { useState } from "react";
import { Bell, CircleCheck, FileText, Search } from "lucide-react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Dialog } from "@/components/dialog";
import { Button, Card, DataTable, DemoNotice, EmptyState, ErrorState, Field, LoadingState, NotificationRegion, SelectField, StatusLabel, TextAreaField } from "@/components/ui";

export function DemoExamples() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notification, setNotification] = useState("");
  return <div className="section-stack">
    <DemoNotice>These are component examples. Form submissions and confirmation actions are intentionally non-persistent.</DemoNotice>
    <div className="section-grid">
      <Card title="Page actions and status labels" subtitle="Buttons describe the preview state"><div className="filter-group"><Button onClick={() => setDialogOpen(true)}>Open example dialog</Button><Button variant="secondary" onClick={() => setConfirmOpen(true)}>Open confirmation</Button></div><div className="metric-inline" style={{ marginTop: 16 }}><StatusLabel>Confirmed</StatusLabel><StatusLabel>Tentative</StatusLabel><StatusLabel>Pending</StatusLabel><StatusLabel>Complete</StatusLabel><StatusLabel>Cancelled</StatusLabel></div></Card>
      <Card title="Forms and filters" subtitle="Labels, hints and validation presentation"><form onSubmit={(event) => { event.preventDefault(); setNotification("Demo mode: this form was not saved."); }}><div className="field-grid"><Field label="Function name" name="demo-function" placeholder="e.g. Welcome dinner" required hint="A clear name helps everyone find the event." /><SelectField label="Status" name="demo-status" defaultValue="tentative"><option value="tentative">Tentative</option><option value="confirmed">Confirmed</option></SelectField><TextAreaField label="Notes" name="demo-notes" placeholder="Add a short note" className="field-full" /></div><div className="filter-group" style={{ marginTop: 14 }}><div className="input-wrap"><Search size={15} aria-hidden="true" /><label className="sr-only" htmlFor="demo-filter">Filter preview rows</label><input id="demo-filter" placeholder="Filter preview rows" /></div></div><div className="form-actions"><Button type="submit">Preview submit</Button></div></form></Card>
      <Card title="Table pattern" subtitle="Semantic headers and responsive horizontal scroll"><DataTable label="Example component table" headers={["Record", "Date", "Status"]}><tr><td><span className="table-primary">Sample function</span></td><td>18 Jun 2027</td><td><StatusLabel>Tentative</StatusLabel></td></tr><tr><td><span className="table-primary">Sample task</span></td><td>12 Jun 2027</td><td><StatusLabel>Pending</StatusLabel></td></tr></DataTable></Card>
      <Card title="Shared states" subtitle="Use the same states across workspace pages"><EmptyState title="Nothing here yet" description="An empty state explains what is missing and what the user can expect." icon={<FileText size={19} />} /><LoadingState label="Loading preview" /><ErrorState title="Preview error state" description="Explain what happened and whether anything was saved." /></Card>
    </div>
    <Card title="Notifications" subtitle="Announced using accessible live regions"><div className="filter-group"><Button variant="secondary" onClick={() => setNotification("Preview information: no data was changed.")}><Bell size={15} />Show information</Button><Button variant="quiet" onClick={() => setNotification("Error example: the requested change was not saved.")}><CircleCheck size={15} />Show error example</Button></div></Card>
    <Dialog open={dialogOpen} titleId="example-dialog-title" descriptionId="example-dialog-copy" onClose={() => setDialogOpen(false)}><span className="dialog-icon"><FileText size={18} aria-hidden="true" /></span><h2 id="example-dialog-title" className="dialog-title">Example dialog</h2><p id="example-dialog-copy" className="dialog-copy">This reusable dialog pattern is for preview only. Closing it does not change any wedding data.</p><div className="dialog-actions"><Button variant="secondary" onClick={() => setDialogOpen(false)}>Close</Button></div></Dialog>
    <ConfirmationDialog open={confirmOpen} title="Confirm a preview action?" description="This only demonstrates the confirmation pattern. No records will be changed." confirmLabel="Continue preview" onCancel={() => setConfirmOpen(false)} onConfirm={() => { setConfirmOpen(false); setNotification("Confirmation pattern closed. No data was changed."); }} />
    {notification && <NotificationRegion message={notification} kind="info" onDismiss={() => setNotification("")} />}
  </div>;
}
