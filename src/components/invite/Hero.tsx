import { CalendarDays, MapPin } from "lucide-react";
import { coupleNames, invitationConfig } from "@/config/invitation";
import { formatDate } from "@/lib/invite/datetime";
import { Divider, SeaAtDusk } from "./art";
import { Emblem } from "./Monogram";

export function Hero({ family, weddingDate }: { family: string | null; weddingDate: string | null }) {
  const { location } = invitationConfig;
  const date = weddingDate ? formatDate(weddingDate) : null;
  return (
    <section id="top" className="relative isolate flex min-h-svh flex-col overflow-hidden bg-paper text-maroon">
      {/* The emblem's own coastal sketch, carried out to the edges of the screen. */}
      <SeaAtDusk className="absolute inset-x-0 bottom-0 -z-10 h-28 w-full opacity-70 sm:h-40" />

      <div className="flex flex-1 flex-col items-center justify-center px-4 pt-20 pb-24 text-center sm:pt-24 sm:pb-36">
        <h1 className="hero-rise w-full max-w-[min(92vw,30rem)] lg:max-w-[32rem]">
          <Emblem priority alt={`${coupleNames}, wedding invitation`} sizes="(min-width: 1024px) 32rem, (min-width: 640px) 30rem, 92vw" className="w-full" />
        </h1>

        {family ? <p className="mt-1 animate-[rise_0.8s_ease-out_both] font-display text-[1.45rem] text-maroon italic">Dear {family},</p> : null}
        <p className="hero-rise mt-2 font-label text-[0.98rem] tracking-[0.18em] text-gold-deep" style={{ ["--i" as string]: 1 }}>
          Wedding Invitation
        </p>
        <p className="hero-rise mx-auto mt-4 max-w-[26rem] text-[1.15rem] leading-relaxed text-pretty" style={{ ["--i" as string]: 2 }}>
          With the blessings of our families, we invite you to join us as we celebrate the beginning of our forever.
        </p>
        <Divider className="hero-rise mt-5" color="#B9853A" />
        <dl className="hero-rise mt-4 flex flex-col items-center gap-x-6 gap-y-1.5 font-label text-[0.98rem] text-maroon sm:flex-row" style={{ ["--i" as string]: 3 }}>
          <div className="flex items-center gap-2">
            <dt className="sr-only">Date</dt>
            <CalendarDays className="size-4 shrink-0 text-gold" aria-hidden="true" />
            <dd>{date ? `${date.weekday}, ${date.long}` : "Date to be announced"}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="sr-only">Place</dt>
            <MapPin className="size-4 shrink-0 text-gold" aria-hidden="true" />
            <dd>{location}</dd>
          </div>
        </dl>
        <a href="#events" className="hero-rise inv-btn inv-btn-maroon mt-7" style={{ ["--i" as string]: 4 }}>
          Explore the celebrations
        </a>
      </div>
    </section>
  );
}
