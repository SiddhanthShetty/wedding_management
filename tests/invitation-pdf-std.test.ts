import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { A5_POINTS, buildImagePdf } from "../src/lib/invitations/pdf";
import { contrastRatio, darkenToContrast, pageAccentText, THEMES, defaultTexts, resolveTexts, SAVE_THE_DATE_TEXTS, LANGUAGES, unknownInvitationPlaceholders } from "../src/lib/invitations/content";
import { EMPTY_SITE, parseSite, readSite } from "../src/lib/invitations/site";
import { buildCardProps, saveTheDateOf } from "../src/lib/invitations/card-data";
import { InvitationCard } from "../src/components/invitation-card";
import { PdfPages, pdfContent } from "../src/components/invitation-pdf";
import { PORTAL_STRINGS } from "../src/lib/guest-portal/i18n";

const jpeg = (n: number) => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: n }, (_, i) => i % 256), 0xff, 0xd9]);
const text = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

describe("PDF writer", () => {
  it("writes one A5 page per JPEG with a valid cross-reference table", () => {
    const pdf = buildImagePdf([{ jpeg: jpeg(500), width: 1748, height: 2480 }, { jpeg: jpeg(700), width: 1748, height: 2480 }], { title: "Meera & Ravi" });
    const body = text(pdf);
    expect(body.startsWith("%PDF-1.4")).toBe(true);
    expect(body.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(body).toContain("/Count 2");
    expect(body.match(/\/Type \/Page /g)).toHaveLength(2);
    expect(body).toContain(`/MediaBox [0 0 ${A5_POINTS.width.toFixed(2)} ${A5_POINTS.height.toFixed(2)}]`);
    expect(body).toContain("/Filter /DCTDecode /Length 506");
    // Every xref offset points at the start of its object.
    const xrefAt = Number(/startxref\n(\d+)/.exec(body)![1]);
    expect(body.slice(xrefAt, xrefAt + 4)).toBe("xref");
    const rows = body.slice(xrefAt).split("\n").slice(3).filter((row) => / 00000 n $/.test(row));
    expect(rows).toHaveLength(9);
    rows.forEach((row, index) => expect(body.slice(Number(row.slice(0, 10))).startsWith(`${index + 1} 0 obj\n`)).toBe(true));
    expect(body).toContain("/Title (Meera ? Ravi)".replace("?", "&"));
  });
  it("refuses an empty PDF and keeps titles to plain text", () => {
    expect(() => buildImagePdf([])).toThrow();
    expect(text(buildImagePdf([{ jpeg: jpeg(10), width: 10, height: 10 }], { title: "ಮೀರಾ (and) Ravi\\" }))).toContain("/Title (???? \\(and\\) Ravi\\\\)");
  });
});

describe("Save the Date", () => {
  it("has its own built-in wording in every language, with only known placeholders", () => {
    for (const { code } of LANGUAGES) {
      const texts = defaultTexts(code, "save_the_date");
      expect(texts.heading).toBe(SAVE_THE_DATE_TEXTS[code].heading);
      expect(texts.share).toContain("{{link}}");
      expect(unknownInvitationPlaceholders(texts.share)).toEqual([]);
      expect(defaultTexts(code).heading).not.toBe(texts.heading);
    }
    expect(resolveTexts("en", { en: { heading: "Hold the date" } }, true, "save_the_date").heading).toBe("Hold the date");
    expect(resolveTexts("en", {}, true, "save_the_date").closing).toBe("Formal invitation to follow");
  });

  it("needs a real date and keeps older designs as full invitations", () => {
    expect(readSite({}).kind).toBe("invitation");
    expect(EMPTY_SITE.save_the_date).toEqual({ date: "", city: "" });
    expect(() => parseSite({ kind: "save_the_date" })).toThrow(/date/);
    expect(() => parseSite({ kind: "save_the_date", save_the_date: { date: "10/01/2027", city: "" } })).toThrow(/date/);
    const site = parseSite({ kind: "save_the_date", save_the_date: { date: "2027-01-10", city: "Udupi" } });
    expect(saveTheDateOf(site)).toEqual({ date: "2027-01-10", city: "Udupi" });
    expect(saveTheDateOf(parseSite({ save_the_date: { date: "2027-01-10", city: "" } }))).toBeNull();
  });

  it("draws the date and place instead of a function list", () => {
    const card = buildCardProps({ theme: "kolam", accent: null, overrides: {}, language: "en", couple: "Meera & Ravi", greetingName: "Asha", functions: [{ name: "Muhurtham", function_date: "2027-01-10", start_time: "10:30", venue_name: "Hall" }], saveTheDate: { date: "2027-01-10", city: "Udupi" } });
    expect(card.saveTheDate).toEqual({ date: "Sunday, 10 January 2027", city: "Udupi" });
    const svg = renderToStaticMarkup(createElement(InvitationCard, card));
    expect(svg).toContain("SAVE THE DATE");
    expect(svg).toContain("Sunday, 10 January 2027");
    expect(svg).toContain("UDUPI");
    expect(svg).not.toContain("Muhurtham");
    expect(svg).toContain("save the date");
    expect(PORTAL_STRINGS.kn.stdFollow && PORTAL_STRINGS.tcy.theWedding).toBeTruthy();
  });
});

describe("PDF card pages", () => {
  const functions = [
    { id: "f2", name: "Reception", function_date: "2027-01-10", start_time: "19:00", venue_name: "Hall" },
    { id: "f1", name: "Muhurtham", function_date: "2027-01-10", start_time: "10:30", venue_name: "Mantapa" },
  ];
  const site = parseSite({ blessing_header: "|| Shree Ganeshaya Namah ||", parents: { one: "D/o Smt. Lakshmi", two: "" }, palettes: {}, closing: { title: "", names: ["Shetty family"] }, hashtag: "#MeeraRavi" });
  const card = buildCardProps({ theme: "mallige", accent: null, overrides: {}, language: "en", couple: "Meera & Ravi", greetingName: "Asha", functions });

  it("has a cover, the invitation, one page per function in order, and the QR page", () => {
    const html = renderToStaticMarkup(createElement(PdfPages, { content: pdfContent({ card, language: "en", site, partners: ["Meera", "Ravi"], functions, qr: { size: 21, d: "M0 0h1v1H0z" } }) }));
    const pages = html.match(/<svg[^>]*viewBox="0 0 1748 2480"/g) ?? [];
    expect(pages).toHaveLength(5);
    expect(html.indexOf("Muhurtham")).toBeLessThan(html.indexOf("Reception"));
    expect(html).toContain("D/o Smt. Lakshmi");
    expect(html).toContain("|| Shree Ganeshaya Namah ||");
    expect(html).toContain("Shetty family");
    expect(html).toContain("#MeeraRavi");
    expect(html).toContain('d="M0 0h1v1H0z"');
    expect(html).toContain("Sunday, 10 January 2027");
  });

  it("makes a Save the Date PDF of three pages", () => {
    const stdSite = parseSite({ kind: "save_the_date", save_the_date: { date: "2027-01-10", city: "Udupi" } });
    const stdCard = buildCardProps({ theme: "veena", accent: null, overrides: {}, language: "kn", couple: "Meera & Ravi", greetingName: "Asha", functions, saveTheDate: saveTheDateOf(stdSite) });
    const html = renderToStaticMarkup(createElement(PdfPages, { content: pdfContent({ card: stdCard, language: "kn", site: stdSite, partners: [], functions, qr: null }) }));
    expect(html.match(/<svg[^>]*viewBox="0 0 1748 2480"/g)).toHaveLength(3);
    expect(html).not.toContain("Reception");
    expect(html).toContain(PORTAL_STRINGS.kn.stdTitle);
  });
});

describe("accent text on the guest page", () => {
  it("is readable on white for every theme, including dark ones", () => {
    for (const theme of THEMES) expect(contrastRatio(pageAccentText(theme.id, null), "#ffffff"), theme.id).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(pageAccentText("veena", "#ffe08a"), "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(darkenToContrast("#123456")).toBe("#123456");
  });
});
