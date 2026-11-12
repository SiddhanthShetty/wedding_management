"use client";
import type { LooseRow } from "@/lib/types/loose";
import { paymentsDueSoon } from "@/lib/planning/dashboard";

import { useActionState, useEffect, useState } from "react";
import { AlertTriangle, Plus, X } from "lucide-react";
import { Button, Card, DataTable, EmptyState, Field, PageHeading, SelectField, StageBadge, StatusLabel, TextAreaField } from "@/components/ui";
import { saveAdjustmentAction, saveBookingAction, saveBudgetAllocationAction, saveEstimateAction, saveObligationAction, saveReimbursementAction, recordTransactionAction, cancelBookingAction, type FinanceFormState } from "@/app/actions/finance";
import { allocationDifference, formatMoney } from "@/lib/planning/money";
import { VENDOR_CATEGORIES } from "@/lib/planning/vendor-rules";
import { budgetHeadline, whoWeOwe, type OweBooking, type OweInstalment, type OweRow } from "@/lib/planning/owe";
import { Dialog } from "@/components/dialog";

type FinanceData = { wedding: { currency:string; timezone:string }; canEdit:boolean; totals:LooseRow[]; bookings:LooseRow[]; estimates:LooseRow[]; allocations:LooseRow[]; functions:LooseRow[]; suppliers:LooseRow[]; obligations:LooseRow[]; unpaidObligations?:LooseRow[]; today:string; reimbursements:LooseRow[]; adjustments:LooseRow[]; refundDue:LooseRow[] };
const initialState: FinanceFormState = {};

function Result({ state }: { state: FinanceFormState }) {
  return state.error ? <p className="field-error" role="alert">{state.error}</p> : state.message ? <p className="field-help" role="status">{state.message}</p> : null;
}
function Amount({ value, currency }: { value: string; currency: string }) { return <>{formatMoney(value,currency)}</>; }
function FormShell({ title, children, action, state, weddingId, plain=false }: { title:string; children:React.ReactNode; action:(form:FormData)=>void; state:FinanceFormState; weddingId:string; plain?:boolean }) {
  const form=<form action={action} className="finance-form"><input type="hidden" name="weddingId" value={weddingId}/>{children}<Button type="submit">Save</Button><Result state={state}/></form>;
  return plain?form:<Card title={title}>{form}</Card>;
}

function CategoryField() {
  return <><Field label="Category" name="category" required maxLength={120} list="cost-categories" placeholder="Choose or type, e.g. Caterer"/><datalist id="cost-categories">{VENDOR_CATEGORIES.map(item=><option key={item} value={item}/>)}</datalist></>;
}

function CurrencyField({ currency }: { currency:string }) {
  return <details className="more-details"><summary>Different currency?</summary><Field label="Currency" name="currency" defaultValue={currency} required maxLength={3} hint="Three letters, for example INR, USD or EUR."/></details>;
}

function EstimateForm({ data, weddingId, plain=false }: { data:FinanceData; weddingId:string; plain?:boolean }) {
  const [state,action]=useActionState(saveEstimateAction,initialState);
  return <FormShell title="Add an estimate" action={action} state={state} weddingId={weddingId} plain={plain}>
    <Field label="What is it?" name="label" required maxLength={200} placeholder="e.g. Flowers for the mantap"/><CategoryField/>
    <Field label="Rough cost" name="amount" inputMode="decimal" placeholder="e.g. 40000" required/>
    <SelectField label="For which function?" name="functionId"><option value="">The whole wedding</option>{data.functions.map((fn)=><option value={fn.id} key={fn.id}>{fn.name}</option>)}</SelectField>
    <CurrencyField currency={data.wedding.currency}/>
  </FormShell>;
}

