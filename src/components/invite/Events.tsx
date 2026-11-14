import { CalendarDays, Clock, MapPin, Navigation, Shirt } from "lucide-react";
import type { ReactNode } from "react";
import { eventArtFor, invitationConfig } from "@/config/invitation";
import type { InviteEvent } from "@/lib/family-invites/rules";
import { formatDate, formatTimeRange } from "@/lib/invite/datetime";
import { EventArt, eventGround } from "./art";
import { Seal } from "./Monogram";
import { SectionHeading } from "./Section";


/** A map link: the function's own Google Maps link, else a search for the venue. */
export function directionsUrl(event: Pick<InviteEvent, "venue" | "map_url">): string | null {
  if (event.map_url) return event.map_url;
  return event.venue ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.venue)}` : null;
}

const hhmm = (time: string | null) => (time ? time.slice(0, 5) : null);

function Row({ icon, term, children, pending }: { icon: ReactNode; term: string; children: ReactNode; pending?: boolean }) {
  return (
    <div className="flex gap-3 py-2.5">
      <span className="mt-1 text-gold-deep">{icon}</span>
      <div className="min-w-0">
        <dt className="font-label text-[0.82rem] tracking-wide text-gold-deep">{term}</dt>
        <dd className={pending ? "text-maroon/70 italic" : ""}>{children}</dd>
      </div>
    </div>
  );
}

function EventCard({ event, flip }: { event: InviteEvent; flip: boolean }) {
  const art = eventArtFor(event.type, event.name);
  const { ground } = eventGround(art);
  const date = event.date ? formatDate(event.date) : null;
  const start = hhmm(event.start_time);
  const directions = directionsUrl(event);
  const description = event.description.trim() || invitationConfig.eventDescriptions[art];
  return (
    <li className="grid items-center gap-7 md:grid-cols-2 md:gap-14">
      <div className={`mx-auto w-full max-w-[21rem] ${flip ? "md:order-2" : ""}`}>
        <div className="rounded-t-[999px] border-2 border-gold bg-ivory p-1.5 shadow-[0_10px_30px_-18px_rgba(94,11,18,0.45)]">
          <div className="overflow-hidden rounded-t-[999px] border border-gold/70 px-2 pt-12 pb-3" style={{ background: ground }}>
            <EventArt id={art} className="w-full" />
          </div>
        </div>
        <div className="mx-[-8px] h-2.5 border border-gold bg-gradient-to-b from-gold-bright to-gold" />
      </div>

      <article aria-labelledby={`event-${event.id}`} className="relative mx-auto w-full max-w-md md:mx-0">
        <Seal className="absolute top-0 right-0 size-11" size={88} />
        <h3 id={`event-${event.id}`} className="pr-14 font-display text-[2.3rem] leading-tight font-medium">
          {event.name}
        </h3>
        {description ? <p className="mt-1 text-maroon/85 italic">{description}</p> : null}
        <dl className="mt-4 divide-y divide-gold/35 border-y border-gold/35">
          <Row icon={<CalendarDays className="size-4" aria-hidden="true" />} term="Date" pending={!date}>
            {date ? `${date.weekday}, ${date.long}` : "To be announced"}
          </Row>
          <Row icon={<Clock className="size-4" aria-hidden="true" />} term="Time" pending={!start}>
            {start ? formatTimeRange(start, hhmm(event.end_time)) : "To be confirmed"}
          </Row>
          <Row icon={<MapPin className="size-4" aria-hidden="true" />} term="Venue" pending={!event.venue}>
            {event.venue ? <span className="block font-semibold">{event.venue}</span> : "To be confirmed"}
          </Row>
          {event.dress_code ? (
            <Row icon={<Shirt className="size-4" aria-hidden="true" />} term="Dress code">
              {event.dress_code}
            </Row>
          ) : null}
        </dl>
        {directions ? (
          <a href={directions} target="_blank" rel="noopener noreferrer" className="inv-btn inv-btn-maroon mt-5">
            <Navigation className="size-4" aria-hidden="true" />
            Get directions<span className="sr-only"> to the {event.name} venue (opens Google Maps)</span>
          </a>
        ) : (
          <p className="mt-4 text-[1.02rem] text-maroon/70">Directions will appear here once the venue is confirmed.</p>
        )}
      </article>
    </li>
  );
}

export function Events({ events }: { events: InviteEvent[] }) {
  return (
    <section id="events" aria-labelledby="events-title" className="bg-parchment px-5 py-20 sm:py-28">
      <SectionHeading
        id="events-title"
        title="The Celebrations"
        lead={events.length > 1 ? "We hope you can join us for as many as you can." : "We hope you can join us."}
      />
      {events.length ? (
        <ol className="mx-auto max-w-4xl space-y-16 md:space-y-20">
          {events.map((event, i) => <EventCard key={event.id} event={event} flip={i % 2 === 1} />)}
        </ol>
      ) : (
        <p className="mx-auto max-w-md text-center text-maroon/80">The details will appear here soon.</p>
      )}
    </section>
  );
}
