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

### Pending decisions

- **Re-send without revoking.** Links are stored only as hashes, so a link can be shown once, but it can't be re-sent later without creating a new one. Allowing re-sends would mean storing link tokens encrypted. This needs your decision; it is not built.
- **Dark mode.** Deferred, because it can't be checked visually in this environment.

## Not included (on hold)

Automatic email (Option B) and WhatsApp Business sending (Option C). See `messaging-integration-design.md`. You will be reminded once the remaining usability steps are done.
