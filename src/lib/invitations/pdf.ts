/**
 * A minimal PDF writer: one full-page JPEG per page (PDF 1.4, DCTDecode). Used for the invitation
 * PDF card made on the planner's device, so no PDF library or server rendering is needed.
 */

export const A5_POINTS = { width: 419.53, height: 595.28 };

export type PdfPage = { jpeg: Uint8Array; width: number; height: number };

const encoder = new TextEncoder();
const ascii = (text: string) => encoder.encode(text);

/** PDF text string: ASCII with escapes; other characters become "?" (titles are metadata only). */
function pdfString(text: string) {
  return `(${text.replace(/[^\x20-\x7e]/g, "?").replace(/([\\()])/g, "\\$1")})`;
}

export function buildImagePdf(pages: PdfPage[], options: { title?: string; pageWidth?: number; pageHeight?: number } = {}): Uint8Array {
  if (!pages.length) throw new Error("A PDF needs at least one page.");
  const pageWidth = options.pageWidth ?? A5_POINTS.width;
  const pageHeight = options.pageHeight ?? A5_POINTS.height;
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: Uint8Array) => { chunks.push(chunk); length += chunk.length; };
  const object = (id: number, parts: Array<string | Uint8Array>) => {
    offsets[id] = length;
    push(ascii(`${id} 0 obj\n`));
    for (const part of parts) push(typeof part === "string" ? ascii(part) : part);
    push(ascii("\nendobj\n"));
  };

  push(ascii("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"));
  // Objects: 1 catalog, 2 page tree, 3 info, then three per page (page, content, image).
  const pageIds = pages.map((_, index) => 4 + index * 3);
  object(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  object(2, [`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`]);
  object(3, [`<< /Title ${pdfString(options.title ?? "Invitation")} /Producer (Wedding Desk) >>`]);
  pages.forEach((page, index) => {
    const pageId = pageIds[index]!; const contentId = pageId + 1; const imageId = pageId + 2;
    const draw = `q ${pageWidth.toFixed(2)} 0 0 ${pageHeight.toFixed(2)} 0 0 cm /Im0 Do Q`;
    object(pageId, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`]);
    object(contentId, [`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`]);
    object(imageId, [`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`, page.jpeg, "\nendstream"]);
  });

  const xref = length;
  const count = 4 + pages.length * 3;
  const rows = ["0000000000 65535 f \n"];
  for (let id = 1; id < count; id += 1) rows.push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  push(ascii(`xref\n0 ${count}\n${rows.join("")}trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`));

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}
