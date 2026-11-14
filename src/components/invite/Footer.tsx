import { coupleNames, invitationConfig } from "@/config/invitation";
import { formatDate } from "@/lib/invite/datetime";
import { Divider } from "./art";
import { Emblem } from "./Monogram";

export function Footer({ weddingDate }: { weddingDate: string | null }) {
  const { location, contact } = invitationConfig;
  const date = weddingDate ? formatDate(weddingDate) : null;
  const hasContact = contact.name || contact.phone || contact.email;
  return (
    <footer className="bg-paper text-center text-maroon">
      <div className="silk h-6" aria-hidden="true" />
      <div className="px-5 pt-12 pb-10">
        <Emblem alt={coupleNames} sizes="16rem" className="mx-auto w-52 sm:w-60" />
        <p className="mx-auto mt-4 max-w-md text-[1.2rem] italic">
          With love, tradition and a little coastal magic. We can&rsquo;t wait to celebrate with you.
        </p>
        <Divider className="mt-6" color="#B9853A" />
        <dl className="mx-auto mt-8 grid max-w-2xl gap-6 font-label text-[0.98rem] sm:grid-cols-3">
          <div>
            <dt className="text-gold-deep">Date</dt>
            <dd className="mt-1 font-display text-[1.15rem]">{date ? `${date.weekday}, ${date.long}` : "To be announced"}</dd>
          </div>
          <div>
            <dt className="text-gold-deep">Place</dt>
            <dd className="mt-1 font-display text-[1.15rem]">{location}</dd>
          </div>
          <div>
            <dt className="text-gold-deep">Contact</dt>
            <dd className="mt-1 font-display text-[1.15rem]">
              {hasContact ? (
                <>
                  {contact.name ? <span className="block">{contact.name}</span> : null}
                  {contact.phone ? (
                    <a className="block underline decoration-gold underline-offset-4" href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`}>
                      {contact.phone}
                    </a>
                  ) : null}
                  {contact.email ? (
                    <a className="block break-all underline decoration-gold underline-offset-4" href={`mailto:${contact.email}`}>
                      {contact.email}
                    </a>
                  ) : null}
                </>
              ) : (
                "Details to follow"
              )}
            </dd>
          </div>
        </dl>
        <p className="mt-10 text-[0.95rem] text-maroon/70">
          &copy; {new Date().getFullYear()} {coupleNames}. Made with love for our families and friends.
        </p>
        {invitationConfig.music.credit ? (
          <p className="mt-1 text-[0.95rem] text-maroon/70">
            Music: &ldquo;{invitationConfig.music.title}&rdquo; by {invitationConfig.music.credit}
          </p>
        ) : null}
      </div>
    </footer>
  );
}
