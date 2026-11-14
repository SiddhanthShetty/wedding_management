/**
 * Signed-in journeys. Two targets:
 *
 *   E2E_TARGET=staging   all journeys, including ones that create and archive TEST data.
 *   E2E_TARGET=readonly  only journeys that read (every section, desktop and phone width); safe
 *                        against the live site with your own account, because nothing is saved.
 *
 *   E2E_TARGET=readonly E2E_EMAIL=… E2E_PASSWORD=… PLAYWRIGHT_BASE_URL=https://your-address \
 *     npx playwright test tests/signed-in.spec.ts
 *
 * The app at PLAYWRIGHT_BASE_URL must be running against staging (see docs/staging.md). The test
 * account is one you create yourself on staging, as owner of a TEST wedding.
 */
import { expect, test, type Page } from "@playwright/test";

const target = process.env.E2E_TARGET;
const enabled = (target === "staging" || target === "readonly") && Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD);
const writes = target === "staging";
test.skip(!enabled, "Signed-in journeys run only with E2E_TARGET=staging or E2E_TARGET=readonly and an account.");
test.describe.configure({ mode: "serial" });

const ROUTES = ["/overview", "/today", "/guests/simple", "/guests", "/invitations", "/functions", "/tasks", "/decisions", "/search", "/venues-vendors", "/budget", "/logistics", "/schedule", "/travel", "/documents", "/messages", "/settings"];

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Password").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(overview|setup)/);
}

test("signs in and opens every section without errors, on desktop", async ({ page }) => {
  await signIn(page);
  for (const route of ROUTES) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBeLessThan(400);
    await expect(page.getByText("This section could not load"), route).toHaveCount(0);
    await expect(page.locator("main"), route).toBeVisible();
  }
});

test("every section fits a phone screen without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  for (const route of ROUTES) {
    await page.goto(route);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${route} is ${overflow}px too wide`).toBeLessThanOrEqual(1);
    await expect(page.locator(".phone-tabs"), route).toBeVisible();
  }
});

test("uploads, downloads and archives a document in private storage", async ({ page }) => {
  test.skip(!writes, "Creates TEST data: staging only.");
  await signIn(page);
  await page.goto("/documents");
  const belongsTo = page.getByLabel("Belongs to");
  const options = await belongsTo.locator("option").evaluateAll((items) => items.map((item) => (item as HTMLOptionElement).value).filter(Boolean));
  await belongsTo.selectOption(options[0]!);
  const title = `TEST upload ${Date.now()}`;
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("File").setInputFiles({ name: "test.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% TEST document for the staging check\n%%EOF\n") });
  await page.getByRole("button", { name: "Upload document" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Uploaded" })).toBeVisible({ timeout: 30_000 });
  await page.reload();
  const row = page.locator("li, tr").filter({ hasText: title }).first();
  await expect(row).toBeVisible();
  // The download goes through the app and redirects to a short-lived signed Storage address.
  const href = await row.getByRole("link", { name: /download/i }).first().getAttribute("href");
  const download = await page.request.get(href!, { maxRedirects: 0 });
  expect([302, 303, 307]).toContain(download.status());
  expect(download.headers()["location"]).toMatch(/\/storage\/v1\/object\/sign\//);
  await row.getByRole("button", { name: "Archive document" }).click();
  await expect(page.getByRole("status").filter({ hasText: /archived/i })).toBeVisible();
});

test("invitation studio previews the design and makes a family preview link that works", async ({ page, context }) => {
  test.skip(!writes, "Creates a preview link: staging only.");
  await signIn(page);
  await page.goto("/invitations");
  await expect(page.locator(".phone-frame")).toBeVisible();
  await page.getByRole("tab", { name: /Share/ }).click();
  const create = page.getByRole("button", { name: "Create preview link" });
  test.skip(!(await create.isVisible()), "Create and save a design in the studio first.");
  await create.click();
  const link = await page.getByLabel("Preview link").inputValue();
  expect(link).toMatch(/\/guest\/preview#[A-Za-z0-9_-]{43}$/);
  const guest = await context.browser()!.newContext();
  const preview = await guest.newPage();
  await preview.goto(link);
  await expect(preview.getByText(/Preview · replies are switched off/)).toBeVisible({ timeout: 20_000 });
  expect(preview.url()).not.toContain("#"); // the token is removed from the address bar
  await guest.close();
});

test("guest desk: paste two families, reply from a family link, see it replied", async ({ page, context }) => {
  test.skip(!writes, "Creates TEST families and a reply: staging only.");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page);
  const stamp = Date.now();
  const rao = `TEST Desk Rao ${stamp}`;
  const pai = `TEST Desk Pai ${stamp}`;
  await page.goto("/guests/simple");
  await page.locator("#family-name-0").fill(rao);
  await page.locator("#family-guests-0").fill("3");
  await page.getByRole("button", { name: "Add another family" }).click();
  await page.locator("#family-name-1").fill(pai);
  await page.locator("#family-phone-1").fill("98765 43210");
  await page.getByRole("button", { name: "Add 2 families" }).click();
  await expect(page.getByText(/Added 2 families/)).toBeVisible();
  await expect(page.locator("#family-name-0")).toHaveValue("");
  const row = page.getByRole("row", { name: new RegExp(rao) });
  await expect(row).toContainText("Not yet");
  await expect(page.getByRole("row", { name: new RegExp(pai) })).toBeVisible();
  await row.getByRole("button", { name: "Copy link" }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/i\/[A-Za-z0-9]{12}$/);

  const guest = await context.newPage();
  await guest.goto(link);
  await guest.getByRole("button", { name: "Open quietly" }).click();
  await expect(guest.getByText(`Dear ${rao},`).first()).toBeVisible();
  await guest.getByLabel("Your name *").fill("Test Guest");
  await guest.getByLabel("Phone number *").fill("+91 90000 00000");
  await guest.getByText("Joyfully accepts").click();
  await guest.getByLabel("How many of you are coming? *").selectOption("2");
  for (const box of await guest.locator('input[name="events"]').all()) await box.check();
  await guest.getByRole("button", { name: "Send our response" }).click();
  await expect(guest.getByText(/Your response is saved/)).toBeVisible();
  // Only the family's name is shown: never its guest limit or a phone number.
  await guest.reload();
  await expect(guest.getByText("+91 90000 00000")).toHaveCount(0);
  await expect(guest.getByText(/up to \d+ guests?/)).toHaveCount(0);
  await guest.close();

  await page.reload();
  await expect(page.getByRole("row", { name: new RegExp(rao) })).toContainText("Coming, 2");
});
