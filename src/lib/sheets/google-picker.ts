"use client";

import { DRIVE_MIME_TYPES, DRIVE_SCOPE, driveDownload, type DriveConfig, type PickedFile } from "@/lib/sheets/drive";

/**
 * Opens Google's own file chooser and downloads the chosen file in the browser, straight from
 * Google. The access token only lets the app open files the person picks (drive.file), is kept in
 * memory for this page only, and is never sent to this app's server: the server receives the
 * downloaded file exactly like one chosen from the device.
 */

type TokenResponse = { access_token?: string; error?: string };
type TokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };
type PickerDoc = { id: string; name: string; mimeType: string; sizeBytes?: number | string };
type PickerData = { action: string; docs?: PickerDoc[] };
type GoogleGlobal = {
  accounts: { oauth2: { initTokenClient: (config: { client_id: string; scope: string; callback: (response: TokenResponse) => void; error_callback?: (error: { type?: string }) => void }) => TokenClient } };
  picker: {
    Action: { PICKED: string; CANCEL: string };
    DocsView: new (viewId?: unknown) => { setMimeTypes: (types: string) => unknown; setIncludeFolders: (include: boolean) => unknown; setMode: (mode: unknown) => unknown };
    DocsViewMode: { LIST: unknown };
    ViewId: { DOCS: unknown };
    PickerBuilder: new () => PickerBuilder;
  };
};
type PickerBuilder = {
  addView: (view: unknown) => PickerBuilder; setOAuthToken: (token: string) => PickerBuilder; setDeveloperKey: (key: string) => PickerBuilder;
  setAppId: (id: string) => PickerBuilder; setCallback: (callback: (data: PickerData) => void) => PickerBuilder; setTitle: (title: string) => PickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
};
declare global { interface Window { google?: GoogleGlobal; gapi?: { load: (name: string, callback: () => void) => void } } }

const loaded = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  if (!loaded.has(src)) loaded.set(src, new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src; script.async = true; script.referrerPolicy = "no-referrer";
    script.onload = () => resolve();
    script.onerror = () => { loaded.delete(src); reject(new Error("load")); };
    document.head.appendChild(script);
  }));
  return loaded.get(src)!;
}

let token: { value: string; until: number } | null = null;

async function accessToken(config: DriveConfig): Promise<string> {
  if (token && token.until > Date.now()) return token.value;
  await loadScript("https://accounts.google.com/gsi/client");
  const google = window.google!;
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: config.clientId, scope: DRIVE_SCOPE,
      callback: (response) => {
        if (!response.access_token) { reject(new Error(response.error ?? "denied")); return; }
        token = { value: response.access_token, until: Date.now() + 50 * 60 * 1000 };
        resolve(response.access_token);
      },
      error_callback: (error) => reject(new Error(error.type ?? "popup")),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

async function chooseFile(config: DriveConfig, oauth: string): Promise<PickedFile | null> {
  await loadScript("https://apis.google.com/js/api.js");
  await new Promise<void>((resolve) => window.gapi!.load("picker", resolve));
  const picker = window.google!.picker;
  const view = new picker.DocsView(picker.ViewId.DOCS);
  view.setMimeTypes(DRIVE_MIME_TYPES.join(",")); view.setIncludeFolders(true); view.setMode(picker.DocsViewMode.LIST);
  return new Promise((resolve) => {
    new picker.PickerBuilder().addView(view).setOAuthToken(oauth).setDeveloperKey(config.apiKey).setAppId(config.appId).setTitle("Choose a spreadsheet")
      .setCallback((data) => {
        if (data.action === picker.Action.CANCEL) resolve(null);
        if (data.action !== picker.Action.PICKED) return;
        const doc = data.docs?.[0];
        resolve(doc ? { id: doc.id, name: doc.name, mimeType: doc.mimeType, sizeBytes: doc.sizeBytes === undefined ? undefined : Number(doc.sizeBytes) } : null);
      }).build().setVisible(true);
  });
}

/** Asks Google for access, shows the chooser and returns the chosen file, or null if cancelled. */
export async function pickFromDrive(config: DriveConfig, maxBytes: number): Promise<{ file: File } | { problem: string } | null> {
  let oauth: string;
  try { oauth = await accessToken(config); }
  catch (error) {
    const reason = error instanceof Error ? error.message : "";
    if (reason === "load") return { problem: "Couldn't reach Google. Check your connection and try again." };
    if (reason === "popup_closed" || reason === "access_denied") return null;
    return { problem: reason === "popup_failed_to_open" ? "Your browser blocked Google's sign-in window. Allow pop-ups for this site and try again." : "Google didn't give access to Drive. Try again." };
  }
  let picked: PickedFile | null;
  try { picked = await chooseFile(config, oauth); }
  catch { return { problem: "Couldn't open Google Drive. Try again." }; }
  if (!picked) return null;
  const target = driveDownload(picked, maxBytes);
  if ("problem" in target) return target;
  try {
    const response = await fetch(target.url, { headers: { Authorization: `Bearer ${oauth}` }, cache: "no-store", referrerPolicy: "no-referrer" });
    if (response.status === 401) { token = null; return { problem: "Google access ran out. Choose the file again." }; }
    if (response.status === 403 && picked.mimeType.startsWith("application/vnd.google-apps")) return { problem: "This Google Sheet is too large to export. Save the sheet you need in a smaller file." };
    if (!response.ok) return { problem: "Couldn't download this file from Google Drive. Try again." };
    const blob = await response.blob();
    if (blob.size > maxBytes) return { problem: `This file is over ${Math.round(maxBytes / 1024 / 1024)} MB. Save the sheet you need in a smaller file.` };
    return { file: new File([blob], target.filename, { type: blob.type }) };
  } catch {
    return { problem: "Couldn't download this file from Google Drive. Check your connection and try again." };
  }
}
