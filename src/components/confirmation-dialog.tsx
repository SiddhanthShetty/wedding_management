"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/dialog";

export function ConfirmationDialog({ open, title, description, confirmLabel = "Continue", confirmDisabled = false, onConfirm, onCancel }: { open: boolean; title: string; description: string; confirmLabel?: string; confirmDisabled?: boolean; onConfirm: () => void; onCancel: () => void }) {
  if (!open) return null;
  return <Dialog open={open} role="alertdialog" titleId="confirm-title" descriptionId="confirm-description" onClose={onCancel}><span className="dialog-icon"><AlertTriangle size={19} aria-hidden="true" /></span><h2 className="dialog-title" id="confirm-title">{title}</h2><p className="dialog-copy" id="confirm-description">{description}</p><div className="dialog-actions"><Button variant="secondary" disabled={confirmDisabled} onClick={onCancel}>Cancel</Button><Button disabled={confirmDisabled} onClick={onConfirm}>{confirmLabel}</Button></div></Dialog>;
}
