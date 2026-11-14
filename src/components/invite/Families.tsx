import { Fragment } from "react";
import { invitationConfig, type Families as FamiliesConfig } from "@/config/invitation";
import { Corner, Divider } from "./art";

type Person = { name: string; parents: string | null; grandparents: string[] | null; relation: "daughter" | "son" };

/**
 * The formal invitation lines, with each child's parents and grandparents under their name:
 *   Together with our families, we request the honour of your presence at the marriage of
 *   [bride]  D/o [parents]  G/D/o [grandparents]
 *   with
 *   [groom]  S/o [parents]  G/S/o [grandparents]
 * With no parents' names filled in, it names just the couple.
 */
export function familyLines(f: FamiliesConfig, brideName: string, groomName: string) {
  const bride: Person = { name: f.brideFullName ?? brideName, parents: f.brideParents, grandparents: f.brideGrandparents, relation: "daughter" };
  const groom: Person = { name: f.groomFullName ?? groomName, parents: f.groomParents, grandparents: f.groomGrandparents, relation: "son" };
  if (f.brideParents || f.groomParents) {
    return { intro: "Together with our families, we request the honour of your presence at the marriage of", bride, joiner: "with", groom, closing: null };
  }
  return { intro: "Together with their families", bride, joiner: "and", groom, closing: "request the honour of your presence at their marriage" };
}

/** What guests see, and what screen readers say instead. */
export const RELATION = {
  daughter: { parents: ["D/o", "Daughter of"], grandparents: ["G/D/o", "Granddaughter of"] },
  son: { parents: ["S/o", "Son of"], grandparents: ["G/S/o", "Grandson of"] },
} as const;

function Relation({ short, long }: { short: string; long: string }) {
  return (
    <>
      <span aria-hidden="true" className="font-label text-[0.95rem] tracking-wide text-gold-deep">
        {short}
      </span>
      <span className="sr-only">{long}</span>
      {"\u00a0"}
    </>
  );
}

/**
 * One person's name, as written. Titles stay attached to the name ("Lt. Smt. Gulabi Shetty" never
 * splits after "Smt."), and screen readers say "Late" for "Lt." (they would otherwise read "Lieutenant").
 */
function Person({ text }: { text: string }) {
  const glued = text.replace(/\b(Lt\.|Shri|Smt\.)\s+/g, "$1\u00a0");
  const parts = glued.split(/\bLt\.\u00a0/);
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 ? (
            <>
              <span aria-hidden="true">Lt.&nbsp;</span>
              <span className="sr-only">Late </span>
            </>
          ) : null}
          {part}
        </span>
      ))}
    </>
  );
}

/**
 * A couple, "A and B": each person starts a new line when the pair doesn't fit on one.
 * `lead` (e.g. "G/S/o") is kept with the first person so it never sits on a line by itself.
 */
function Names({ text, lead }: { text: string; lead?: React.ReactNode }) {
  const people = text.split(/\s+and\s+/);
  return (
    <>
      {people.map((who, i) => (
        <Fragment key={i}>
          {i > 0 ? " " : null}
          <span className="inline-block">
            {i === 0 ? lead : "and\u00a0"}
            <Person text={who} />
          </span>
        </Fragment>
      ))}
    </>
  );
}

function Couple({ person, previewName }: { person: Person; previewName: string }) {
  const rel = RELATION[person.relation];
  // A missing grandparents line is left out for guests; the local preview shows where it will go.
  const preview = process.env.NODE_ENV !== "production";
  return (
    <>
      <p className="text-[clamp(2.4rem,9vw,3.2rem)] leading-tight font-medium italic">{person.name}</p>
      {person.parents ? (
        <p className="mx-auto mt-1.5 max-w-md text-[1.2rem] leading-snug text-balance">
          <Names text={person.parents} lead={<Relation short={rel.parents[0]} long={rel.parents[1]} />} />
        </p>
      ) : null}
      {person.grandparents ? (
        // Each pair gets its own G/D/o or G/S/o: "G/S/o A and B & G/S/o C and D".
        <p className="mx-auto mt-2 max-w-md text-[1.1rem] leading-snug text-balance text-maroon/90">
          {person.grandparents.map((pair, i) => (
            <span key={pair} className="block">
              {i ? " " : null}
              <Names
                text={pair}
                lead={
                  <>
                    {i ? "&\u00a0" : null}
                    <Relation short={rel.grandparents[0]} long={rel.grandparents[1]} />
                  </>
                }
              />
            </span>
          ))}
        </p>
      ) : preview ? (
        <p className="mx-auto mt-2 max-w-md text-[1rem] text-maroon/60 italic">
          <span aria-hidden="true" className="font-label text-[0.9rem] tracking-wide not-italic">{rel.grandparents[0]}</span>{" "}
          <span className="border-b border-dashed border-maroon/40">{previewName}&rsquo;s grandparents</span> (only you can see this until it&rsquo;s filled in)
        </p>
      ) : null}
    </>
  );
}

export function Families() {
  const l = familyLines(invitationConfig.families, invitationConfig.brideName, invitationConfig.groomName);
  return (
    <section id="families" aria-labelledby="families-title" className="bg-paper px-5 pb-20 sm:pb-28">
      <h2 id="families-title" className="sr-only">
        From our families
      </h2>
      <div className="relative mx-auto max-w-2xl border border-gold bg-ivory px-6 py-12 text-center shadow-[0_14px_40px_-26px_rgba(94,11,18,0.5)] sm:px-14 sm:py-16">
        <div className="pointer-events-none absolute inset-2 border border-gold/50" aria-hidden="true" />
        <Corner className="absolute top-3.5 left-3.5 size-10" color="#B9853A" />
        <Corner className="absolute top-3.5 right-3.5 size-10 rotate-90" color="#B9853A" />
        <Corner className="absolute right-3.5 bottom-3.5 size-10 rotate-180" color="#B9853A" />
        <Corner className="absolute bottom-3.5 left-3.5 size-10 -rotate-90" color="#B9853A" />

        <div className="relative font-display text-maroon">
          <p className="mx-auto max-w-md text-[1.2rem] leading-relaxed text-pretty italic">{l.intro}</p>
          <div className="mt-6">
            <Couple person={l.bride} previewName={invitationConfig.brideName} />
          </div>
          <p className="my-5 font-label text-[1rem] tracking-[0.2em] text-gold-deep">{l.joiner}</p>
          <Couple person={l.groom} previewName={invitationConfig.groomName} />
          {l.closing ? <p className="mx-auto mt-5 max-w-md text-[1.15rem] leading-relaxed text-pretty italic">{l.closing}</p> : null}
          <Divider className="mt-8" color="#B9853A" />
        </div>
      </div>
    </section>
  );
}
