import { expect, test } from "@playwright/test";

test("authentication routes render and unauthenticated workspace routes redirect", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in to Wedding Desk", level: 1 })).toBeVisible();
  await page.goto("/sign-up");
  await expect(page.getByRole("heading", { name: "Create an account", level: 1 })).toBeVisible();

  const protectedRoutes = [
    "/overview", "/functions", "/tasks", "/decisions", "/venues-vendors", "/budget",
    "/guests", "/logistics", "/documents", "/settings", "/design-system",
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
