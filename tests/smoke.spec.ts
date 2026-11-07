import { expect, test } from "@playwright/test";

test("authentication routes render and unauthenticated workspace routes redirect", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in to Wedding Desk", level: 1 })).toBeVisible();
  await page.goto("/sign-up");
  await expect(page.getByRole("heading", { name: "Create an account", level: 1 })).toBeVisible();

  const protectedRoutes = [
    "/overview", "/functions", "/tasks", "/decisions", "/venues-vendors", "/budget",
    "/guests", "/logistics", "/documents", "/settings", "/design-system",
    "/travel", "/schedule", "/schedule/pack", "/messages", "/overview/export", "/invitations", "/today",
  ];
  for (const route of protectedRoutes) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByRole("heading", { name: "Sign in to Wedding Desk", level: 1 })).toBeVisible();
    await expect(page.getByText("SAMPLE DATA", { exact: true })).toHaveCount(0);
  }
});

test("application starts and the sign-in screen works on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/");
  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});

test("private guest portal is no-store, no-referrer, and fails closed without a link", async ({ page }) => {
  const response = await page.goto("/guest");
  expect(response?.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { name: "Private invitation" })).toBeVisible();
  expect(response?.headers()["cache-control"]).toContain("no-store");
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.getByText(/Checking your private invitation|This invitation link is not available/)).toBeVisible();
  const exchange = await page.evaluate(async () => {
    const result = await fetch("/api/guest-portal/exchange", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "invalid-synthetic-token" }),
    });
    return { status: result.status, body: await result.text() };
  });
  expect(exchange.status).toBe(404);
  expect(exchange.body).toContain("This invitation link is not available");
  expect(exchange.body).not.toContain("household");
});

test("document and upload endpoints refuse anonymous and cross-site requests", async ({ page, request }) => {
  const crossSite = await request.post("/api/documents", { headers: { Origin: "https://attacker.example" }, multipart: { weddingId: "a0000000-0000-4000-8000-000000000001" } });
  expect(crossSite.status()).toBe(403);
  await page.goto("/sign-in");
  const anonymous = await page.evaluate(async () => {
    const form = new FormData();
    form.set("weddingId", "a0000000-0000-4000-8000-000000000001");
    form.set("entityType", "wedding");
    form.set("entityId", "");
    form.set("file", new File(["%PDF-1.4 synthetic"], "test.pdf", { type: "application/pdf" }));
    const result = await fetch("/api/documents", { method: "POST", body: form });
    return { status: result.status, body: await result.json() };
  });
  expect(anonymous, JSON.stringify(anonymous)).toMatchObject({ status: 401 });
  expect(anonymous.body.ok).toBe(false);
  const download = await request.get("/api/documents/a0000000-0000-4000-8000-000000000099?mode=download", { maxRedirects: 0 });
  expect([307, 401]).toContain(download.status());
  expect(download.headers()["location"] ?? "").not.toContain("supabase");
});

test("invitation media refuses anonymous, cross-site and session-less requests", async ({ page, request }) => {
  const id = "a0000000-0000-4000-8000-000000000099";
  const crossSite = await request.post("/api/invitations/media", { headers: { Origin: "https://attacker.example" }, multipart: { weddingId: id } });
  expect(crossSite.status()).toBe(403);
  await page.goto("/sign-in");
  const anonymous = await page.evaluate(async (weddingId) => {
    const form = new FormData();
    form.set("weddingId", weddingId); form.set("designId", weddingId); form.set("kind", "gallery"); form.set("caption", "");
    form.set("file", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])], "photo.jpg", { type: "image/jpeg" }));
    const result = await fetch("/api/invitations/media", { method: "POST", body: form });
    return { status: result.status, body: await result.json() };
  }, id);
  expect(anonymous, JSON.stringify(anonymous)).toMatchObject({ status: 401 });
  for (const path of [`/guest/media/${id}`, `/guest/preview/media/${id}`, `/api/invitations/media/${id}/${id}`, "/guest/media/not-a-uuid"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect([307, 404], path).toContain(response.status());
    expect(response.headers()["content-type"] ?? "", path).not.toMatch(/image|audio/);
  }
});
