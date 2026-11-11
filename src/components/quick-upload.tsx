"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip } from "lucide-react";
import { MAX_DOCUMENT_BYTES } from "@/lib/documents/file-type";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.txt,.csv";

/**
 * One step: choose a file and it's uploaded and attached to the record straight away,
 * titled with its file name. The server still checks size, type and permission.
 */
export function QuickUpload({ weddingId, entityType, entityId, label = "Add a file" }: { weddingId: string; entityType: string; entityId: string; label?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ error?: string; message?: string }>({});
  const [pending, setPending] = useState(false);

  async function upload(file: File) {
    if (file.size > MAX_DOCUMENT_BYTES) { setState({ error: "Files can be up to 8 MB." }); return; }
    const form = new FormData();
    form.set("weddingId", weddingId); form.set("entityType", entityType); form.set("entityId", entityId);
    form.set("documentId", ""); form.set("title", ""); form.set("category", ""); form.set("file", file);
    setPending(true); setState({});
    try {
      const response = await fetch("/api/documents", { method: "POST", body: form, credentials: "same-origin", cache: "no-store" });
      const body = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !body?.ok) { setState({ error: body?.message ?? "The upload failed. Nothing was saved." }); return; }
      setState({ message: `Added ${file.name}.` });
      router.refresh();
    } catch {
      setState({ error: "The upload couldn't reach the server. Nothing was saved." });
    } finally {
      setPending(false);
      if (input.current) input.current.value = "";
    }
  }

  return <div className="quick-upload">
    <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
    <button type="button" className="button button-secondary" disabled={pending} onClick={() => input.current?.click()}><Paperclip size={15} aria-hidden="true" /> {pending ? "Uploading…" : label}</button>
    {state.error && <p className="field-error" role="alert">{state.error}</p>}
    {!state.error && state.message && <p className="field-success" role="status">{state.message}</p>}
    <span className="field-help">PDF, photo, Word, Excel or text, up to 8 MB. Files aren&apos;t virus-scanned, so only add ones you trust.</span>
  </div>;
}
