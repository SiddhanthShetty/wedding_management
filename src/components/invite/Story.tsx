import { BananaLeaf, HouseAndPalms } from "./art";
import { SectionHeading } from "./Section";

export function Story() {
  return (
    <section id="story" aria-labelledby="story-title" className="relative overflow-hidden bg-paper px-5 py-20 sm:py-28">
      <BananaLeaf className="pointer-events-none absolute -top-20 -left-10 w-24 -rotate-[32deg] opacity-90 sm:top-6 sm:-left-6 sm:w-40 sm:-rotate-[24deg] lg:left-10 lg:w-48" />
      <BananaLeaf className="pointer-events-none absolute -right-10 -bottom-24 w-24 rotate-[148deg] opacity-90 sm:-right-6 sm:bottom-10 sm:w-40 sm:rotate-[156deg] lg:right-10 lg:w-48" />
      <div className="relative mx-auto max-w-2xl">
        <SectionHeading
          id="story-title"
          title="Two Hearts, One Beautiful Journey"
          lead="From the warmth of our Mangalorean roots to the joy of the days ahead, we would be honoured to have you with us. Join our families as we celebrate tradition, togetherness, and the beginning of our forever."
        />
        <HouseAndPalms className="mx-auto w-full max-w-md" />
      </div>
    </section>
  );
}
