import { expect, test } from "@playwright/test";

// Critical-path flow #1 — login / auth round-trip (ADR-0008 Option C, framework E7 T7.1.1).
// Arrange the account via the API (deterministic, no seed dependency), then exercise the real
// UI sign-in and assert we land on the authed projects page. Selectors are role/label only.

/** A unique account per run — the compose DB persists across CI runs; unique emails avoid collisions. */
function freshCreds() {
  return {
    email: `e2e-${Date.now()}@example.com`,
    password: "Passw0rd!e2e",
    displayName: "E2E User",
  };
}

test("a registered user can sign in and reach the projects page", async ({ page, request }) => {
  const { email, password, displayName } = freshCreds();

  // Arrange: create the account through the API (goes via baseURL → /api proxy). We do NOT reuse
  // the request context's cookies — the browser signs in on its own below.
  const created = await request.post("/api/auth/register", {
    data: { email, password, displayName },
  });
  expect(created.ok(), `register failed: ${created.status()} ${await created.text()}`).toBeTruthy();

  // Act: sign in through the UI. "Sign in" is the default-active tab, so its panel is the only one mounted.
  await page.goto("/login");
  const panel = page.getByRole("tabpanel");
  await panel.getByLabel("Email").fill(email);
  await panel.getByLabel("Password").fill(password);
  await panel.getByRole("button", { name: "Sign in" }).click();

  // Assert: the server set the HttpOnly cookie, /auth/me resolved, and we were redirected to /projects.
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
});

test("an unauthenticated visit to a protected route bounces to /login", async ({ page }) => {
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("tab", { name: "Sign in" })).toBeVisible();
});