function AllocationRows({ functions, currency, agreedAmount }: { functions:FinanceData["functions"]; currency:string; agreedAmount:string }) {
  const [rows,setRows]=useState([{id:1,functionId:"",amount:""}]);
  const update=(index:number,key:"functionId"|"amount",value:string)=>setRows(current=>current.map((row,i)=>i===index?{...row,[key]:value}:row));
  let difference=""; try { if(agreedAmount) difference=allocationDifference(agreedAmount,rows.map(row=>row.amount||"0")); } catch { difference="invalid"; }
  return <fieldset className="finance-allocation"><legend>How the price splits across functions</legend>{rows.map((row,index)=><div className="finance-allocation-row" key={row.id}>
    <SelectField label={`Function ${index+1}`} name="allocationFunctionId" value={row.functionId} onChange={(event)=>update(index,"functionId",event.target.value)}><option value="">Wedding-wide</option>{functions.map(fn=><option key={fn.id} value={fn.id}>{fn.name}</option>)}</SelectField>
    <Field label={`Amount ${index+1}`} name="allocationAmount" value={row.amount} inputMode="decimal" placeholder="0.00" onChange={(event)=>update(index,"amount",event.target.value)}/>
    {rows.length>1&&<Button type="button" variant="quiet" aria-label={`Remove function ${index+1}`} onClick={()=>setRows(current=>current.filter((_,i)=>i!==index))}><X size={16}/></Button>}
  </div>)}<Button type="button" variant="secondary" onClick={()=>setRows(current=>[...current,{id:Date.now(),functionId:"",amount:""}])}><Plus size={15}/> Add another function</Button>
  <p className={difference==="0.00"?"field-help":"field-error"} role="status">{difference==="0.00"?"The split adds up to the price.":difference==="invalid"?"Enter amounts like 25000 or 25000.50.":agreedAmount?`The split must add up to the price. Still to split: ${difference} ${currency}.`:"Enter the agreed price first."}</p></fieldset>;
}

function BookingForm({ data,weddingId,plain=false }: {data:FinanceData;weddingId:string;plain?:boolean}) {
  const [state,action]=useActionState(saveBookingAction,initialState); const [amount,setAmount]=useState(""); const [split,setSplit]=useState(false);
  const estimates=data.estimates.filter(e=>e.status==="active");
  return <FormShell title="Record a booking" action={action} state={state} weddingId={weddingId} plain={plain}>
    <Field label="What did you book?" name="label" required maxLength={200} placeholder="e.g. Wedding lunch catering"/><CategoryField/>
    <SelectField label="Vendor (optional)" name="supplierId"><option value="">Not on our vendor list</option>{data.suppliers.map((supplier)=><option key={supplier.id} value={supplier.id}>{supplier.name} · {supplier.category}</option>)}</SelectField>
    <Field label="Agreed price" name="amount" value={amount} onChange={(event)=>setAmount(event.target.value.trim())} inputMode="decimal" placeholder="e.g. 150000" required/>
    <SelectField label="Is the price final?" name="status" defaultValue="confirmed"><option value="confirmed">Yes, agreed</option><option value="tentative">Not yet</option></SelectField>
    {estimates.length>0&&<SelectField label="Replaces an earlier estimate? (optional)" name="sourceEstimateId" hint="Pick the estimate this booking replaces, so it isn't counted twice."><option value="">No, it’s new</option>{estimates.map((estimate)=><option key={estimate.id} value={estimate.id}>{estimate.label} · {formatMoney(String(estimate.amount),estimate.currency)}</option>)}</SelectField>}
    <CurrencyField currency={data.wedding.currency}/>
    {data.functions.length>0&&<label className="checkbox-row"><input type="checkbox" checked={split} onChange={(event)=>setSplit(event.target.checked)}/> <span>Split the price across functions</span></label>}
    {/* Without a split, the whole price counts for the wedding as a whole. */}
    {split?<AllocationRows functions={data.functions} currency={data.wedding.currency} agreedAmount={amount}/>:<><input type="hidden" name="allocationFunctionId" value=""/><input type="hidden" name="allocationAmount" value={amount}/></>}
  </FormShell>;
}

