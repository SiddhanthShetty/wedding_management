# Personalised Invitations (Option A: share-assisted)

**Route:** `/invitations` (Guests → Invitations). **Module:** `guests` (read to view, edit to change and share).
**Migration:** `supabase/migrations/20261107100000_invitations.sql` (additive; replaces `get_guest_portal_data` to add the household language and chosen design).
**Preview:** `docs/previews/invitation-themes.html` shows all six themes with sample data.

## What it does

1. **Design** a card once: choose a theme, optionally an accent colour, and edit the wording per language. A live preview shows exactly what a chosen household will receive.
2. **Choose which design guests see.** The first design becomes the default automatically; you can switch later.
3. **Set each household's language:** English, Hindi, Kannada or Tulu (written in Kannada script).
4. **Share** each household's invitation from your own device:
   - *Share card & message* (phone share sheet: WhatsApp, Messages, Mail…) attaches the card image.
   - *WhatsApp* opens click-to-chat with the message. It opens a specific chat only if the saved phone number starts with `+`; otherwise WhatsApp asks you to pick the contact, so a guessed country code never messages a stranger.
   - *Email* opens your mail app pre-filled. *Copy* and *Card image* are also available.
5. **Record** “I sent it via WhatsApp / Email / Other”. This appears in the message log as *sent manually*. It does not confirm delivery.

The guest portal shows the same themed card at the top, in the household's language, above the per-person RSVP.

## Themes

| Theme | Inspiration |
| --- | --- |
| Mallige | Mangalore jasmine strings on ivory, gold border |
| Veena | Carnatic evening: silk maroon, gold zari, veena, *Sa Ri Ga Ma Pa Da Ni* |
| Kolam | Rice-flour kolam dots and loops on turmeric |
| Thoranam | Mango-leaf thoranam with marigolds |
| Yakshagana | Coastal Karnataka stage colours with a crown-arch frame |
| Kanchi silk | Magenta silk with gold temple-border triangles |

Cards are SVG (1080×1350, 4:5) and are turned into PNG **on the planner's device**, using the device's own Kannada and Devanagari fonts. Nothing is uploaded.

## Languages

The built-in Hindi, Kannada and Tulu wording are **drafts**. The studio says so and every line is editable. Please have a native speaker check them, especially Tulu. Dates use the language's format; Tulu uses Kannada date formatting, because browsers have no Tulu locale. Placeholders: `{{name}}` (household), `{{couple}}`, `{{link}}`. Unknown placeholders are rejected on save.

## Private links

**Prepare invitation** creates a **new** 30-day private link for the household and revokes any earlier one; the app warns before doing it. The link is shown once, put into the message on your device, and never stored. The message log keeps the text with the link replaced by “[private invitation link]”.

## Security and permissions

- Designs: guest-module read to view, edit to create or change (RLS). Only name, theme, accent and wording are client-updatable. The default design is chosen via `set_default_invitation_design`, and `created_by` / `updated_by` are stamped by the database.
- Household language: changed only through `set_household_language` (guest edit).
- Guests see only the default design's theme, accent and the wording for their own language.

## Invitation website and upgrades (2026-11)

- **Guest page as a website.** An optional envelope opening, a section menu, a countdown to the next function, a "Watch live" button from 30 minutes before to 6 hours after each function starts, an "our story" timeline (up to 8 moments), FAQ (up to 12), per-function colour palettes, and a blessings wall. Every blessing is held for the couple to approve first, and other guests see only the writer's first name. Edited under Invitations → Website.
- **Guest page language.** The whole page, including messages from the server, is in English, Hindi, Kannada or Tulu. It starts in the household's language, and guests can switch. The Hindi, Kannada and **Tulu** wording are drafts: a native speaker needs to review them before real use.
- **Fonts.** Inter, Cormorant Garamond, and Noto Sans or Serif in Kannada and Devanagari, loaded through `next/font`. Exported PNGs embed the fonts, so they look the same on every phone.
- **Card.**
  - An optional couple photo (resized on the device to at most 330 KB and stored on the design; guests receive it only through their session) or a monogram seal.
  - Text is fitted to the card automatically.
  - Formats: portrait 4:5, story 9:16, square, and print A5 with a QR code to the guest's link.
