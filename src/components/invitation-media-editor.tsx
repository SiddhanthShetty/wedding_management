"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Music } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { TextInput } from "@/components/form-fields";
import { MAX_GALLERY_PHOTOS, MAX_MUSIC_BYTES, resizeToJpeg, type PortalMedia } from "@/lib/invitations/media";
import type { InvitationWorkspace } from "@/lib/data/invitations";
import { captionMediaAction, deleteMediaAction } from "@/app/actions/invitations";

type Data = InvitationWorkspace;
type Design = Data["designs"][number];

/** Where the studio loads a design's media from (signed-in members only). */
export function studioMedia(data: Data, designId: string | undefined): PortalMedia | undefined {
  if (!designId) return undefined;
  const rows = data.media.filter((row) => row.design_id === designId);
  if (!rows.length) return undefined;
  return {
    base: `/api/invitations/media/${data.wedding.id}/`,
    music: rows.find((row) => row.kind === "music")?.id ?? null,
    gallery: rows.filter((row) => row.kind === "gallery").sort((a, b) => a.position - b.position).map((row) => ({ id: row.id, caption: row.caption })),
  };
}

async function upload(data: Data, design: Design, kind: "music" | "gallery", file: Blob, name: string) {
  const form = new FormData();
  form.set("weddingId", data.wedding.id); form.set("designId", design.id); form.set("kind", kind); form.set("caption", "");
  form.set("file", file, name);
  const response = await fetch("/api/invitations/media", { method: "POST", body: form, credentials: "same-origin" });
  const body = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
  if (!response.ok || !body?.ok) throw new Error(body?.message ?? "The upload failed. Nothing was saved.");
}

const megabytes = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;

/** One music file per design; guests hear it only after they tap. Saved straight away. */
export function MusicUploader({ data, design }: { data: Data; design?: Design }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!design) return <p className="field-help">Create the design first, then add music.</p>;
  const music = data.media.find((row) => row.design_id === design.id && row.kind === "music");
  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    if (file.size > MAX_MUSIC_BYTES) { setError(`This file is ${megabytes(file.size)}. Music can be up to 1.5 MB: trim it to about 90 seconds or export at a lower quality.`); return; }
    setBusy(true);
    try { await upload(data, design, "music", file, file.name); router.refresh(); } catch (problem) { setError((problem as Error).message); } finally { setBusy(false); }
  };
  return <div className="section-stack">
    <p className="field-help">Plays when a guest taps to open the invitation, with a button to pause. It never starts on its own. Only use music you have the rights to share. MP3, M4A or OGG, up to 1.5 MB.</p>
    {music && <div className="music-row">
      <audio controls preload="none" src={`/api/invitations/media/${data.wedding.id}/${music.id}`} />
      <span className="row-meta">{megabytes(music.byte_size)}</span>
      {data.canEdit && <ActionForm action={deleteMediaAction} submitLabel="Remove music" variant="quiet" className="inline-action-form">
        <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="mediaId" value={music.id} />
      </ActionForm>}
    </div>}
    {data.canEdit && <label className="button button-secondary photo-pick"><Music size={15} aria-hidden="true" /> {busy ? "Uploading…" : music ? "Replace music" : "Choose music"}
      <input type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,.mp3,.m4a,.ogg" className="sr-only" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void choose(file); }} />
    </label>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </div>;
}

/** Up to 8 photos, resized on this device before upload. Saved straight away. */
export function GalleryEditor({ data, design }: { data: Data; design?: Design }) {
  const router = useRouter();
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState("");
  if (!design) return <p className="field-help">Create the design first, then add photos.</p>;
  const photos = data.media.filter((row) => row.design_id === design.id && row.kind === "gallery").sort((a, b) => a.position - b.position);
  const room = MAX_GALLERY_PHOTOS - photos.length;
  const add = async (files: File[]) => {
    setError("");
    const chosen = files.slice(0, room);
    const problems: string[] = [];
    if (files.length > room) problems.push(`Only ${room} more photo${room === 1 ? "" : "s"} fit; the rest were skipped.`);
    for (const [index, file] of chosen.entries()) {
      setProgress(`Adding photo ${index + 1} of ${chosen.length}…`);
      try { await upload(data, design, "gallery", await resizeToJpeg(file), file.name.replace(/\.[^.]+$/, "") + ".jpg"); }
      catch (problem) { problems.push((problem as Error).message); }
    }
    setProgress(null);
    if (problems.length) setError(problems.join(" "));
    router.refresh();
  };
  return <div className="section-stack">
    <p className="field-help">Up to {MAX_GALLERY_PHOTOS} photos. They are resized on this device first, and only invited guests (and open family previews) can see them.</p>
    {photos.length > 0 && <ul className="media-grid">{photos.map((photo) => <li key={photo.id}>
      {/* eslint-disable-next-line @next/next/no-img-element -- private, signed-in file */}
      <img src={`/api/invitations/media/${data.wedding.id}/${photo.id}`} alt={photo.caption || "Gallery photo"} loading="lazy" />
      {data.canEdit ? <>
        <ActionForm action={captionMediaAction} submitLabel="Save caption" variant="quiet" className="section-stack">
          <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="mediaId" value={photo.id} />
          <TextInput label="Caption (optional)" name="caption" maxLength={80} defaultValue={photo.caption} />
        </ActionForm>
        <ActionForm action={deleteMediaAction} submitLabel="Remove" variant="quiet" className="inline-action-form">
          <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="mediaId" value={photo.id} />
        </ActionForm>
      </> : photo.caption && <p className="row-meta">{photo.caption}</p>}
    </li>)}</ul>}
    {data.canEdit && room > 0 && <label className="button button-secondary photo-pick"><ImagePlus size={15} aria-hidden="true" /> {progress ?? "Add photos"}
      <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple className="sr-only" disabled={progress !== null} onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ""; if (files.length) void add(files); }} />
    </label>}
    {room <= 0 && <p className="field-help">The gallery is full. Remove a photo to add another.</p>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </div>;
}