function PaymentForm({ data,weddingId,plain=false }: {data:FinanceData;weddingId:string;plain?:boolean}) {
  const [state,action]=useActionState(recordTransactionAction,initialState); const [key,setKey]=useState("");
  useEffect(()=>setKey(crypto.randomUUID()),[]); useEffect(()=>{if(state.message)setKey(crypto.randomUUID());},[state.message]);
  const [bookingId,setBookingId]=useState(""); const booking=data.bookings.find(row=>row.id===bookingId);
  const [contributors,setContributors]=useState([{id:1}]);
  return <FormShell title="Record payment or refund" action={action} state={state} weddingId={weddingId} plain={plain}>
    <SelectField label="Booking" name="bookingId" required value={bookingId} onChange={event=>setBookingId(event.target.value)}><option value="">Choose a booking</option>{data.bookings.map(row=><option key={row.id} value={row.id}>{row.label} · {row.status}</option>)}</SelectField>
    <SelectField label="Record type" name="kind"><option value="payment">Payment made</option><option value="refund">Refund received</option></SelectField>
    <Field label="Amount" name="amount" inputMode="decimal" placeholder="0.00" required/><Field label="Currency" name="currency" value={booking?.currency??data.wedding.currency} readOnly maxLength={3} required/>
    <Field label="Date" name="date" type="date" defaultValue={new Intl.DateTimeFormat("en-CA",{timeZone:data.wedding.timezone}).format(new Date())} required/>
    <fieldset className="finance-allocation"><legend>Payer contributions (optional)</legend>{contributors.map((item,index)=><div className="finance-allocation-row" key={item.id}><Field label={`Contributor ${index+1}`} name="contributorLabel" maxLength={160}/><Field label={`Contribution ${index+1}`} name="contributionAmount" inputMode="decimal" placeholder="0.00"/>{contributors.length>1&&<Button type="button" variant="quiet" aria-label={`Remove contributor ${index+1}`} onClick={()=>setContributors(current=>current.filter(row=>row.id!==item.id))}><X size={16}/></Button>}</div>)}<Button type="button" variant="secondary" onClick={()=>setContributors(current=>[...current,{id:Date.now()}])}><Plus size={15}/> Add contributor</Button><p className="field-help">When entered, contribution amounts must add up exactly to the payment amount.</p></fieldset>
    {/* Sent with the form so a double tap or retry can't record the same payment twice. */}<input type="hidden" name="idempotencyKey" value={key}/>
    <SelectField label="Which instalment is this for? (optional)" name="obligationId" key={bookingId}><option value="">Not linked to an instalment</option>{data.obligations.filter(row=>row.booking_id===bookingId).map(row=><option key={row.id} value={row.id}>{row.label} · due {row.due_date}</option>)}</SelectField>
    <TextAreaField label="Note" name="note" rows={2} maxLength={4000}/>
    <p className="field-help">This is a manually recorded payment or refund. It is not bank-verified.</p>
  </FormShell>;
}

function CancellationForm({data,weddingId}:{data:FinanceData;weddingId:string}){
  const [state,action]=useActionState(cancelBookingAction,initialState);
  return <FormShell title="Cancel a booking" action={action} state={state} weddingId={weddingId}><SelectField label="Booking to cancel" name="bookingId" required><option value="">Choose a booking</option>{data.bookings.filter(b=>b.status!=="cancelled").map(b=><option key={b.id} value={b.id}>{b.label} · {b.currency} {b.agreed_total}</option>)}</SelectField><Field label="Expected refund (optional)" name="refundExpected" inputMode="decimal" placeholder="Leave blank if unknown"/><TextAreaField label="Cancellation note" name="note" rows={2} maxLength={4000}/><p className="field-help">Payments and booking history are retained. Unknown refund amounts stay unknown and are not treated as zero.</p></FormShell>;
}

