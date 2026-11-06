"use client";
import { paymentsDueSoon } from "@/lib/planning/dashboard";

import { useActionState, useEffect, useState } from "react";
import { AlertTriangle, Plus, X } from "lucide-react";
import { Button, Card, DataTable, EmptyState, Field, PageHeading, SelectField, StatusLabel, TextAreaField } from "@/components/ui";
import { saveAdjustmentAction, saveBookingAction, saveBudgetAllocationAction, saveEstimateAction, saveObligationAction, saveReimbursementAction, recordTransactionAction, cancelBookingAction, type FinanceFormState } from "@/app/actions/finance";
import { allocationDifference, formatMoney } from "@/lib/planning/money";

type FinanceData = { wedding: { currency:string; timezone:string }; canEdit:boolean; totals:Record<string,any>[]; bookings:Record<string,any>[]; estimates:Record<string,any>[]; allocations:Record<string,any>[]; functions:Record<string,any>[]; suppliers:Record<string,any>[]; obligations:Record<string,any>[]; reimbursements:Record<string,any>[]; adjustments:Record<string,any>[]; refundDue:Record<string,any>[] };
const initialState: FinanceFormState = {};

function Result({ state }: { state: FinanceFormState }) {
  return state.error ? <p className="field-error" role="alert">{state.error}</p> : state.message ? <p className="field-help" role="status">{state.message}</p> : null;
}
function Amount({ value, currency }: { value: string; currency: string }) { return <>{formatMoney(value,currency)}</>; }
function FormShell({ title, children, action, state, weddingId }: { title:string; children:React.ReactNode; action:(form:FormData)=>void; state:FinanceFormState; weddingId:string }) {
  return <Card title={title}><form action={action} className="finance-form"><input type="hidden" name="weddingId" value={weddingId}/>{children}<Button type="submit">Save</Button><Result state={state}/></form></Card>;
}

function EstimateForm({ data, weddingId }: { data:FinanceData; weddingId:string }) {
  const [state,action]=useActionState(saveEstimateAction,initialState);
  return <FormShell title="Add unbooked estimate" action={action} state={state} weddingId={weddingId}>
    <Field label="Item" name="label" required maxLength={200}/><Field label="Category" name="category" required maxLength={120}/>
    <SelectField label="Applies to" name="functionId"><option value="">Wedding-wide</option>{data.functions.map((fn)=><option value={fn.id} key={fn.id}>{fn.name}</option>)}</SelectField>
    <Field label="Estimated amount" name="amount" inputMode="decimal" placeholder="0.00" required/><Field label="Currency" name="currency" defaultValue={data.wedding.currency} required maxLength={3}/>
  </FormShell>;
}

function AllocationRows({ functions, currency, agreedAmount }: { functions:FinanceData["functions"]; currency:string; agreedAmount:string }) {
  const [rows,setRows]=useState([{id:1,functionId:"",amount:""}]);
  const update=(index:number,key:"functionId"|"amount",value:string)=>setRows(current=>current.map((row,i)=>i===index?{...row,[key]:value}:row));
  let difference=""; try { if(agreedAmount) difference=allocationDifference(agreedAmount,rows.map(row=>row.amount||"0")); } catch { difference="invalid"; }
  return <fieldset className="finance-allocation"><legend>Booking allocation split</legend>{rows.map((row,index)=><div className="finance-allocation-row" key={row.id}>
    <SelectField label={`Function allocation ${index+1}`} name="allocationFunctionId" value={row.functionId} onChange={(event)=>update(index,"functionId",event.target.value)}><option value="">Wedding-wide</option>{functions.map(fn=><option key={fn.id} value={fn.id}>{fn.name}</option>)}</SelectField>
    <Field label={`Allocation amount ${index+1}`} name="allocationAmount" value={row.amount} inputMode="decimal" placeholder="0.00" onChange={(event)=>update(index,"amount",event.target.value)}/>
    {rows.length>1&&<Button type="button" variant="quiet" aria-label={`Remove allocation ${index+1}`} onClick={()=>setRows(current=>current.filter((_,i)=>i!==index))}><X size={16}/></Button>}
  </div>)}<Button type="button" variant="secondary" onClick={()=>setRows(current=>[...current,{id:Date.now(),functionId:"",amount:""}])}><Plus size={15}/> Add function split</Button>
  <p className={difference==="0.00"?"field-help":"field-error"} role="status">{difference==="0.00"?"Allocations reconcile.":difference==="invalid"?"Enter valid decimal amounts for this allocation.":`Allocation difference: ${difference||"enter booking total and splits"} ${currency}. Allocations must equal the agreed booking amount.`}</p><p className="field-help">All allocations use the booking currency. Entered booking: {agreedAmount||"not yet entered"}.</p></fieldset>;
}

