import Image from "next/image";

/**
 * The couple's emblem (public/invite/emblem.png) and the round SS seal cut from it
 * (public/invite/seal.png). The emblem's background is #F5E5D1, the page colour,
 * so it should sit on `bg-paper` to blend in without visible edges.
 */
export const EMBLEM = { src: "/invite/emblem.png", width: 1031, height: 1254 } as const;

export function Emblem({
  className = "",
  alt = "Sweekruti & Siddhanth wedding emblem",
  priority = false,
  sizes = "(min-width: 640px) 28rem, 90vw",
}: {
  className?: string;
  alt?: string;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <Image
      src={EMBLEM.src}
      width={EMBLEM.width}
      height={EMBLEM.height}
      alt={alt}
      sizes={sizes}
      {...(priority ? { loading: "eager" as const, fetchPriority: "high" as const } : {})}
      className={`h-auto ${className}`}
    />
  );
}

/** Small round SS seal, for the navigation bar, event cards and other tight spots. */
export function Seal({ className = "", alt = "", size = 96 }: { className?: string; alt?: string; size?: number }) {
  return <Image src="/invite/seal.webp" width={size} height={size} alt={alt} aria-hidden={alt ? undefined : true} loading="eager" className={`aspect-square ${className}`} />;
}