function OtherFinanceForms({data,weddingId}:{data:FinanceData;weddingId:string}) {
  const [budgetState,budgetAction]=useActionState(saveBudgetAllocationAction,initialState);
  const [obState,obAction]=useActionState(saveObligationAction,initialState);
  const [adjState,adjAction]=useActionState(saveAdjustmentAction,initialState);
  const [reState,reAction]=useActionState(saveReimbursementAction,initialState);
  const [reKey,setReKey]=useState("");useEffect(()=>setReKey(crypto.randomUUID()),[]);useEffect(()=>{if(reState.message)setReKey(crypto.randomUUID());},[reState.message]);
  return <div className="finance-grid">
    <FormShell title="Add to budget split" action={budgetAction} state={budgetState} weddingId={weddingId}><Field label="Category" name="category" required/><SelectField label="Applies to" name="functionId"><option value="">Wedding-wide</option>{data.functions.map(fn=><option key={fn.id} value={fn.id}>{fn.name}</option>)}</SelectField><Field label="Allocated amount" name="amount" inputMode="decimal" required/><Field label="Currency" name="currency" defaultValue={data.wedding.currency} required/><TextAreaField label="Notes" name="notes" rows={2}/></FormShell>
    <FormShell title="Schedule a deposit or instalment" action={obAction} state={obState} weddingId={weddingId}><SelectField label="Booking" name="bookingId" required><option value="">Choose a booking</option>{data.bookings.filter(b=>b.status!=="cancelled").map(b=><option key={b.id} value={b.id}>{b.label} · {b.currency} {b.agreed_total}</option>)}</SelectField><Field label="Payment label" name="label" placeholder="Deposit" required/><Field label="Due date" name="dueDate" type="date" required/><Field label="Amount due" name="amount" inputMode="decimal" required/></FormShell>
    <FormShell title="Add an expected cost" action={adjAction} state={adjState} weddingId={weddingId}><Field label="Category" name="category" required/><Field label="Reason" name="reason" required/><SelectField label="Applies to" name="functionId"><option value="">Wedding-wide</option>{data.functions.map(fn=><option key={fn.id} value={fn.id}>{fn.name}</option>)}</SelectField><Field label="Amount" name="amount" inputMode="decimal" placeholder="25000 or -5000" required/><Field label="Currency" name="currency" defaultValue={data.wedding.currency} required/><p className="field-help">Type a plain amount to add to the expected total, or put a minus sign in front (−5000) to reduce it.</p></FormShell>
    <FormShell title="Record paying someone back" action={reAction} state={reState} weddingId={weddingId}><Field label="Paid by" name="fromLabel" required/><Field label="Reimburse" name="toLabel" required/><Field label="Amount" name="amount" inputMode="decimal" required/><Field label="Currency" name="currency" defaultValue={data.wedding.currency} required/><Field label="Due date" name="dueDate" type="date"/><SelectField label="Status" name="status"><option value="planned">Planned</option><option value="paid">Paid</option></SelectField><Field label="Paid date if paid" name="paidOn" type="date"/><SelectField label="Related booking" name="bookingId"><option value="">None</option>{data.bookings.map(b=><option key={b.id} value={b.id}>{b.label}</option>)}</SelectField><input type="hidden" name="idempotencyKey" value={reKey}/><TextAreaField label="Note" name="note" rows={2}/></FormShell>
  </div>;
}

/** "Add a cost": something booked (an agreed price) or just an estimate for now. */
function AddCostDialog({ data, weddingId, open, onClose }: { data:FinanceData; weddingId:string; open:boolean; onClose:()=>void }) {
  const [kind,setKind]=useState<"booking"|"estimate">("booking");
  return <Dialog open={open} titleId="add-cost-title" descriptionId="add-cost-copy" className="planning-editor-dialog" onClose={onClose}>
    <h2 id="add-cost-title" className="dialog-title">Add a cost</h2>
    <p id="add-cost-copy" className="dialog-copy">Booked vendors can also be added from their card on Venues &amp; vendors.</p>
    <div className="filter-group" role="group" aria-label="Kind of cost">
      <button type="button" className={`chip ${kind==="booking"?"is-active":""}`} aria-pressed={kind==="booking"} onClick={()=>setKind("booking")}>Booked, price agreed</button>
      <button type="button" className={`chip ${kind==="estimate"?"is-active":""}`} aria-pressed={kind==="estimate"} onClick={()=>setKind("estimate")}>Just an estimate</button>
    </div>
    {kind==="booking"?<BookingForm data={data} weddingId={weddingId} plain/>:<EstimateForm data={data} weddingId={weddingId} plain/>}
    <div className="dialog-actions"><Button type="button" variant="secondary" onClick={onClose}>Close</Button></div>
  </Dialog>;
}

function PaymentDialog({ data, weddingId, open, onClose }: { data:FinanceData; weddingId:string; open:boolean; onClose:()=>void }) {
  return <Dialog open={open} titleId="add-payment-title" descriptionId="add-payment-copy" className="planning-editor-dialog" onClose={onClose}>
    <h2 id="add-payment-title" className="dialog-title">Record a payment</h2>
    <p id="add-payment-copy" className="dialog-copy">For money you&apos;ve paid a vendor, or a refund you got back. This is your own record; it doesn&apos;t move any money.</p>
    <PaymentForm data={data} weddingId={weddingId} plain/>
    <div className="dialog-actions"><Button type="button" variant="secondary" onClick={onClose}>Close</Button></div>
  </Dialog>;
}

