"use client";
import { Printer } from "lucide-react";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return <button type="button" className="button button-primary no-print" onClick={() => window.print()}><Printer size={15} aria-hidden="true" /> {label}</button>;
}
