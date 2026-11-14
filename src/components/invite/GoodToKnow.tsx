import { BedDouble, CarFront, CloudSun, Hash, Shirt } from "lucide-react";
import type { ReactNode } from "react";
import type { InvitationConfig } from "@/config/invitation";
import { SectionHeading } from "./Section";

type Notes = InvitationConfig["goodToKnow"];

const ITEMS: { key: keyof Notes; title: string; icon: ReactNode }[] = [
  { key: "weather", title: "Weather", icon: <CloudSun className="size-5" aria-hidden="true" /> },
  { key: "dressCode", title: "What to wear", icon: <Shirt className="size-5" aria-hidden="true" /> },
  { key: "hashtag", title: "Share your photos", icon: <Hash className="size-5" aria-hidden="true" /> },
  { key: "parking", title: "Parking", icon: <CarFront className="size-5" aria-hidden="true" /> },
  { key: "driversAndStaff", title: "Drivers and staff", icon: <BedDouble className="size-5" aria-hidden="true" /> },
];

export function hasGoodToKnow(notes: Notes): boolean {
  return ITEMS.some((i) => notes[i.key]);
}

export function GoodToKnow({ notes }: { notes: Notes }) {
  const items = ITEMS.filter((i) => notes[i.key]);
  if (!items.length) {
    // Nothing filled in yet: guests see nothing; the local preview shows what to add.
    if (process.env.NODE_ENV === "production") return null;
    return (
      <section id="good-to-know" aria-labelledby="gtk-title" className="bg-paper px-5 py-16">
        <div className="mx-auto max-w-xl border border-dashed border-gold-deep/60 bg-ivory p-6 text-center">
          <h2 id="gtk-title" className="font-display text-[1.6rem] font-medium">
            Good to Know
          </h2>
          <p className="mt-2 text-maroon/80">
            Only you can see this note. Fill in <code>goodToKnow</code> in <code>src/config/invitation.ts</code> (weather, what to wear, a hashtag, parking, drivers and staff) and each one you add appears here for guests.
          </p>
        </div>
      </section>
    );
  }
  return (
    <section id="good-to-know" aria-labelledby="gtk-title" className="bg-paper px-5 py-20 sm:py-28">
      <SectionHeading id="gtk-title" title="Good to Know" lead="A few small things, so you can simply arrive and enjoy." />
      <dl className="mx-auto grid max-w-4xl gap-x-12 gap-y-2 sm:grid-cols-2">
        {items.map((i) => {
          const value = notes[i.key]!;
          const shown = i.key === "hashtag" && !value.startsWith("#") ? `#${value}` : value;
          return (
            <div key={i.key} className="flex gap-4 border-t border-gold/50 py-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-full border border-gold bg-ivory text-gold-deep">{i.icon}</span>
              <div className="min-w-0">
                <dt className="font-label text-[1.05rem]">{i.title}</dt>
                <dd className={`mt-1 text-maroon/90 ${i.key === "hashtag" ? "font-label text-[1.05rem] break-all text-gold-deep" : ""}`}>
                  {i.key === "hashtag" ? `Tag your photos with ${shown}` : shown}
                </dd>
              </div>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