- **Video.** An 8-second 9:16 video (the card, falling petals and a closing line), recorded in the browser. It saves as MP4 where the browser supports it, otherwise WebM, which may not play in WhatsApp; the app warns when this happens. You can add your own music. No music is bundled, and nothing is uploaded.
- **Sending.** Filters (Not sent, Sent not opened, Opened), "Send in order" through the queue, and "Opened … ago" taken from when each link was last used.
- **Link preview.** A generic "You are invited" image with no names, because the private token never reaches the server in a preview.

## Invitation studio (Milestone 1, 2026-11)

The studio follows the structure of modern invitation builders, with our own design and themes.

- **Four steps:**
  - Design: template, colours, photo, monogram, and how guests open it.
  - Content: names and parents' lines, blessing line, card wording, story, guest information, FAQ, palettes, livestream, closing family names, hashtag and Instagram, opening-screen wording and section titles.
  - Extras: every card format as a sample.
  - Share: family preview link, sending, and blessings.
- **Live phone preview.** It shows the real guest page built from the unsaved draft, as a sample guest or as any invited guest, in any of the four languages. It has a "Replay opening" button and a WhatsApp view of how the card and message arrive. Replies and blessings are switched off in previews.
- **One save.** The card and the website are saved together in one versioned update. The studio shows "Unsaved changes" and warns before you leave the page.
- **Family preview link.** `/guest/preview#token` works for 30 minutes and is marked as a preview. Replies are off, and it never contains guest data: it shows the saved design, its website and the wedding's functions with a sample guest. Only guest-list editors can create one, at most 20 open per wedding. Only a keyed digest of the token is stored.
- **Content fields** are stored in `invitation_designs.site`, so they need no schema change. They are validated strictly on save:
  - hashtags may use any script;
  - Instagram handles follow Instagram's rules;
  - phone numbers may only contain digits and + ( ) -;
  - the whole website must stay under 60 KB.

  Websites saved earlier are read with defaults for the new fields.
- **Contrast fix.** Countdown numbers, the hashtag and the section-menu hover now use the readable accent colour (`--portal-accent-text`). Before this, they could be unreadable on the Kolam theme.

## Invitation studio (Milestone 2, 2026-11)

- **Page templates.** Each works with every theme and language:
  - *Classic*.
  - *Kalyana Mantapa*: a mango-leaf and marigold thoranam across the top, banana-stem pillars beside the invitation, and sections arched like a mantapa.
  - *Kacheri*: the page as a Carnatic concert programme, with double rules, Roman-numeral items, small-caps headings and a veena line drawing.

  These are our own designs; no other product's artwork is used.
- **Opening styles:**
  - Envelope with your seal.
  - Pull-out letter: the card rises out of a sleeve, and the button sits on the sleeve.
  - Temple doors: carved doors with brass studs swing open.

  All are skipped for people who prefer less motion.
- **Celebration effect.** Petals, confetti or none. It plays after the opening and after a guest replies yes, and never for people who prefer less motion.
- **Music.** One file per design (MP3, M4A or OGG, up to 1.5 MB). It starts only from the guest's own tap on "Open", with a play/pause button; it never starts on its own. The studio tells you to use only music you have the rights to share.
- **Photo gallery.** Up to 8 photos, resized on the device to a JPEG of at most 450 KB, with optional captions. Guests see a grid and a full-screen view with arrow keys and Escape.
- **Storage.**
  - Music and photos are stored in `invitation_media`, encoded as text in the row like the couple photo, because guests can't use Storage.
  - Guests get them only through their session, from the design they see (`/guest/media/<id>`).
  - Family previews get them through an httpOnly preview cookie (`/guest/preview/media/<id>`).
  - The studio loads them through a signed-in route.
  - Files are checked by their first bytes on the server, whatever their name or claimed type.
