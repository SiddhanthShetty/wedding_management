"use client";
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

/**
 * Labelled form controls with generated ids, so the same field name can appear in many forms
 * on one page without duplicate ids. Hints are linked through aria-describedby.
 */
export function TextInput({ label, hint, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId();
  return <div className={`field ${className}`}>
    <label className="field-label" htmlFor={id}>{label}{props.required && <span aria-hidden="true"> *</span>}</label>
    <input className="field-control" id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />
    {hint && <span className="field-help" id={`${id}-hint`}>{hint}</span>}
  </div>;
}

export function Select({ label, hint, children, className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return <div className={`field ${className}`}>
    <label className="field-label" htmlFor={id}>{label}{props.required && <span aria-hidden="true"> *</span>}</label>
    <select className="field-control" id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...props}>{children}</select>
    {hint && <span className="field-help" id={`${id}-hint`}>{hint}</span>}
  </div>;
}

export function TextArea({ label, hint, className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  const id = useId();
  return <div className={`field ${className}`}>
    <label className="field-label" htmlFor={id}>{label}</label>
    <textarea className="field-control" id={id} rows={props.rows ?? 2} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />
    {hint && <span className="field-help" id={`${id}-hint`}>{hint}</span>}
  </div>;
}

export function Checkbox({ label, hint, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId();
  return <div className={`field field-check ${className}`}>
    <input type="checkbox" id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />
    <label htmlFor={id}>{label}</label>
    {hint && <span className="field-help" id={`${id}-hint`}>{hint}</span>}
  </div>;
}
