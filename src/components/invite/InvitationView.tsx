import { coupleNames as defaultCoupleNames, invitationConfig, type InvitationConfig } from "@/config/invitation";
import { coupleNamesOf } from "@/lib/invitation/settings";
import { COVER_SCRIPT, Cover, PetalShower } from "@/components/invite/Cover";
import { Countdown } from "@/components/invite/Countdown";
import { Events } from "@/components/invite/Events";
import { Families } from "@/components/invite/Families";
import { FamilyReply, type SavedReply } from "@/components/invite/FamilyReply";
import { Footer } from "@/components/invite/Footer";
import { GoodToKnow, hasGoodToKnow } from "@/components/invite/GoodToKnow";
import { Hero } from "@/components/invite/Hero";
import { Emblem, Seal } from "@/components/invite/Monogram";
import { MusicProvider } from "@/components/invite/MusicProvider";
import { Nav } from "@/components/invite/Nav";
import { Story } from "@/components/invite/Story";
import type { FamilyInvitation } from "@/lib/family-invites/public";
import { formatDate, zonedDateTimeToUtc } from "@/lib/invite/datetime";

/** When the countdown ends: the wedding date at the configured time, else the first function that day, else midnight. */
function weddingInstant(date: string | null, timezone: string, functions: Array<{ date: string | null; start_time: string | null }>, weddingTime: string | null) {
  if (!date) return null;
  const sameDay = functions.filter((fn) => fn.date === date && fn.start_time).map((fn) => fn.start_time!.slice(0, 5)).sort()[0];
  try { return zonedDateTimeToUtc(date, weddingTime ?? sameDay ?? "00:00", timezone); } catch { return null; }
}

/** Only the answers go to the page: who replied and their phone number are never shown or sent. */
function savedReply(reply: FamilyInvitation["reply"]): SavedReply | null {
  if (!reply) return null;
  const { attending, guest_count, function_ids, dietary, dietary_notes, message } = reply;
  return { attending, guest_count, function_ids, dietary, dietary_notes, message };
}

/**
 * The couple's invitation for one family: their name on the cover, their events and their reply.
 * `preview` is the couple's own view (Guests → Invitation): a banner, hints where lines are
 * missing, and a reply form that is never sent.
 */
export function InvitationView({ code, invitation, preview = false, draft = false, config = invitationConfig }: { code: string; invitation: FamilyInvitation; preview?: boolean; draft?: boolean; config?: InvitationConfig }) {
  const coupleNames = coupleNamesOf(config);
  const weddingDate = invitation.wedding.date;
  const target = weddingInstant(weddingDate, invitation.wedding.timezone, invitation.functions, config.weddingTime);
  const date = weddingDate ? formatDate(weddingDate) : null;
  const respondBy = config.rsvp.respondBy ? formatDate(config.rsvp.respondBy).long : null;
  return (
    <MusicProvider track={config.music}>
      <script dangerouslySetInnerHTML={{ __html: COVER_SCRIPT }} />
      {preview ? <p role="note" className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] bg-maroon/95 px-4 py-1.5 text-center font-label text-[0.9rem] tracking-wide text-ivory">Preview for {invitation.family}{draft ? " · draft wording, not published" : ""} · replies here aren&rsquo;t saved</p> : null}
      <Cover bride={config.brideName} groom={config.groomName} family={invitation.family} />
      <PetalShower />
      <Nav names={coupleNames} logo={<Seal className="size-10" size={80} />} showGoodToKnow={hasGoodToKnow(config.goodToKnow)} />
      <main>
        <Hero family={invitation.family} weddingDate={weddingDate} config={config} />
        <Story />
        <Families config={config} {...(preview ? { hints: true } : {})} />
        <Events events={invitation.functions} descriptions={config.eventDescriptions} />
        <GoodToKnow notes={config.goodToKnow} {...(preview ? { hints: true } : {})} />
        <FamilyReply code={code} family={invitation.family} maxGuests={invitation.max_guests} events={invitation.functions.map((fn) => ({ id: fn.id, name: fn.name }))} saved={savedReply(invitation.reply)} respondBy={respondBy} preview={preview} />
        <Countdown targetMs={target ? target.getTime() : null} dateLabel={date ? `${date.weekday}, ${date.long} (${invitation.wedding.timezone === "Asia/Kolkata" ? "India time" : invitation.wedding.timezone})` : null} />
      </main>
      <Footer weddingDate={weddingDate} config={config} />
    </MusicProvider>
  );
}

/** Shown for an unknown, replaced or removed link. */
export function InvitationNotFound() {
  return (
    <main className="grid min-h-svh place-items-center bg-paper px-5 py-16 text-center text-maroon">
      <div className="max-w-md">
        <Emblem alt={defaultCoupleNames} sizes="16rem" className="mx-auto w-52" />
        <h1 className="mt-6 font-display text-[2rem] leading-tight font-medium">This invitation link isn&rsquo;t working</h1>
        <p className="mt-3 text-maroon/85">It may have been replaced with a new one. Please ask the family who sent it to you for your current link.</p>
      </div>
    </main>
  );
}
