import { coupleNames, invitationConfig } from "@/config/invitation";
import { COVER_SCRIPT, Cover, PetalShower } from "@/components/invite/Cover";
import { Countdown } from "@/components/invite/Countdown";
import { Events } from "@/components/invite/Events";
import { Families } from "@/components/invite/Families";
import { FamilyReply } from "@/components/invite/FamilyReply";
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
function weddingInstant(date: string | null, timezone: string, functions: Array<{ date: string | null; start_time: string | null }>) {
  if (!date) return null;
  const sameDay = functions.filter((fn) => fn.date === date && fn.start_time).map((fn) => fn.start_time!.slice(0, 5)).sort()[0];
  try { return zonedDateTimeToUtc(date, invitationConfig.weddingTime ?? sameDay ?? "00:00", timezone); } catch { return null; }
}

/** The couple's invitation for one family: their name on the cover, their events and their reply. */
export function InvitationView({ code, invitation }: { code: string; invitation: FamilyInvitation }) {
  const weddingDate = invitation.wedding.date;
  const target = weddingInstant(weddingDate, invitation.wedding.timezone, invitation.functions);
  const date = weddingDate ? formatDate(weddingDate) : null;
  const respondBy = invitationConfig.rsvp.respondBy ? formatDate(invitationConfig.rsvp.respondBy).long : null;
  return (
    <MusicProvider track={invitationConfig.music}>
      <script dangerouslySetInnerHTML={{ __html: COVER_SCRIPT }} />
      <Cover bride={invitationConfig.brideName} groom={invitationConfig.groomName} family={invitation.family} />
      <PetalShower />
      <Nav names={coupleNames} logo={<Seal className="size-10" size={80} />} showGoodToKnow={hasGoodToKnow(invitationConfig.goodToKnow)} />
      <main>
        <Hero family={invitation.family} weddingDate={weddingDate} />
        <Story />
        <Families />
        <Events events={invitation.functions} />
        <GoodToKnow notes={invitationConfig.goodToKnow} />
        <FamilyReply code={code} family={invitation.family} maxGuests={invitation.max_guests} events={invitation.functions.map((fn) => ({ id: fn.id, name: fn.name }))} saved={invitation.reply} respondBy={respondBy} />
        <Countdown targetMs={target ? target.getTime() : null} dateLabel={date ? `${date.weekday}, ${date.long} (${invitation.wedding.timezone === "Asia/Kolkata" ? "India time" : invitation.wedding.timezone})` : null} />
      </main>
      <Footer weddingDate={weddingDate} />
    </MusicProvider>
  );
}

/** Shown for an unknown, replaced or removed link. */
export function InvitationNotFound() {
  return (
    <main className="grid min-h-svh place-items-center bg-paper px-5 py-16 text-center text-maroon">
      <div className="max-w-md">
        <Emblem alt={coupleNames} sizes="16rem" className="mx-auto w-52" />
        <h1 className="mt-6 font-display text-[2rem] leading-tight font-medium">This invitation link isn&rsquo;t working</h1>
        <p className="mt-3 text-maroon/85">It may have been replaced with a new one. Please ask the family who sent it to you for your current link.</p>
      </div>
    </main>
  );
}
