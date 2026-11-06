/**
 * Server-side file checks. The browser-supplied MIME type and filename are never trusted:
 * the type is detected from the file's leading bytes, and the filename is only kept as
 * sanitised display text. Files are NOT malware-scanned.
 */

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

export type DetectedType = {
  mime: "application/pdf" | "image/png" | "image/jpeg" | "image/webp" | "text/plain" | "text/csv"
    | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  extension: string;
  label: string;
  /** Whether a browser may display it inline. Everything else is always downloaded. */
  inline: boolean;
};

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) => signature.every((value, index) => bytes[offset + index] === value);
const ascii = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));

function looksLikeUtf8Text(bytes: Uint8Array) {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/** Detects one of the permitted types from content. Returns null for anything else. */
export function detectFileType(bytes: Uint8Array, filename: string): DetectedType | null {
  const extension = filename.toLowerCase().split(".").pop() ?? "";
  if (bytes.length === 0) return null;
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { mime: "application/pdf", extension: "pdf", label: "PDF", inline: true };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", extension: "png", label: "PNG image", inline: true };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", extension: "jpg", label: "JPEG image", inline: true };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return { mime: "image/webp", extension: "webp", label: "WebP image", inline: true };
  // Office Open XML files are ZIP archives; require the matching extension and the
  // package's content-type part so arbitrary ZIPs are rejected.
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    const head = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(bytes.length, 8192)));
    if (!head.includes("[Content_Types].xml")) return null;
    if (extension === "docx" && head.includes("word/")) return { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx", label: "Word document", inline: false };
    if (extension === "xlsx" && head.includes("xl/")) return { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx", label: "Excel workbook", inline: false };
    return null;
  }
  // Text is only accepted with a text extension and valid UTF-8 without NUL bytes. Markup is not
  // accepted as text: HTML/SVG/XML could execute script if ever rendered inline.
  if ((extension === "txt" || extension === "csv") && looksLikeUtf8Text(bytes)) {
    const start = new TextDecoder().decode(bytes.slice(0, 512)).trimStart().toLowerCase();
    if (start.startsWith("<")) return null;
    return extension === "csv" ? { mime: "text/csv", extension: "csv", label: "CSV", inline: false } : { mime: "text/plain", extension: "txt", label: "Text", inline: false };
  }
  return null;
}

/** Display-only filename: path parts, control and reserved characters removed; extension matches the detected type. */
export function sanitizeFilename(name: string, detected: DetectedType): string {
  const base = (name.split(/[\\/]/).pop() ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>:"|?*‪-‮⁦-⁩]/g, "")
    .replace(/\.[^.]*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
  return `${base || "document"}.${detected.extension}`;
}

export const PERMITTED_TYPES_LABEL = "PDF, PNG, JPEG, WebP, Word (.docx), Excel (.xlsx), plain text or CSV, up to 8 MB";
