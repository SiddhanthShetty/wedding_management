import qrcode from "qrcode-generator";

/**
 * QR code as one SVG path (in module units) for a guest's private link. Generated on the device;
 * the link is never sent anywhere to make the code.
 */
export function qrPath(text: string): { size: number; d: string } {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  const parts: string[] = [];
  for (let row = 0; row < size; row += 1) for (let col = 0; col < size; col += 1) if (qr.isDark(row, col)) parts.push(`M${col} ${row}h1v1h-1z`);
  return { size, d: parts.join("") };
}
