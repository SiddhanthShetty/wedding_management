/** Sheets from Google Drive: when the button shows, which files are allowed, and where they come from. */
import { describe, expect, it } from "vitest";
import { DRIVE_SCOPE, driveConfigFrom, driveDownload, GOOGLE_SHEET, XLSX } from "../src/lib/sheets/drive";

const env = { GOOGLE_PICKER_CLIENT_ID: "123456789012-abc123def456.apps.googleusercontent.com", GOOGLE_PICKER_API_KEY: "AIzaSyTESTONLY_not_a_real_key_000000000", GOOGLE_CLOUD_PROJECT_NUMBER: "123456789012" };
const MB5 = 5 * 1024 * 1024;

describe("settings", () => {
  it("shows Drive only when all three settings are present and well formed", () => {
    expect(driveConfigFrom(env)).toEqual({ clientId: env.GOOGLE_PICKER_CLIENT_ID, apiKey: env.GOOGLE_PICKER_API_KEY, appId: "123456789012" });
    expect(driveConfigFrom({})).toBeNull();
    expect(driveConfigFrom({ ...env, GOOGLE_PICKER_API_KEY: "" })).toBeNull();
    expect(driveConfigFrom({ ...env, GOOGLE_PICKER_CLIENT_ID: "my-client" })).toBeNull();
    expect(driveConfigFrom({ ...env, GOOGLE_CLOUD_PROJECT_NUMBER: "wedding-app" })).toBeNull();
    expect(driveConfigFrom({ ...env, GOOGLE_PICKER_API_KEY: "key\"><script>" })).toBeNull();
  });

  it("asks only for the files the person picks", () => {
    expect(DRIVE_SCOPE).toBe("https://www.googleapis.com/auth/drive.file");
  });
});

describe("downloading the picked file", () => {
  it("exports a Google Sheet as .xlsx", () => {
    expect(driveDownload({ id: "1AbCdEfGhIjKlMnOp", name: "Guest list", mimeType: GOOGLE_SHEET }, MB5))
      .toEqual({ url: `https://www.googleapis.com/drive/v3/files/1AbCdEfGhIjKlMnOp/export?mimeType=${encodeURIComponent(XLSX)}`, filename: "Guest list.xlsx" });
  });

  it("downloads Excel and CSV files as they are, keeping or adding the extension", () => {
    expect(driveDownload({ id: "1AbCdEfGhIjKlMnOp", name: "vendors.xlsx", mimeType: XLSX, sizeBytes: 1000 }, MB5)).toEqual({ url: "https://www.googleapis.com/drive/v3/files/1AbCdEfGhIjKlMnOp?alt=media", filename: "vendors.xlsx" });
    expect(driveDownload({ id: "1AbCdEfGhIjKlMnOp", name: "rooms", mimeType: "text/csv" }, MB5)).toMatchObject({ filename: "rooms.csv" });
    expect(driveDownload({ id: "1AbCdEfGhIjKlMnOp", name: "../<b>a/b</b>", mimeType: "text/csv" }, MB5)).toMatchObject({ filename: "..babb.csv" });
  });

  it("refuses other types, large files and odd ids before downloading", () => {
    expect(driveDownload({ id: "1AbCdEfGhIjKlMnOp", name: "plan.pdf", mimeType: "application/pdf" }, MB5)).toEqual({ problem: "Choose a Google Sheet, an Excel (.xlsx) file or a CSV file." });
    expect(driveDownload({ id: "1AbCdEfGhIjKlMnOp", name: "big.xlsx", mimeType: XLSX, sizeBytes: MB5 + 1 }, MB5)).toMatchObject({ problem: expect.stringMatching(/over 5 MB/) });
    expect(driveDownload({ id: "../../files/x?alt=media", name: "x.csv", mimeType: "text/csv" }, MB5)).toEqual({ problem: "That file couldn't be opened. Choose it again." });
  });
});