/** Records the next instalment (or the whole balance) as paid today, after a confirm step. */
function MarkPaid({ row, weddingId, today }: { row:OweRow; weddingId:string; today:string }) {
  const [state,action,pending]=useActionState(recordTransactionAction,initialState);
  const [confirming,setConfirming]=useState(false);
  const [key,setKey]=useState("");
  useEffect(()=>{ setKey(crypto.randomUUID()); },[]);
  useEffect(()=>{ if(state.message){ setConfirming(false); setKey(crypto.randomUUID()); } },[state.message]);
  if(!confirming) return <div className="owe-action"><Button variant="secondary" onClick={()=>setConfirming(true)}>Mark {formatMoney(row.payNow,row.currency)} paid</Button>{state.error&&<p className="field-error" role="alert">{state.error}</p>}</div>;
  return <form action={action} className="owe-confirm">
    <input type="hidden" name="weddingId" value={weddingId}/><input type="hidden" name="bookingId" value={row.bookingId}/>
    <input type="hidden" name="kind" value="payment"/><input type="hidden" name="amount" value={row.payNow}/><input type="hidden" name="currency" value={row.currency}/>
    <input type="hidden" name="obligationId" value={row.payNowObligationId??""}/><input type="hidden" name="idempotencyKey" value={key}/><input type="hidden" name="note" value=""/>
    <label className="field"><span className="field-label">Paid on</span><input className="field-control" type="date" name="date" defaultValue={today} max={today} required/></label>
    <div className="owe-confirm-buttons"><Button type="submit" disabled={pending||!key}>{pending?"Saving…":`Yes, ${formatMoney(row.payNow,row.currency)} paid`}</Button><Button type="button" variant="quiet" onClick={()=>setConfirming(false)}>Cancel</Button></div>
    {state.error&&<p className="field-error" role="alert">{state.error}</p>}
    <p className="field-help">Paid a different amount? Use “Record a payment” at the top instead.</p>
  </form>;
}

