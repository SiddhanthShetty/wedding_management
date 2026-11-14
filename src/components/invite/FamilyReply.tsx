"use client";

import { CircleCheck, LoaderCircle } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { submitFamilyReplyAction } from "@/app/actions/family-reply";
import { databaseFieldMessage, DIETARY_OPTIONS, replyErrors, replySchema, type ReplyFields } from "@/lib/family-invites/rules";
import type { FamilyInvitation } from "@/lib/family-invites/public";
import { SectionHeading } from "./Section";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "error"; message: string } | { kind: "done"; attending: boolean; name: string };
/** The family's saved answers. Who replied, and their phone, are never sent to the page. */
export type SavedReply = Pick<NonNullable<FamilyInvitation["reply"]>, "attending" | "guest_count" | "function_ids" | "dietary" | "dietary_notes" | "message">;

function Err({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="mt-1.5 text-[1rem] text-[#8E1B16]">{message}</p> : null;
}

/**
 * One reply for the whole family, as on the invitation site. Replying again, from any phone,
 * updates the same reply.
 */
export function FamilyReply({ code, family, maxGuests, events, saved, respondBy }: { code: string; family: string; maxGuests: number | null; events: Array<{ id: string; name: string }>; saved: SavedReply | null; respondBy: string | null }) {
  const [status, setStatus] = useState<Status>(saved ? { kind: "done", attending: saved.attending, name: "" } : { kind: "idle" });
  const [attending, setAttending] = useState<"accept" | "decline" | "">(saved ? (saved.attending ? "accept" : "decline") : "");
  const [errors, setErrors] = useState<Partial<Record<ReplyFields, string>>>({});
  const form = useRef<HTMLFormElement>(null);
  const result = useRef<HTMLDivElement>(null);
  const sending = useRef(false);
  const max = Math.min(20, maxGuests ?? 10);
  const functionIds = events.map((event) => event.id);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending.current) return; // a second tap while the first is in flight
    const data = new FormData(e.currentTarget);
    if (String(data.get("website") ?? "")) return; // bots fill this in; people never see it
    const payload = {
      fullName: String(data.get("fullName") ?? ""), phone: String(data.get("phone") ?? ""), attending: String(data.get("attending") ?? ""),
      guestCount: String(data.get("guestCount") ?? "0"), events: data.getAll("events").map(String), dietary: String(data.get("dietary") ?? "none"),
      dietaryNotes: String(data.get("dietaryNotes") ?? ""), message: String(data.get("message") ?? ""),
    };
    const checked = replySchema(maxGuests, functionIds).safeParse(payload);
    if (!checked.success) {
      const found = replyErrors(checked.error);
      setErrors(found);
      setStatus({ kind: "error", message: "Please check the highlighted fields." });
      const first = Object.keys(found)[0];
      if (first) (form.current?.querySelector(`[name="${first}"]`) as HTMLElement | null)?.focus();
      return;
    }
    sending.current = true;
    setErrors({});
    setStatus({ kind: "sending" });
    try {
      const response = await submitFamilyReplyAction(code, payload);
      if (response.status === "saved") {
        setStatus({ kind: "done", attending: checked.data.attending, name: checked.data.fullName.split(" ")[0] ?? "" });
        requestAnimationFrame(() => result.current?.focus());
        return;
      }
      if (response.status === "invalid") {
        setErrors(databaseFieldMessage(response.field, maxGuests));
        setStatus({ kind: "error", message: "Please check the highlighted fields." });
        return;
      }
      setStatus({ kind: "error", message: response.status === "busy" ? "Too many attempts. Please wait a few minutes and try again." : "Your response could not be saved. Please try again later, or reply to the family directly." });
    } catch {
      setStatus({ kind: "error", message: "We could not reach the server. Please check your connection and try again." });
    } finally {
      sending.current = false;
    }
  }

  // Once a guest edits a field, its error message goes away.
  function clearError(e: FormEvent<HTMLFormElement>) {
    const name = (e.target as HTMLInputElement).name as ReplyFields;
    if (!name || !errors[name]) return;
    const rest = { ...errors };
    delete rest[name];
    setErrors(rest);
    if (Object.keys(rest).length === 0 && status.kind === "error") setStatus({ kind: "idle" });
  }

  const busy = status.kind === "sending";
  const describe = (name: ReplyFields) => (errors[name] ? { "aria-invalid": true as const, "aria-describedby": `err-${name}` } : {});

  return (
    <section id="rsvp" aria-labelledby="rsvp-title" className="bg-paper px-5 py-20 sm:py-28">
      <SectionHeading id="rsvp-title" title="Will You Join Us?" lead={respondBy ? `Please let us know by ${respondBy}.` : "Please let us know if you can come, so we can plan a proper welcome."} />
      <div className="mx-auto max-w-2xl border border-gold bg-ivory p-5 shadow-[0_14px_40px_-24px_rgba(94,11,18,0.45)] sm:p-9">
        {status.kind === "done" ? (
          <div ref={result} tabIndex={-1} role="status" className="py-6 text-center outline-none">
            <CircleCheck className="mx-auto size-12 text-leaf" aria-hidden="true" />
            <h3 className="mt-4 font-display text-[2rem] leading-tight font-medium">Thank you{status.name ? `, ${status.name}` : ""}. {status.name ? "Your response is saved." : "Your family\u2019s response is saved."}</h3>
            <p className="mx-auto mt-3 max-w-md text-maroon/85">
              {status.attending ? "We are so glad you can come, and we look forward to celebrating with you." : "We will miss you, and we are grateful for your blessings."}
            </p>
            <button type="button" onClick={() => setStatus({ kind: "idle" })} className="inv-btn inv-btn-line mt-6">Change our response</button>
          </div>
        ) : (
          <form ref={form} onSubmit={onSubmit} onInput={clearError} onChange={clearError} noValidate className="space-y-6">
            <p className="border-l-2 border-gold bg-parchment/60 px-3 py-2">
              Replying for <span className="font-semibold">{family}</span>. Anyone in the family can reply; the latest reply counts.
            </p>
            <p className="text-[1rem] text-maroon/75">Fields marked with * are needed.</p>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="fullName" className="inv-label">Your name *</label>
                <input id="fullName" name="fullName" className="inv-field" autoComplete="name" maxLength={120} required {...describe("fullName")} />
                <Err id="err-fullName" message={errors.fullName} />
              </div>
              <div>
                <label htmlFor="phone" className="inv-label">Phone number *</label>
                <input id="phone" name="phone" type="tel" inputMode="tel" className="inv-field" autoComplete="tel" maxLength={20} required placeholder="+91 98765 43210" {...describe("phone")} />
                <Err id="err-phone" message={errors.phone} />
              </div>
            </div>

            <fieldset {...(errors.attending ? { "aria-describedby": "err-attending" } : {})}>
              <legend className="inv-label">Will you be able to come? *</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {([["accept", "Joyfully accepts"], ["decline", "Regretfully declines"]] as const).map(([value, text]) => (
                  <label key={value} className={`flex min-h-12 cursor-pointer items-center gap-3 border px-4 py-2.5 ${attending === value ? "border-maroon bg-parchment" : "border-gold-deep/50"}`}>
                    <input type="radio" name="attending" value={value} checked={attending === value} onChange={() => setAttending(value)} className="size-5 accent-maroon" required />
                    {text}
                  </label>
                ))}
              </div>
              <Err id="err-attending" message={errors.attending} />
            </fieldset>

            {attending === "accept" ? (
              <>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <label htmlFor="guestCount" className="inv-label">How many of you are coming? *</label>
                    <select id="guestCount" name="guestCount" className="inv-field" defaultValue={String(saved?.attending ? Math.min(saved.guest_count, max) : 1)} {...describe("guestCount")}>
                      {Array.from({ length: max }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                    </select>
                    <Err id="err-guestCount" message={errors.guestCount} />
                  </div>
                  <div>
                    <label htmlFor="dietary" className="inv-label">Food preference</label>
                    <select id="dietary" name="dietary" className="inv-field" defaultValue={saved?.dietary ?? "none"}>
                      {DIETARY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                </div>
                <fieldset {...(errors.events ? { "aria-describedby": "err-events" } : {})}>
                  <legend className="inv-label">Which events will you attend? *</legend>
                  <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3">
                    {events.map((event) => (
                      <label key={event.id} className="flex min-h-12 cursor-pointer items-center gap-3 border border-gold-deep/50 px-3 py-2 has-checked:border-maroon has-checked:bg-parchment">
                        <input type="checkbox" name="events" value={event.id} defaultChecked={saved ? saved.function_ids.includes(event.id) : events.length === 1} className="size-5 accent-maroon" />
                        {event.name}
                      </label>
                    ))}
                  </div>
                  <Err id="err-events" message={errors.events} />
                </fieldset>
                <div>
                  <label htmlFor="dietaryNotes" className="inv-label">Allergies or other food needs <span className="text-maroon/70">(optional)</span></label>
                  <input id="dietaryNotes" name="dietaryNotes" className="inv-field" maxLength={300} defaultValue={saved?.dietary_notes ?? ""} {...describe("dietaryNotes")} />
                  <Err id="err-dietaryNotes" message={errors.dietaryNotes} />
                </div>
              </>
            ) : null}

            <div>
              <label htmlFor="message" className="inv-label">A message for the couple <span className="text-maroon/70">(optional)</span></label>
              <textarea id="message" name="message" rows={4} className="inv-field" maxLength={1000} defaultValue={saved?.message ?? ""} {...describe("message")} />
              <Err id="err-message" message={errors.message} />
            </div>

            {/* Bots fill this in; people never see it. */}
            <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
              <label htmlFor="website">Leave this field empty</label>
              <input id="website" name="website" tabIndex={-1} autoComplete="off" />
            </div>

            <div aria-live="assertive">
              {status.kind === "error" ? <p role="alert" className="border border-[#8E1B16]/50 bg-[#FBEDEA] px-4 py-3 text-[#8E1B16]">{status.message}</p> : null}
            </div>

            <button type="submit" disabled={busy} className="inv-btn inv-btn-maroon w-full sm:w-auto">
              {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
              {busy ? "Sending your response" : "Send our response"}
            </button>
            <p className="text-[0.98rem] text-maroon/70">Your details go only to the couple and their families, and are used only to plan the wedding.</p>
          </form>
        )}
      </div>
    </section>
  );
}
