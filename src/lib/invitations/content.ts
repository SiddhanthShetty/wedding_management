/**
 * Invitation wording, languages, themes and share links. Pure functions: used by the design
 * studio, the guest portal and tests. No message is ever sent by the app; links open the
 * planner's own WhatsApp, share sheet or mail app.
 */

export type LanguageCode = "en" | "hi" | "kn" | "tcy";
export const LANGUAGES: Array<{ code: LanguageCode; label: string; locale: string; draft: boolean }> = [
  { code: "en", label: "English", locale: "en-IN", draft: false },
  { code: "hi", label: "हिन्दी · Hindi", locale: "hi-IN", draft: true },
  { code: "kn", label: "ಕನ್ನಡ · Kannada", locale: "kn-IN", draft: true },
  // Tulu is written here in Kannada script; dates use Kannada formatting (no Tulu locale in browsers).
  { code: "tcy", label: "ತುಳು · Tulu", locale: "kn-IN", draft: true },
];
export const isLanguage = (value: string): value is LanguageCode => LANGUAGES.some((language) => language.code === value);

export const TEXT_KEYS = ["greeting", "heading", "body", "functionsHeading", "rsvp", "closing", "button", "share"] as const;
export type TextKey = typeof TEXT_KEYS[number];
export type InvitationTexts = Record<TextKey, string>;
export const TEXT_LABELS: Record<TextKey, string> = {
  greeting: "Greeting", heading: "Opening line", body: "Invitation", functionsHeading: "Function list title", rsvp: "Reply request",
  closing: "Closing", button: "Portal button", share: "WhatsApp / email message",
};

/**
 * Built-in wording. Hindi, Kannada and Tulu are drafts for the couple to check with a native speaker;
 * the studio says so and every line can be edited.
 */
export const DEFAULT_TEXTS: Record<LanguageCode, InvitationTexts> = {
  en: {
    greeting: "Dear {{name}},",
    heading: "With the blessings of our families",
    body: "{{couple}} joyfully invite you to celebrate their wedding.",
    functionsHeading: "You are invited to",
    rsvp: "Please let us know if you can join us.",
    closing: "With love and warm regards",
    button: "View invitation & reply",
    share: "Namaskara {{name}}! {{couple}} warmly invite you to their wedding celebrations. Please see your invitation and reply here: {{link}}",
  },
  hi: {
    greeting: "प्रिय {{name}},",
    heading: "परिवारजनों के आशीर्वाद के साथ",
    body: "{{couple}} आपको अपने विवाह समारोह में सादर आमंत्रित करते हैं।",
    functionsHeading: "आप इन समारोहों में आमंत्रित हैं",
    rsvp: "कृपया बताएं कि क्या आप हमारे साथ शामिल हो सकेंगे।",
    closing: "स्नेह और शुभकामनाओं सहित",
    button: "निमंत्रण देखें और उत्तर दें",
    share: "नमस्ते {{name}}! {{couple}} आपको अपने विवाह समारोह में सादर आमंत्रित करते हैं। अपना निमंत्रण देखें और उत्तर दें: {{link}}",
  },
  kn: {
    greeting: "ಆತ್ಮೀಯ {{name}},",
    heading: "ಹಿರಿಯರ ಆಶೀರ್ವಾದಗಳೊಂದಿಗೆ",
    body: "{{couple}} ಅವರ ವಿವಾಹ ಮಹೋತ್ಸವಕ್ಕೆ ನಿಮ್ಮನ್ನು ಆತ್ಮೀಯವಾಗಿ ಆಹ್ವಾನಿಸುತ್ತೇವೆ.",
    functionsHeading: "ನಿಮ್ಮನ್ನು ಆಹ್ವಾನಿಸಿರುವ ಸಮಾರಂಭಗಳು",
    rsvp: "ನೀವು ಬರುವಿರಾ ಎಂದು ದಯವಿಟ್ಟು ತಿಳಿಸಿ.",
    closing: "ಪ್ರೀತಿ ಮತ್ತು ಶುಭಾಶಯಗಳೊಂದಿಗೆ",
    button: "ಆಹ್ವಾನ ನೋಡಿ, ಉತ್ತರಿಸಿ",
    share: "ನಮಸ್ಕಾರ {{name}}! {{couple}} ಅವರ ವಿವಾಹ ಸಮಾರಂಭಕ್ಕೆ ನಿಮಗೆ ಆತ್ಮೀಯ ಆಹ್ವಾನ. ನಿಮ್ಮ ಆಹ್ವಾನ ನೋಡಿ ಉತ್ತರಿಸಲು: {{link}}",
  },
  tcy: {
    greeting: "ಮೋಕೆದ {{name}},",
    heading: "ಇರೆಕುಲೆನ ಆಶೀರ್ವಾದೊಡು",
    body: "{{couple}}ನ ಮದಿಮೆಗ್ ಈರೆನ್ ಮೋಕೆಡ್ ಲೆಪ್ಪುವ.",
    functionsHeading: "ಈರೆನ್ ಲೆಪ್ಪಿನ ಕಾರ್ಯಕ್ರಮೊಲು",
    rsvp: "ಈರ್ ಬರ್ಪರಾ ಪನ್ಪಿನೆನ್ ತೆರಿಪಾಲೆ.",
    closing: "ಮೋಕೆ ಬೊಕ್ಕ ಆಶೀರ್ವಾದೊಡು",
    button: "ಲೆಪ್ಪು ತೂಲೆ, ಉತ್ತರ ಕೊರ್ಲೆ",
    share: "ನಮಸ್ಕಾರ {{name}}! {{couple}}ನ ಮದಿಮೆಗ್ ಈರೆನ್ ಮೋಕೆಡ್ ಲೆಪ್ಪುವ. ಈರೆನ ಲೆಪ್ಪು ತೂದು ಉತ್ತರ ಕೊರ್ಲೆ: {{link}}",
  },
};

