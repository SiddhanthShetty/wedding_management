/**
 * Google Drive for Sheets: rules shared by the server (is it set up?) and the browser (which file,
 * and where to download it from). The Google settings are public by design (they're used in the
 * browser) but are kept out of the bundle and read on each request, so changing them in Vercel
 * only needs a redeploy.
 */

export type DriveConfig = { clientId: string; apiKey: string; appId: string };

/** The three Google settings, or null when any is missing or doesn't look right (Drive stays hidden). */
export function driveConfigFrom(env: Record<string, string | undefined>): DriveConfig | null {
  const clientId = env.GOOGLE_PICKER_CLIENT_ID?.trim() ?? "";
  const apiKey = env.GOOGLE_PICKER_API_KEY?.trim() ?? "";
  const appId = env.GOOGLE_CLOUD_PROJECT_NUMBER?.trim() ?? "";
  if (!/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId)) return null;
  if (!/^[A-Za-z0-9_-]{30,60}$/.test(apiKey)) return null;
  if (!/^[0-9]{6,20}$/.test(appId)) return null;
  return { clientId, apiKey, appId };
}

/** Only this app's own access to the files the person picks; never their whole Drive. */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const GOOGLE_SHEET = "application/vnd.google-apps.spreadsheet";
export const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** What the picker offers: Google Sheets, Excel workbooks and CSV files. */
export const DRIVE_MIME_TYPES = [GOOGLE_SHEET, XLSX, "text/csv"];

export type PickedFile = { id: string; name: string; mimeType: string; sizeBytes?: number };

/**
 * Where to download a picked file, and the name to give it. A Google Sheet is exported as .xlsx;
 * Excel and CSV files are downloaded as they are. Anything else, or a file over the size limit,
 * gets a message instead.
 */
export function driveDownload(file: PickedFile, maxBytes: number): { url: string; filename: string } | { problem: string } {
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(file.id)) return { problem: "That file couldn't be opened. Choose it again." };
  const base = file.name.replace(/[\u0000-\u001f\\/<>]/g, "").trim().slice(0, 200) || "Google sheet";
  if (file.mimeType === GOOGLE_SHEET) {
    return { url: `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=${encodeURIComponent(XLSX)}`, filename: `${base.replace(/\.xlsx$/i, "")}.xlsx` };
  }
  if (file.mimeType !== XLSX && file.mimeType !== "text/csv") return { problem: "Choose a Google Sheet, an Excel (.xlsx) file or a CSV file." };
  if (file.sizeBytes !== undefined && file.sizeBytes > maxBytes) return { problem: `This file is over ${Math.round(maxBytes / 1024 / 1024)} MB. Save the sheet you need in a smaller file.` };
  const extension = file.mimeType === XLSX ? ".xlsx" : ".csv";
  return { url: `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, filename: base.toLowerCase().endsWith(extension) ? base : `${base}${extension}` };
}

/** Google origins the security headers must allow when Drive is set up. */
export const DRIVE_CSP = {
  script: ["https://apis.google.com", "https://accounts.google.com"],
  frame: ["https://docs.google.com", "https://accounts.google.com", "https://content.googleapis.com"],
  connect: ["https://www.googleapis.com", "https://content.googleapis.com", "https://accounts.google.com"],
  style: ["https://accounts.google.com"],
  img: ["https://*.googleusercontent.com", "https://ssl.gstatic.com"],
} as const;
