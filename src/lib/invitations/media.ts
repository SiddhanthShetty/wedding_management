/**
 * Invitation music and gallery photos. Files are checked by their first bytes (not by name or the
 * browser's claimed type) on the server before saving. Photos are resized on the planner's device.
 */

export const MAX_MUSIC_BYTES = 1_572_864; // 1.5 MB: about 90 seconds at 128 kbps
export const MAX_GALLERY_BYTES = 450_000;
export const MAX_GALLERY_PHOTOS = 8;
export type MediaKind = "music" | "gallery";
export type MediaMime = "image/jpeg" | "image/webp" | "audio/mpeg" | "audio/mp4" | "audio/ogg";

/** Guest-page media listing; `base` + id is the address of each file for this viewer. */
export type PortalMedia = { base: string; music: string | null; gallery: Array<{ id: string; caption: string }> };

const startsWith = (bytes: Uint8Array, values: number[], offset = 0) => values.every((value, index) => bytes[offset + index] === value);
const ascii = (bytes: Uint8Array, text: string, offset = 0) => startsWith(bytes, [...text].map((char) => char.charCodeAt(0)), offset);

/** The real type of a file from its first bytes, or null when it is not an allowed type. */
export function sniffMedia(bytes: Uint8Array): MediaMime | null {
  if (bytes.length < 12) return null;
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (ascii(bytes, "RIFF") && ascii(bytes, "WEBP", 8)) return "image/webp";
  if (ascii(bytes, "ID3") || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0 && (bytes[1]! & 0x06) !== 0)) return "audio/mpeg";
  if (ascii(bytes, "ftyp", 4) && /^(M4A |M4B |mp42|isom|iso2|mp41|dash)$/.test(String.fromCharCode(...bytes.slice(8, 12)))) return "audio/mp4";
  if (ascii(bytes, "OggS")) return "audio/ogg";
  return null;
}

/** Checks a file for its kind; returns its type or a message the planner can act on. */
export function checkMedia(kind: MediaKind, bytes: Uint8Array): { mime: MediaMime } | { error: string } {
  const mime = sniffMedia(bytes);
  if (kind === "music") {
    if (!mime?.startsWith("audio/")) return { error: "Choose an MP3, M4A or OGG music file." };
    if (bytes.length > MAX_MUSIC_BYTES) return { error: "Music files can be up to 1.5 MB. Trim it to about 90 seconds or export at a lower quality." };
    return { mime };
  }
  if (!mime?.startsWith("image/")) return { error: "Choose a JPEG or WebP photo." };
  if (bytes.length > MAX_GALLERY_BYTES) return { error: "This photo is too large. Choose it again so it is resized first." };
  return { mime };
}

/** Resizes a photo on this device to a JPEG of at most `maxSide` pixels and `maxBytes`. */
export async function resizeToJpeg(file: File, maxSide = 1400, maxBytes = MAX_GALLERY_BYTES): Promise<Blob> {
  if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error("Choose a photo (JPEG, PNG or WebP).");
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error(`“${file.name}” could not be opened. Try a JPEG or PNG.`); });
  for (const side of [maxSide, Math.round(maxSide * 0.8), Math.round(maxSide * 0.6)]) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.75, 0.65]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= maxBytes) return blob;
    }
  }
  throw new Error(`“${file.name}” is too detailed to compress. Try a different photo.`);
}
