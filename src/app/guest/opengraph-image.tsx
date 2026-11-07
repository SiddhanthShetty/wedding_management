import { ImageResponse } from "next/og";

/**
 * Link preview for shared invitation links (WhatsApp, iMessage, email). Deliberately generic:
 * preview crawlers never receive the private part of the link, so no names or details are shown.
 */
export const alt = "A private wedding invitation";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  const bud = (x: number, y: number) => <div key={`${x}-${y}`} style={{ position: "absolute", left: x, top: y, width: 18, height: 26, borderRadius: 12, background: "#fffef8", boxShadow: "0 0 0 2px #e9dfc5" }} />;
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fbf7ee", position: "relative" }}>
      <div style={{ position: "absolute", inset: 28, border: "4px solid #b38a2e", display: "flex" }} />
      <div style={{ position: "absolute", inset: 44, border: "1.5px solid #b38a2e", display: "flex" }} />
      {Array.from({ length: 22 }, (_, i) => bud(70 + i * 48, 70 + Math.round(Math.sin((i / 21) * Math.PI) * 60)))}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, color: "#2f3a2c" }}>
        <div style={{ width: 84, height: 84, borderRadius: 42, background: "#b3261e", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 44 }}>♥</div>
        <div style={{ fontSize: 76, fontFamily: "serif" }}>You are invited</div>
        <div style={{ fontSize: 30, color: "#6b5a2e" }}>Open your private link to see your invitation and reply</div>
      </div>
    </div>,
    size,
  );
}
