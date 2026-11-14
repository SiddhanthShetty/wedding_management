# Sheets: spreadsheets as tables

**Pages:** **Sheets** in the menu (`/sheets`, and `/sheets/<id>` for one table).
**Migration:** `supabase/migrations/20261122100000_sheets.sql` (additive).

## Adding a table

1. **Choose a file**: Excel (`.xlsx`) or CSV, up to 5 MB. Older `.xls` files are refused with a note
   to re-save them as `.xlsx`.
2. **Preview** (nothing is saved yet): pick the sheet if the workbook has several, say whether the first
   row has the column names, name the table, and rename each column or change its type (Text, Number,
   Date, Yes / no, Link). Types are guessed from the values; the first 20 rows are shown.
3. **Add table**: the server reads the file again (rows never come from the browser), checks every
   cell against its column's type and saves the table and all its rows in one transaction. If any cell
   doesn't fit, nothing is saved and the message names the row and column ("Row 7, "Amount": "abc"
   isn't a number"). The original file is kept in **All files** (category "Sheets").

Reading rules: empty rows and empty trailing columns are dropped; blank column names become "Column C";
repeated names get "(2)". Formulas come in as the value Excel last calculated. Dates are read as dates
from Excel, or as text like `2027-12-05` or `05/12/2027` (day first). Numbers may have commas, ₹ or Rs.
Links must start with `http://` or `https://`.

Limits: 2,000 rows, 50 columns, 2,000 characters a cell, 3 million characters a table, 30 sheets a
workbook, 60 MB once an `.xlsx` is unzipped (guards against "zip bombs").

## From Google Drive

With the three Google settings in place, the upload card also shows **From Google Drive**. It asks
Google for access (a Google window; the first time, a consent screen), opens Google's own file
chooser (Google Sheets, Excel and CSV files only), then downloads the chosen file in the browser,
straight from Google. A Google Sheet comes as `.xlsx`. From there it's the same preview and checks as
a file from the device.

- Access uses the `drive.file` scope: the app can open only files the person picks in the chooser,
  never the rest of their Drive. The access token stays in the browser tab's memory (about 50 minutes)
  and is never sent to this app's server or stored.
- The button is hidden, and the security headers don't allow Google's addresses, until all three
  settings are present. The headers are fixed at build time, so redeploy after adding them.

### One-time setup (Google Cloud and Vercel)

1. In Google Cloud Console (console.cloud.google.com), create a project (e.g. "Wedding Desk").
2. **APIs & Services → Library**: enable **Google Picker API** and **Google Drive API**.
3. **Google Auth Platform** (called "OAuth consent screen" in older consoles): app name and support
   email; Audience **External**, left in **Testing**; add both your Google accounts as **Test users**;
   under Data Access add the scope `https://www.googleapis.com/auth/drive.file`. In Testing mode Google
   shows "Google hasn't verified this app": choose Continue. Only test users can connect.
4. **Clients → Create client → Web application**. Authorized JavaScript origins: your site's address
   (e.g. `https://your-app.vercel.app` and any custom domain), plus `http://localhost:3000` for local
   use. No redirect URIs are needed. Copy the **Client ID**.
5. **Credentials → Create credentials → API key**. Restrict it: Application restrictions **Websites**
   with your site's address (`https://your-app.vercel.app/*`); API restrictions **Google Picker API**.
6. **IAM & Admin → Settings**: copy the **Project number** (digits, not the project ID).
7. In Vercel → the project → Settings → Environment Variables (Production), add
   `GOOGLE_PICKER_CLIENT_ID`, `GOOGLE_PICKER_API_KEY` and `GOOGLE_CLOUD_PROJECT_NUMBER`, then redeploy.
   For local use, add the same three to `.env.local`.

## Using a table

Search any column, sort by any column (tap the heading: up, down, file order), 50 rows a page. On a
phone each row shows as a card. **Excel** and **CSV** download the table (CSV cells starting with
`= + - @` are defused; the Excel file never contains formulas). **Rename** and **Delete** (after a
confirmation; permanent; the original file stays in All files).

Editing cells, rows and columns in the app is part B (not built yet).

## Access and security

- Plan access decides it: Plan **read** sees Sheets, Plan **edit** (and the couple) adds, renames and
  deletes. Enforced by RLS on `data_tables` and `data_table_rows`; the server checks too.
- Uploads are same-origin only, size-checked before reading, and the file type is detected from its
  content. Files are not virus-scanned.
- Reading uses `read-excel-file` 9.3.14 and writing `write-excel-file` 4.1.1 (pinned). The popular
  `xlsx` package was not used: its npm release has unfixed security advisories.

## Database impact (`20261122100000_sheets.sql`)

Additive. New tables `data_tables` (name, source file and sheet, columns as JSON) and `data_table_rows`
(position, cells as JSON keyed by column id, at most 64 KB a row), a 2,000-row limit trigger, a column
check and `create_data_table` (runs as the caller, so RLS applies). No existing table or row changes.
Apply it before deploying this code, or the Sheets page will fail to load.

## Checks

Rules and file reading: `tests/sheets-rules.test.ts`. Database and access: `tests/sheets-db.test.ts`.
Upload routes and actions: `tests/sheets-actions.test.ts`. Google Drive rules: `tests/sheets-drive.test.ts`.
