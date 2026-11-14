import type { ReactNode } from "react";
import { Divider } from "./art";

export function SectionHeading({ title, lead, tone = "light", id }: { title: string; lead?: ReactNode; tone?: "light" | "dark"; id?: string }) {
  return (
    <header className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
      <h2 id={id} className="font-display text-[clamp(2rem,6.5vw,3.25rem)] leading-[1.1] font-medium text-balance">
        {title}
      </h2>
      <Divider className="mt-5" color={tone === "dark" ? "#B58A45" : "#9A7434"} />
      {lead ? <p className={`mt-5 text-pretty ${tone === "dark" ? "text-ivory/85" : "text-maroon/85"}`}>{lead}</p> : null}
    </header>
  );
}