/** Save the Date wording: replaces the invitation lines that do not apply (drafts outside English). */
export const SAVE_THE_DATE_TEXTS: Record<LanguageCode, Partial<InvitationTexts>> = {
  en: { heading: "Save the date", body: "are getting married", closing: "Formal invitation to follow", button: "See the date",
    share: "Namaskara {{name}}! Please save the date: {{couple}} are getting married. See the date here: {{link}}" },
  hi: { heading: "तारीख़ याद रखें", body: "विवाह के बंधन में बंध रहे हैं", closing: "औपचारिक निमंत्रण शीघ्र", button: "तारीख़ देखें",
    share: "नमस्ते {{name}}! कृपया तारीख़ याद रखें: {{couple}} विवाह कर रहे हैं। तारीख़ यहाँ देखें: {{link}}" },
  kn: { heading: "ದಿನಾಂಕ ನೆನಪಿರಲಿ", body: "ವಿವಾಹ ಬಂಧನಕ್ಕೆ ಒಳಗಾಗುತ್ತಿದ್ದಾರೆ", closing: "ಔಪಚಾರಿಕ ಆಹ್ವಾನ ಶೀಘ್ರದಲ್ಲೇ", button: "ದಿನಾಂಕ ನೋಡಿ",
    share: "ನಮಸ್ಕಾರ {{name}}! ದಯವಿಟ್ಟು ದಿನಾಂಕ ನೆನಪಿಡಿ: {{couple}} ಅವರ ವಿವಾಹ. ದಿನಾಂಕ ಇಲ್ಲಿ ನೋಡಿ: {{link}}" },
  tcy: { heading: "ದಿನ ನೆನಪು ಮಲ್ಪುಲೆ", body: "ಮದಿಮೆ ಆಪುಂಡು", closing: "ಲೆಪ್ಪು ಬೊಕ್ಕ ಬರ್ಪುಂಡು", button: "ದಿನ ತೂಲೆ",
    share: "ನಮಸ್ಕಾರ {{name}}! ದಿನ ನೆನಪು ಮಲ್ಪುಲೆ: {{couple}}ನ ಮದಿಮೆ. ದಿನ ಮುಲ್ಪ ತೂಲೆ: {{link}}" },
};

/** The built-in wording for a language and kind of design. */
export function defaultTexts(language: LanguageCode, kind: "invitation" | "save_the_date" = "invitation"): InvitationTexts {
  return kind === "save_the_date" ? { ...DEFAULT_TEXTS[language], ...SAVE_THE_DATE_TEXTS[language] } : DEFAULT_TEXTS[language];
}

export type TextOverrides = Partial<Record<LanguageCode, Partial<InvitationTexts>>>;

/** Built-in wording for a language with the couple's edits on top. Blank edits fall back to the default. */
export function resolveTexts(language: LanguageCode, overrides: TextOverrides | Partial<InvitationTexts> | null | undefined, perLanguage = true, kind: "invitation" | "save_the_date" = "invitation"): InvitationTexts {
  const custom = (perLanguage ? (overrides as TextOverrides | null)?.[language] : overrides as Partial<InvitationTexts>) ?? {};
  const defaults = defaultTexts(language, kind);
  return Object.fromEntries(TEXT_KEYS.map((key) => [key, custom[key]?.trim() ? custom[key]!.trim() : defaults[key]])) as InvitationTexts;
}

export const PLACEHOLDERS = ["name", "couple", "link"] as const;
const TOKEN = /\{\{\s*([a-z]+)\s*\}\}/g;
export function unknownInvitationPlaceholders(text: string): string[] {
  return [...new Set([...text.matchAll(TOKEN)].map((match) => match[1]!).filter((name) => !(PLACEHOLDERS as readonly string[]).includes(name)))];
}
export function fillText(text: string, values: { name?: string; couple?: string; link?: string }): string {
  return text.replace(TOKEN, (whole, key: string) => (values as Record<string, string | undefined>)[key] ?? whole);
}