export function FinanceManager({data,weddingId,dueWithin,initialAdd}:{data:FinanceData;weddingId:string;dueWithin?:{days:number;today:string};initialAdd?:"cost"|"payment"}) {
  const [costOpen,setCostOpen]=useState(initialAdd==="cost"&&data.canEdit);
  const [payOpen,setPayOpen]=useState(initialAdd==="payment"&&data.canEdit);
  const owe=whoWeOwe(data.bookings as unknown as OweBooking[], (data.unpaidObligations??[]) as unknown as OweInstalment[], data.today);
  const headlines=data.totals.map(row=>budgetHeadline(row as unknown as Parameters<typeof budgetHeadline>[0]));
  const upcoming=(dueWithin?paymentsDueSoon(data.obligations as unknown as Array<{id:string;due_date:string;remaining:string}>,dueWithin.today,dueWithin.days) as typeof data.obligations:data.obligations);
  return <>
    <PageHeading eyebrow="Money" title="Budget & payments" description="What you've booked, what you've paid, and who you still owe." action={data.canEdit?<div className="finance-main-actions"><Button onClick={()=>setCostOpen(true)}><Plus size={15} aria-hidden="true"/> Add a cost</Button><Button variant="secondary" onClick={()=>setPayOpen(true)}>Record a payment</Button></div>:undefined}/>
    {headlines.map(h=><section key={h.currency} className="finance-headline" aria-label={`Totals in ${h.currency}`}>
      <div className="finance-headline-tile"><span>Budget</span><strong>{h.budget===null?"Not set":formatMoney(h.budget,h.currency)}</strong>{h.budget===null&&<a className="text-link" href="/settings">Set it in Settings</a>}</div>
      <div className="finance-headline-tile"><span>Booked</span><strong>{formatMoney(h.booked,h.currency)}</strong><small>Agreed prices</small></div>
      <div className="finance-headline-tile is-due"><span>Still to pay</span><strong>{formatMoney(h.stillToPay,h.currency)}</strong><small>Paid so far {formatMoney(h.paid,h.currency)}</small></div>
      {h.leftInBudget!==null&&<p className={`finance-headline-note ${h.leftInBudget.startsWith("-")?"is-over":""}`}>{h.leftInBudget.startsWith("-")?`Expected costs are ${formatMoney(h.leftInBudget.slice(1),h.currency)} over budget.`:`${formatMoney(h.leftInBudget,h.currency)} of the budget is left after everything booked and estimated.`}</p>}
    </section>)}
    {data.bookings.some(b=>b.overpaid)&&<div className="finance-warning" role="status"><AlertTriangle size={17}/> Paid more than the agreed price: {data.bookings.filter(b=>b.overpaid).map(b=>b.label).join(", ")}.</div>}
    <Card id="who-we-owe" title="Who we still owe" subtitle={owe.length?"Overdue first, then by the next due date.":undefined}>
      {owe.length?<ul className="owe-list">{owe.map(row=><li key={row.bookingId} className={row.overdue?"is-overdue":""}>
        <div className="owe-main"><span className="table-primary">{row.label}</span><span className="table-secondary">{row.supplier==="No supplier selected"?"":row.supplier}</span></div>
        <div className="owe-amounts"><strong>{formatMoney(row.balance,row.currency)}</strong><span className="table-secondary">{row.next?`${row.overdue?"Overdue: ":"Next: "}${row.next.label}, ${formatMoney(row.next.remaining,row.currency)} by ${dateLabel(row.next.due_date)}`:"No instalments scheduled"}</span></div>
        {data.canEdit&&<MarkPaid row={row} weddingId={weddingId} today={data.today}/>}
      </li>)}</ul>:<EmptyState title={data.bookings.length?"Nothing left to pay":"No bookings yet"} description={data.bookings.length?"Every booking is fully paid.":"When you book a vendor, add it here with “Add a cost”, or from its card on Venues & vendors."}/>}
    </Card>
    <Card title="Bookings" subtitle="Each agreed price counts once."><DataTable className="stack-on-phone" label="Bookings" headers={["Booking","Vendor · category","Agreed","Status","Paid / left"]}>{data.bookings.map(b=><tr key={b.id}><td><span className="table-primary">{b.label}</span><a className="text-link table-secondary" href={`/documents?entity=booking&id=${b.id}`}>Files</a>{b.allocated_total!==b.agreed_total&&<span className="field-error">The split across functions doesn’t add up to the price</span>}</td><td>{b.supplier_name}<span className="table-secondary">{b.category}</span></td><td><Amount value={b.agreed_total} currency={b.currency}/></td><td><StageBadge kind="booking" status={b.status}/>{b.overpaid&&<span className="field-error">Overpaid</span>}</td><td><Amount value={b.net_paid} currency={b.currency}/><span className="table-secondary">{b.status==="cancelled"?`Refund expected: ${b.refund_expected_amount??"Unknown"}`:`Left: ${formatMoney(b.balance,b.currency)}`}</span></td></tr>)}</DataTable>{!data.bookings.length&&<EmptyState title="No bookings yet" description="Use “Add a cost” once you’ve agreed a price with a vendor."/>}</Card>
    <Card title="Estimates" subtitle="Rough costs for things not booked yet. They count towards the expected total."><DataTable className="stack-on-phone" label="Estimates" headers={["Item","Category","Function","Amount","State"]}>{data.estimates.map(row=><tr key={row.id}><td>{row.label}</td><td>{row.category}</td><td>{row.function_name}</td><td><Amount value={row.amount} currency={row.currency}/></td><td><StatusLabel>{row.status}</StatusLabel></td></tr>)}</DataTable>{!data.estimates.length&&<EmptyState title="No estimates yet" description="Add a rough cost for anything you haven't booked, so the budget shows what's coming."/>}</Card>
    <details className="more-details finance-more" open={Boolean(dueWithin)}><summary>More: instalments, refunds, budget split, paying people back</summary>
      {data.refundDue.length>0&&<Card title="Refunds still due"><ul className="finance-list">{data.refundDue.map((row,index)=><li key={`${row.booking}-${index}`}><span>{row.booking}</span><strong><Amount value={row.amount} currency={row.currency}/></strong></li>)}</ul></Card>}
      <Card id="upcoming-payments" title="Upcoming instalments" subtitle={dueWithin?`Due within ${dueWithin.days} days (the Home page count)`:"Scheduled instalments still to pay"} action={dueWithin?<a className="text-link" href="/budget#upcoming-payments">Show all</a>:undefined}><DataTable className="stack-on-phone" label="Upcoming instalments" headers={["Booking","Instalment","Due","Left to pay"]}>{upcoming.map(row=><tr key={row.id}><td>{row.booking_label}</td><td>{row.label}</td><td>{dateLabel(row.due_date)}</td><td><Amount value={row.remaining} currency={row.currency}/></td></tr>)}</DataTable>{!upcoming.length&&<EmptyState title="No instalments scheduled" description="Add a deposit or instalment below to get reminders before it's due."/>}</Card>
      <Card title="Payments and refunds" subtitle="Your own records; nothing is checked with a bank."><DataTable label="Payments and refunds" headers={["Booking","Type","Date","Paid by","Amount"]}>{data.bookings.flatMap(b=>b.transactions.map((tx:LooseRow)=><tr key={tx.id}><td>{b.label}</td><td>{tx.kind==="refund"?"Refund":"Payment"}</td><td>{dateLabel(tx.happened_on)}</td><td>{tx.payer_label||"Not recorded"}{tx.contributions.map((c:LooseRow)=><span className="table-secondary" key={c.id}>{c.contributor_label}: {c.amount} {tx.currency}</span>)}</td><td><Amount value={String(tx.amount)} currency={tx.currency}/></td></tr>))}</DataTable></Card>
      <div className="finance-grid"><Card title="Budget split by category" subtitle="Optional targets per category. Not a cost or a payment."><DataTable label="Budget split by category" headers={["Category","Function","Amount"]}>{data.allocations.map(row=><tr key={row.id}><td>{row.category}</td><td>{row.function_name}</td><td><Amount value={row.amount} currency={row.currency}/></td></tr>)}</DataTable>{!data.allocations.length&&<EmptyState title="No budget split yet" description="Split your budget by category if it helps."/>}</Card>
      <Card title="Other expected costs" subtitle="Extra amounts added to (or taken off) the expected total, with a reason."><DataTable label="Other expected costs" headers={["Category","Reason","Function","Amount"]}>{data.adjustments.map(row=><tr key={row.id}><td>{row.category}</td><td>{row.reason}</td><td>{row.function_id?data.functions.find(fn=>fn.id===row.function_id)?.name??"Function":"Wedding-wide"}</td><td>{row.amount} {row.currency}</td></tr>)}</DataTable></Card></div>
      <Card title="Paying people back" subtitle="When family or friends paid for something. Kept apart from vendor spending."><DataTable label="Paying people back" headers={["From","To","Booking","Due","Amount","Status"]}>{data.reimbursements.map(row=><tr key={row.id}><td>{row.from_label}</td><td>{row.to_label}</td><td>{data.bookings.find(b=>b.id===row.booking_id)?.label??"—"}</td><td>{row.due_date?dateLabel(row.due_date):"Not set"}</td><td><Amount value={row.amount} currency={row.currency}/></td><td>{row.status==="paid"?"Paid":"Planned"}</td></tr>)}</DataTable>{!data.reimbursements.length&&<EmptyState title="Nothing to pay back" description="Record it here when someone pays for something on your behalf."/>}</Card>
      <p className="finance-explanation"><strong>How the totals work:</strong> “Booked” counts agreed prices only. The expected total adds bookings that aren’t final yet, estimates and other expected costs. Cancelled bookings and estimates that became bookings aren’t counted. A booking split across functions is still counted once.</p>
      {data.canEdit&&<><h3 className="finance-more-heading">Less common changes</h3><div className="finance-grid"><CancellationForm data={data} weddingId={weddingId}/></div><OtherFinanceForms data={data} weddingId={weddingId}/></>}
    </details>
    {data.canEdit&&<><AddCostDialog data={data} weddingId={weddingId} open={costOpen} onClose={()=>setCostOpen(false)}/><PaymentDialog data={data} weddingId={weddingId} open={payOpen} onClose={()=>setPayOpen(false)}/></>}
  </>;
}

function dateLabel(value: string) {
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return String(value);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}