function BookingForm({ data,weddingId }: {data:FinanceData;weddingId:string}) {
  const [state,action]=useActionState(saveBookingAction,initialState); const [amount,setAmount]=useState("");
  return <FormShell title="Record a booking" action={action} state={state} weddingId={weddingId}>
    <Field label="Booking name" name="label" required maxLength={200}/><Field label="Category" name="category" required maxLength={120}/>
    <SelectField label="Supplier" name="supplierId"><option value="">No supplier linked</option>{data.suppliers.map((supplier)=><option key={supplier.id} value={supplier.id}>{supplier.name} · {supplier.category}</option>)}</SelectField>
    <SelectField label="Convert unbooked estimate" name="sourceEstimateId"><option value="">No linked estimate</option>{data.estimates.filter(e=>e.status==="active").map((estimate)=><option key={estimate.id} value={estimate.id}>{estimate.label} · {estimate.currency} {estimate.amount}</option>)}</SelectField>
    <Field label="Agreed booking cost" name="amount" value={amount} onChange={(event)=>setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" required/><Field label="Currency" name="currency" defaultValue={data.wedding.currency} maxLength={3} required/>
    <SelectField label="Booking status" name="status" defaultValue="tentative"><option value="tentative">Tentative</option><option value="confirmed">Confirmed</option></SelectField>
    <AllocationRows functions={data.functions} currency={data.wedding.currency} agreedAmount={amount}/>
  </FormShell>;
}

function PaymentForm({ data,weddingId }: {data:FinanceData;weddingId:string}) {
  const [state,action]=useActionState(recordTransactionAction,initialState); const [key,setKey]=useState("");
  useEffect(()=>setKey(crypto.randomUUID()),[]); useEffect(()=>{if(state.message)setKey(crypto.randomUUID());},[state.message]);
  const [bookingId,setBookingId]=useState(""); const booking=data.bookings.find(row=>row.id===bookingId);
  const [contributors,setContributors]=useState([{id:1}]);
  return <FormShell title="Record payment or refund" action={action} state={state} weddingId={weddingId}>
    <SelectField label="Booking" name="bookingId" required value={bookingId} onChange={event=>setBookingId(event.target.value)}><option value="">Choose a booking</option>{data.bookings.map(row=><option key={row.id} value={row.id}>{row.label} · {row.status}</option>)}</SelectField>
    <SelectField label="Record type" name="kind"><option value="payment">Payment made</option><option value="refund">Refund received</option></SelectField>
    <Field label="Amount" name="amount" inputMode="decimal" placeholder="0.00" required/><Field label="Currency" name="currency" value={booking?.currency??data.wedding.currency} readOnly maxLength={3} required/>
    <Field label="Date" name="date" type="date" defaultValue={new Intl.DateTimeFormat("en-CA",{timeZone:data.wedding.timezone}).format(new Date())} required/>
    <fieldset className="finance-allocation"><legend>Payer contributions (optional)</legend>{contributors.map((item,index)=><div className="finance-allocation-row" key={item.id}><Field label={`Contributor ${index+1}`} name="contributorLabel" maxLength={160}/><Field label={`Contribution ${index+1}`} name="contributionAmount" inputMode="decimal" placeholder="0.00"/>{contributors.length>1&&<Button type="button" variant="quiet" aria-label={`Remove contributor ${index+1}`} onClick={()=>setContributors(current=>current.filter(row=>row.id!==item.id))}><X size={16}/></Button>}</div>)}<Button type="button" variant="secondary" onClick={()=>setContributors(current=>[...current,{id:Date.now()}])}><Plus size={15}/> Add contributor</Button><p className="field-help">When entered, contribution amounts must add up exactly to the payment amount.</p></fieldset>
    <Field label="Submission key" name="idempotencyKey" value={key} readOnly required hint="Automatically generated to prevent duplicate payment records."/><Field label="Linked due item (optional)" name="obligationId" list="finance-obligations"/><datalist id="finance-obligations">{data.obligations.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}</datalist>
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
    <FormShell title="Add budget allocation" action={budgetAction} state={budgetState} weddingId={weddingId}><Field label="Category" name="category" required/><SelectField label="Applies to" name="functionId"><option value="">Wedding-wide</option>{data.functions.map(fn=><option key={fn.id} value={fn.id}>{fn.name}</option>)}</SelectField><Field label="Allocated amount" name="amount" inputMode="decimal" required/><Field label="Currency" name="currency" defaultValue={data.wedding.currency} required/><TextAreaField label="Notes" name="notes" rows={2}/></FormShell>
    <FormShell title="Schedule a deposit or instalment" action={obAction} state={obState} weddingId={weddingId}><SelectField label="Booking" name="bookingId" required><option value="">Choose a booking</option>{data.bookings.filter(b=>b.status!=="cancelled").map(b=><option key={b.id} value={b.id}>{b.label} · {b.currency} {b.agreed_total}</option>)}</SelectField><Field label="Payment label" name="label" placeholder="Deposit" required/><Field label="Due date" name="dueDate" type="date" required/><Field label="Amount due" name="amount" inputMode="decimal" required/></FormShell>
    <FormShell title="Adjust forecast" action={adjAction} state={adjState} weddingId={weddingId}><Field label="Category" name="category" required/><Field label="Reason" name="reason" required/><SelectField label="Applies to" name="functionId"><option value="">Wedding-wide</option>{data.functions.map(fn=><option key={fn.id} value={fn.id}>{fn.name}</option>)}</SelectField><Field label="Signed adjustment (+ or −)" name="amount" inputMode="decimal" placeholder="-250.00" required/><Field label="Currency" name="currency" defaultValue={data.wedding.currency} required/><p className="field-help">Positive amounts increase the forecast; negative amounts reduce it.</p></FormShell>
    <FormShell title="Record reimbursement" action={reAction} state={reState} weddingId={weddingId}><Field label="Paid by" name="fromLabel" required/><Field label="Reimburse" name="toLabel" required/><Field label="Amount" name="amount" inputMode="decimal" required/><Field label="Currency" name="currency" defaultValue={data.wedding.currency} required/><Field label="Due date" name="dueDate" type="date"/><SelectField label="Status" name="status"><option value="planned">Planned</option><option value="paid">Paid</option></SelectField><Field label="Paid date if paid" name="paidOn" type="date"/><SelectField label="Related booking" name="bookingId"><option value="">None</option>{data.bookings.map(b=><option key={b.id} value={b.id}>{b.label}</option>)}</SelectField><input type="hidden" name="idempotencyKey" value={reKey}/><TextAreaField label="Note" name="note" rows={2}/></FormShell>
  </div>;
}

export function FinanceManager({data,weddingId,dueWithin}:{data:FinanceData;weddingId:string;dueWithin?:{days:number;today:string}}) {
  return <>
    <PageHeading eyebrow="Planning finances" title="Budget & bookings" description="Budget, estimates, agreed booking costs, payments and forecasts stay separate. Totals are shown by currency; no currency conversion is applied." />
    <div className="finance-summary-grid">{data.totals.map((row)=><Card key={row.currency} title={`Totals · ${row.currency}`}><dl className="finance-total-list">
      <div><dt>Wedding budget</dt><dd>{row.budget===null?"Not set":<Amount value={row.budget} currency={row.currency}/>}</dd></div><div><dt>Forecast final cost</dt><dd><Amount value={row.forecast} currency={row.currency}/></dd></div><div><dt>Committed confirmed cost</dt><dd><Amount value={row.committed} currency={row.currency}/></dd></div><div><dt>Net paid</dt><dd><Amount value={row.netPaid} currency={row.currency}/></dd></div><div><dt>Outstanding booking balances</dt><dd><Amount value={row.outstanding} currency={row.currency}/></dd></div>
    </dl></Card>)}</div>
    <p className="finance-explanation"><strong>Forecast formula:</strong> tentative and confirmed booking totals, plus active unbooked estimates, plus signed forecast adjustments. A converted estimate is excluded. Cancelled bookings are excluded. Committed cost includes confirmed bookings only. Shared booking allocations are a breakdown and are never added to booking totals.</p>
    {data.bookings.some(b=>b.overpaid)&&<div className="finance-warning" role="status"><AlertTriangle size={17}/> Overpayment detected on: {data.bookings.filter(b=>b.overpaid).map(b=>b.label).join(", ")}.</div>}
    {data.refundDue.length>0&&<Card title="Outstanding refunds"><ul className="finance-list">{data.refundDue.map((row,index)=><li key={`${row.booking}-${index}`}><span>{row.booking}</span><strong><Amount value={row.amount} currency={row.currency}/></strong></li>)}</ul></Card>}
    <Card id="upcoming-payments" title="Upcoming payments" subtitle={dueWithin?`Due within ${dueWithin.days} days (the dashboard count) · scheduled obligations less linked payments`:"Scheduled obligations less payments linked to each due item"} action={dueWithin?<a className="text-link" href="/budget#upcoming-payments">Show all upcoming</a>:undefined}><DataTable label="Upcoming payment obligations" headers={["Booking","Due item","Due date","Remaining"]}>{(dueWithin?paymentsDueSoon(data.obligations as unknown as Array<{id:string;due_date:string;remaining:string}>,dueWithin.today,dueWithin.days) as typeof data.obligations:data.obligations).map(row=><tr key={row.id}><td>{row.booking_label}</td><td>{row.label}</td><td>{row.due_date}</td><td><Amount value={row.remaining} currency={row.currency}/></td></tr>)}</DataTable>{!data.obligations.length&&<EmptyState title="No upcoming payments scheduled" description="Add a deposit or instalment schedule to a booking. Unscheduled booking balances remain in outstanding balances."/>}</Card>
    {data.canEdit&&<div className="finance-grid"><EstimateForm data={data} weddingId={weddingId}/><BookingForm data={data} weddingId={weddingId}/><PaymentForm data={data} weddingId={weddingId}/><CancellationForm data={data} weddingId={weddingId}/></div>}
    <Card title="Bookings" subtitle="Agreed amount is counted once. Function allocation must equal the agreed total."><DataTable label="Financial bookings" headers={["Booking","Supplier · category","Functions","Agreed","Status","Net paid / balance"]}>{data.bookings.map(b=><tr key={b.id}><td><span className="table-primary">{b.label}</span>{b.status==="cancelled"&&<span className="table-secondary">Cancelled · historical payments retained</span>}</td><td>{b.supplier_name}<span className="table-secondary">{b.category}</span></td><td>{b.allocation_labels.join("; ")}<span className="table-secondary">Allocated: {b.allocated_total} {b.currency}</span>{b.allocated_total!==b.agreed_total&&<span className="field-error">Allocation does not reconcile</span>}</td><td><Amount value={b.agreed_total} currency={b.currency}/></td><td><StatusLabel>{b.status[0]!.toUpperCase()+b.status.slice(1)}</StatusLabel>{b.overpaid&&<span className="field-error">Overpaid</span>}</td><td><Amount value={b.net_paid} currency={b.currency}/><span className="table-secondary">{b.status==="cancelled"?`Refund expected: ${b.refund_expected_amount??"Unknown"}`:`Balance: ${formatMoney(b.balance,b.currency)}`}</span></td></tr>)}</DataTable>{!data.bookings.length&&<EmptyState title="No bookings yet" description="Record an agreed amount and allocate it to the wedding or its functions."/>}</Card>
    <div className="finance-grid"><Card title="Unbooked estimates" subtitle="Only active estimates are included in the forecast."><DataTable label="Unbooked estimates" headers={["Item","Category","Function","Amount","State"]}>{data.estimates.map(row=><tr key={row.id}><td>{row.label}</td><td>{row.category}</td><td>{row.function_name}</td><td><Amount value={row.amount} currency={row.currency}/></td><td><StatusLabel>{row.status}</StatusLabel></td></tr>)}</DataTable>{!data.estimates.length&&<EmptyState title="No estimates recorded" description="Add an estimate for an unbooked item."/>}</Card>
    <Card title="Budget allocations" subtitle="Category budgets are separate from the overall wedding budget and are not summed into spend."><DataTable label="Budget category allocations" headers={["Category","Function","Amount","Currency"]}>{data.allocations.map(row=><tr key={row.id}><td>{row.category}</td><td>{row.function_name}</td><td>{row.amount}</td><td>{row.currency}</td></tr>)}</DataTable>{!data.allocations.length&&<EmptyState title="No category allocations" description="Add planning allocations as needed. They do not represent a cost or payment."/>}</Card></div>
    <Card title="Payments and refunds" subtitle="Manual records only; no bank verification is performed."><DataTable label="Manually recorded payments and refunds" headers={["Booking","Type","Date","Payer / contributor","Amount"]}>{data.bookings.flatMap(b=>b.transactions.map((tx:any)=><tr key={tx.id}><td>{b.label}</td><td>{tx.kind}</td><td>{tx.happened_on}</td><td>{tx.payer_label||"Not recorded"}{tx.contributions.map((c:any)=><span className="table-secondary" key={c.id}>{c.contributor_label}: {c.amount} {tx.currency}</span>)}</td><td><Amount value={String(tx.amount)} currency={tx.currency}/></td></tr>))}</DataTable></Card>
    <Card title="Reimbursements" subtitle="Internal contributions between people; excluded from vendor spend and paid totals."><DataTable label="Reimbursement records" headers={["From","To","Related booking","Due","Amount","Status"]}>{data.reimbursements.map(row=><tr key={row.id}><td>{row.from_label}</td><td>{row.to_label}</td><td>{data.bookings.find(b=>b.id===row.booking_id)?.label??"—"}</td><td>{row.due_date??"Not set"}</td><td><Amount value={row.amount} currency={row.currency}/></td><td>{row.status}</td></tr>)}</DataTable>{!data.reimbursements.length&&<EmptyState title="No reimbursements" description="Record internal reimbursement plans separately from vendor payments."/>}</Card>
    <Card title="Forecast adjustments" subtitle="Each change has a signed amount and a reason."><DataTable label="Forecast adjustments" headers={["Category","Reason","Function","Adjustment"]}>{data.adjustments.map(row=><tr key={row.id}><td>{row.category}</td><td>{row.reason}</td><td>{row.function_id?data.functions.find(fn=>fn.id===row.function_id)?.name??"Function":"Wedding-wide"}</td><td>{row.amount} {row.currency}</td></tr>)}</DataTable></Card>
    {data.canEdit&&<OtherFinanceForms data={data} weddingId={weddingId}/>}
  </>;
}
