import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { AlertCircle, Check, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { describeStatus, STAGE_HELP, type RecordKind } from "@/lib/planning/status-vocabulary";

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1 className="page-title">{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action && <div className="heading-actions">{action}</div>}</header>;
}

export function Button({ variant = "primary", className = "", ref, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "quiet"; ref?: Ref<HTMLButtonElement> }) {
  return <button ref={ref} className={`button button-${variant} ${className}`} {...props} />;
}

export function Card({ title, subtitle, action, children, className = "", id }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`card ${className}`}>{(title || subtitle || action) && <div className="card-header"><div>{title && <h2 className="card-title">{title}</h2>}{subtitle && <p className="card-subtitle">{subtitle}</p>}</div>{action}</div>}<div className="card-body">{children}</div></section>;
}

const statusKinds: Record<string, string> = {
  Confirmed: "confirmed", Complete: "complete", Completed: "complete", Paid: "paid", Pending: "pending", "Quote received": "pending", Tentative: "tentative", Due: "due", Overdue: "overdue", Cancelled: "cancelled", Draft: "draft", Estimated: "neutral", Shortlisted: "neutral", "Not started": "neutral", "In progress": "pending", Blocked: "overdue", Archived: "neutral", Open: "pending", Decided: "confirmed", Deferred: "neutral",
};

export function StatusLabel({ children }: { children: string }) {
  const kind = statusKinds[children] ?? "neutral";
  return <span className={`status status-${kind}`}><span aria-hidden="true">{kind === "confirmed" || kind === "complete" ? "✓" : "•"}</span>{children}</span>;
}

export function DemoNotice({ children = "Preview only. This uses made-up sample data, and changes aren't saved." }: { children?: ReactNode }) {
  return <div className="demo-note" role="note"><Info size={15} aria-hidden="true" /><span>{children}</span></div>;
}

/** Default empty-state art: a small dot kolam drawn in line, in the wedding's accent colour. */
function KolamArt() {
  const dots = [[12, 12], [24, 12], [36, 12], [12, 24], [24, 24], [36, 24], [12, 36], [24, 36], [36, 36]];
  return <svg className="kolam-art" width="34" height="34" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path d="M24 4 L44 24 L24 44 L4 24 Z M24 12 C30 12 36 18 36 24 C36 30 30 36 24 36 C18 36 12 30 12 24 C12 18 18 12 24 12 Z M18 18 L30 30 M30 18 L18 30" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    {dots.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="currentColor" />)}
  </svg>;
}

export function EmptyState({ title, description, icon }: { title: string; description: string; icon?: ReactNode }) {
  return <div className="empty-state"><span className="state-icon">{icon ?? <KolamArt />}</span><h3 className="state-title">{title}</h3><p className="state-description">{description}</p></div>;
}

export function ErrorState({ title = "This section could not load", description = "Try again in a moment. No changes have been saved.", onRetry }: { title?: string; description?: string; onRetry?: () => void }) {
  return <div className="error-state"><span className="state-icon" style={{ background: "var(--rose-soft)", color: "var(--rose)" }}><AlertCircle size={19} aria-hidden="true" /></span><h3 className="state-title">{title}</h3><p className="state-description">{description}</p>{onRetry && <Button className="" variant="secondary" onClick={onRetry} style={{ marginTop: 14 }}>Try again</Button>}</div>;
}

export function LoadingState({ label = "Loading section" }: { label?: string }) {
  return <div className="loading-state" role="status" aria-label={label}><span className="state-icon"><LoaderCircle size={19} aria-hidden="true" /></span><span className="skeleton" aria-hidden="true" /><span className="state-description">{label}…</span></div>;
}

export function Field({ label, hint, error, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string; className?: string }) {
  const id = props.id ?? props.name;
  return <div className={`field ${className}`}><label className="field-label" htmlFor={id}>{label}{props.required && <span aria-hidden="true"> *</span>}</label><input className="field-control" id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} {...props} />{hint && <span className="field-help" id={`${id}-hint`}>{hint}</span>}{error && <span className="field-error" id={`${id}-error`}>{error}</span>}</div>;
}

export function SelectField({ label, hint, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; children: ReactNode }) {
  const id = props.id ?? props.name;
  return <div className="field"><label className="field-label" htmlFor={id}>{label}</label><select className="field-control" id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...props}>{children}</select>{hint && <span className="field-help" id={`${id}-hint`}>{hint}</span>}</div>;
}

export function TextAreaField({ label, hint, className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  const id = props.id ?? props.name;
  return <div className={`field ${className}`}><label className="field-label" htmlFor={id}>{label}</label><textarea className="field-control" id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />{hint && <span className="field-help" id={`${id}-hint`}>{hint}</span>}</div>;
}

export function DataTable({ headers, children, label, className = "", columnWidths }: { headers: string[]; children: ReactNode; label: string; className?: string; columnWidths?: string[] }) {
  return <div className={`table-scroll ${className}`.trim()}><table className="data-table"><caption className="sr-only">{label}</caption>{columnWidths?.length===headers.length&&<colgroup>{columnWidths.map((width,index)=><col key={index} style={{width}}/>)}</colgroup>}<thead><tr>{headers.map((header) => <th scope="col" key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

export function NotificationRegion({ message, kind = "success", onDismiss }: { message: string; kind?: "success" | "error" | "info"; onDismiss: () => void }) {
  const Icon = kind === "error" ? TriangleAlert : kind === "info" ? Info : Check;
  return <div className="toast-region" aria-live={kind === "error" ? "assertive" : "polite"} aria-atomic="true"><div className={`toast ${kind === "error" ? "toast-error" : ""}`} role={kind === "error" ? "alert" : "status"}><Icon size={16} aria-hidden="true" /><span>{message}</span><button className="icon-button" aria-label="Dismiss notification" onClick={onDismiss}><span aria-hidden="true">×</span></button></div></div>;
}

export function FilterInput(props: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <div className="field"><label className="field-label" htmlFor={props.id}>{props.label}</label><input className="field-control" {...props} /></div>;
}


const stageKinds = { idea: "neutral", planned: "pending", in_progress: "tentative", confirmed: "confirmed", done: "complete", cancelled: "cancelled" } as const;

/** Status in the shared vocabulary (Idea, Planned, In progress, Confirmed, Done, Cancelled). */
export function StageBadge({ kind, status }: { kind: RecordKind; status: string }) {
  const described = describeStatus(kind, status);
  return <span className={`status status-${stageKinds[described.stage]}`} title={STAGE_HELP[described.stage]}>
    <span aria-hidden="true">{described.stage === "confirmed" || described.stage === "done" ? "✓" : "•"}</span>{described.text}
  </span>;
}
