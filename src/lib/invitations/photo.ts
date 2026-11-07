/**
 * Couple-photo checks shared by the device (before upload) and the server (before saving).
 * Photos are resized on the device to at most 900 px and stored as a small JPEG or WebP data URL.
 */
export const MAX_PHOTO_BYTES = 330_000;
const PREFIX = /^data:image\/(jpeg|webp);base64,([A-Za-z0-9+/]+=*)$/;

/** Returns a reason the photo is not acceptable, or null. Verifies the real file signature, not just the label. */
export function checkPhotoDataUrl(value: string): string | null {
  const match = PREFIX.exec(value);
  if (!match) return "Use a JPEG or WebP photo.";
  const base64 = match[2]!;
  const bytes = Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
  if (bytes > MAX_PHOTO_BYTES) return "The photo is too large even after resizing. Try a different photo.";
  const head = typeof atob === "function" ? atob(base64.slice(0, 24)) : Buffer.from(base64.slice(0, 24), "base64").toString("binary");
  const code = (index: number) => head.charCodeAt(index);
  const isJpeg = code(0) === 0xff && code(1) === 0xd8 && code(2) === 0xff;
  const isWebp = head.slice(0, 4) === "RIFF" && head.slice(8, 12) === "WEBP";
  if (match[1] === "jpeg" ? !isJpeg : !isWebp) return "That file is not a valid photo.";
  return null;
}

/** Resizes a chosen photo on the device to a square-ish JPEG data URL (max 900 px) under the size limit. */
export async function resizePhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error("Choose a JPEG, PNG or WebP photo.");
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error("This photo could not be opened. Try a JPEG or PNG."); });
  const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.85, 0.75, 0.65, 0.55]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (!checkPhotoDataUrl(dataUrl)) return dataUrl;
  }
  throw new Error("The photo is too detailed to compress. Try a different photo.");
}