/** The message shared with the card. The private link is always included, even if the wording leaves it out. */
export function shareMessage(texts: InvitationTexts, values: { name: string; couple: string; link: string }): string {
  const message = fillText(texts.share, values);
  return /\{\{\s*link\s*\}\}/.test(texts.share) ? message : `${message}\n${values.link}`;
}

/** What is stored in the message log: the same text with the private link removed. */
export function messageWithoutLink(message: string, link: string): string {
  return message.split(link).join("[private invitation link]");
}

/**
 * WhatsApp click-to-chat link. Only an international number (starting with +) is used to pick the
 * chat; otherwise WhatsApp opens its contact picker, because guessing a country code could message a stranger.
 */
export function whatsappUrl(phone: string, text: string): { url: string; hasNumber: boolean } {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  const hasNumber = trimmed.startsWith("+") && digits.length >= 8 && digits.length <= 15;
  return { url: `https://wa.me/${hasNumber ? digits : ""}?text=${encodeURIComponent(text)}`, hasNumber };
}

export function mailtoUrl(email: string, subject: string, body: string): string {
  const to = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email.trim()) ? encodeURIComponent(email.trim()).replace(/%40/g, "@") : "";
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function formatFunctionDate(date: string | null, time: string | null, language: LanguageCode): string {
  const locale = LANGUAGES.find((item) => item.code === language)?.locale ?? "en-IN";
  if (!date) return "";
  const day = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  if (!time) return day;
  const clock = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(`2000-01-01T${time.slice(0, 5)}:00Z`));
  return `${day} · ${clock}`;
}

export type ThemeId = "mallige" | "veena" | "kolam" | "thoranam" | "yakshagana" | "kanchi";
/** `accent` decorates (borders, motifs); `accentText` is the same hue darkened to at least 4.5:1 for text. */
export const THEMES: Array<{ id: ThemeId; name: string; description: string; background: string; ink: string; accent: string; accentText: string; soft: string }> = [
  { id: "mallige", name: "Mallige", description: "Mangalore jasmine strings on ivory, with a gold border.", background: "#fbf7ee", ink: "#2f3a2c", accent: "#b38a2e", accentText: "#7f5b14", soft: "#e9dfc5" },
  { id: "veena", name: "Veena", description: "Carnatic evening: deep silk maroon, gold zari, a veena and the seven swaras.", background: "#5b1622", ink: "#fbecd0", accent: "#e2b45a", accentText: "#e2b45a", soft: "#7a2633" },
  { id: "kolam", name: "Kolam", description: "Rice-flour kolam dots and loops on warm turmeric.", background: "#f3c35a", ink: "#4a2a0c", accent: "#fffaf0", accentText: "#6b2f00", soft: "#e8ad3c" },
  { id: "thoranam", name: "Thoranam", description: "Mango-leaf thoranam and marigolds over banana-leaf green.", background: "#f6f3e4", ink: "#1f3d24", accent: "#e98b1d", accentText: "#9a4400", soft: "#cfe0b8" },
  { id: "yakshagana", name: "Yakshagana", description: "Coastal Karnataka stage colours: vermilion, gold and black, with a crown-arch frame.", background: "#1d1412", ink: "#f8e6c4", accent: "#d9a23a", accentText: "#d9a23a", soft: "#a5251c" },
  { id: "kanchi", name: "Kanchi silk", description: "Temple-border silk: magenta body, gold temple triangles.", background: "#7d1747", ink: "#fdeedd", accent: "#e8b34b", accentText: "#e8b34b", soft: "#9a2b5d" },
];

function luminance(hex: string) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}
/** WCAG contrast ratio between two #rrggbb colours (1–21). */
export function contrastRatio(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Colour for accent-coloured text on a theme: the couple's own accent when it is readable
 * (at least 4.5:1), otherwise the theme's text-safe accent, otherwise the body ink.
 */
export function readableAccent(themeId: ThemeId, customAccent: string | null | undefined) {
  const theme = themeById(themeId);
  if (customAccent && contrastRatio(customAccent, theme.background) >= 4.5) return customAccent;
  return contrastRatio(theme.accentText, theme.background) >= 4.5 ? theme.accentText : theme.ink;
}

export const themeById = (id: string) => THEMES.find((theme) => theme.id === id) ?? THEMES[0]!;

/** Darkens a colour step by step (towards black) until it reaches 4.5:1 on `background`. */
export function darkenToContrast(hex: string, background = "#ffffff", target = 4.5): string {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (let step = 0; step <= 20; step += 1) {
    const factor = 1 - step * 0.05;
    const color = `#${rgb.map((v) => Math.round(v * factor).toString(16).padStart(2, "0")).join("")}`;
    if (contrastRatio(color, background) >= target) return color;
  }
  return "#000000";
}

/**
 * Accent-coloured text on the guest page itself (white cards on a light page), as opposed to text
 * on the card's own theme background. Dark themes' gold is readable on maroon, not on white.
 */
export function pageAccentText(themeId: ThemeId, customAccent: string | null | undefined): string {
  return darkenToContrast(readableAccent(themeId, customAccent), "#ffffff");
}