- **Known limit.** Each guest page now loads up to about 10 files. Guest reads are limited to 120 per minute per network address. Media responses are cached for an hour, but a large group on one venue Wi-Fi opening links at the same moment could still reach the limit.

## Invitation studio (Milestone 3, 2026-11)

- **What are you sending?** Each design is either a full invitation or a **Save the Date**. A Save the Date has:
  - its own card: a large "Save the date" label, your names, the date and the place;
  - its own built-in wording in all four languages (Hindi, Kannada and Tulu are drafts);
  - a guest page with a countdown to the wedding day, an all-day "Add to calendar" entry, your story, photos and closing, and a note that the invitation will follow. It has no schedule, replies, FAQ or blessings.

  To send a Save the Date first and the invitation later, make two designs and switch which one guests see. The studio warns if the design guests currently see becomes a Save the Date after invitations were sent, because replies would disappear from their page.
- **PDF card (A5).** Made on your phone or computer with no server or new dependency; `src/lib/invitations/pdf.ts` writes one JPEG per page.
  - Invitation: a cover (photo, or your initials), the invitation with the blessing line and both families' lines, one page per function (date, time, place and colour palette), and a last page with the guest's QR code, closing family names and hashtag.
  - Save the Date: the cover, the card and the closing page.
  - A sample is in Extras. Each guest's own PDF, with their QR code, is in Share after their link is created. You can share it straight to WhatsApp where the browser supports file sharing, or download it. A 5-page sample came to about 0.8 MB.
- **Contrast fix.** Accent text on the white guest page (blessing line, Save the Date date, hashtag, music button) now uses a colour checked at 4.5:1 against white. Before this, the gold of dark themes such as Veena and Kanchi was hard to read there. The countdown keeps the theme's own readable accent, because it sits on the theme background.
- **No database change** in this milestone: the Save the Date details live in the design's website content.

### Pending decisions

- **Re-send without revoking.** Links are stored only as hashes, so a link can be shown once, but it can't be re-sent later without creating a new one. Allowing re-sends would mean storing link tokens encrypted. This needs your decision; it is not built.
- **Dark mode.** Deferred, because it can't be checked visually in this environment.

## Not included (on hold)

Automatic email (Option B) and WhatsApp Business sending (Option C). See `messaging-integration-design.md`. You will be reminded once the remaining usability steps are done.

## Own artwork, outside invitation sites, and the studio freeze (2026-11-08)

**Decision:** invitations, private guest links and replies stay in this app. They depend on the guest list (different functions per guest, households, languages, catering counts and tracking), and a separate invitation app would split the guest list in two. The artwork can come from anywhere. **The design studio is frozen:** no new templates, effects or design features; only bug fixes. Effort until the wedding goes to replies, headcounts and wedding-week operations.

- **Use our own artwork.** Under Design → Card artwork, upload a finished invitation image from a designer, Canva or an invitation studio.
  - It's resized on the device to at most 2000 px and 1.3 MB, and stored as `invitation_media` kind `artwork`, one per design. Guests reach it only through their session; family previews through their link.
  - It's shown whole, never cropped. If it isn't 4:5, it sits on the theme colour.
  - Optionally a light band at the top or bottom carries "Dear (name)," in the guest's language.
  - Every output uses it: the guest page, share image and formats, video, and the PDF. In the PDF, the artwork page with the guest's QR code replaces the drawn cover and invitation pages.
  - For a PDF from a designer, export the main page as JPEG or PNG first.
- **Invitation website elsewhere.** Content → "Invitation website elsewhere" adds an https link and button text. Guests see "See our full invitation ↗", with a note to reply on this page, so there's still one guest list.
- **Exports** now inline same-origin images (artwork and couple photo) before drawing, because an SVG drawn as an image can't load other addresses.
- Migration `20261118100000_invitation_artwork.sql` adds the `artwork` kind and includes it in the guest and preview media listings. Additive only.
