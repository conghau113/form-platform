import { type APIRequestContext, expect, type Page } from "@playwright/test";

// Shared arrange-helpers for the CRUD / save-load specs (framework E7 T7.2.1). Each keeps a spec
// starting from a clean, authed session and reaching the editor through the REAL UI, with
// role/label/placeholder selectors only (ADR-0008 — resist antd DOM churn).

/** A unique account per run — the stack's DB persists across runs; unique emails avoid collisions. */
export function freshCreds() {
  return {
    email: `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`,
    password: "Passw0rd!e2e",
    displayName: "E2E User",
  };
}

/**
 * Register an account through the API, then sign in through the real UI and land on `/projects`.
 * Mirrors `auth.spec.ts` so every CRUD/save-load spec starts authed without depending on seed data.
 */
export async function registerAndSignIn(page: Page, request: APIRequestContext) {
  const creds = freshCreds();
  const created = await request.post("/api/auth/register", { data: creds });
  expect(created.ok(), `register failed: ${created.status()} ${await created.text()}`).toBeTruthy();
  // The account's id becomes a submission's `submittedBy` — return it so a spec can find its own row.
  const { user } = (await created.json()) as { user: { id: string } };

  await page.goto("/login");
  const panel = page.getByRole("tabpanel");
  await panel.getByLabel("Email").fill(creds.email);
  await panel.getByLabel("Password").fill(creds.password);
  await panel.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  return { ...creds, userId: user.id };
}

/** Create a project via the `/projects` modal and land in its (empty) workspace. */
export async function createProject(page: Page, name: string) {
  await page.getByRole("button", { name: "New project" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Project name").fill(name);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
}

/**
 * Create a form via the Explorer's inline "Form" create (type the title, Enter to commit) and land
 * in the editor. The inline input renders only once the (freshly-created) project tree has loaded,
 * so the placeholder locator auto-waits through the load spinner.
 */
export async function createForm(page: Page, title: string) {
  // antd prefixes the button's accessible name with its icon name ("file-add Form"), so anchor on
  // the trailing label rather than an exact match — and avoid matching "Folder"/"Workflow"/"Share".
  await page.getByRole("button", { name: /Form$/ }).click();
  const input = page.getByPlaceholder("Form title");
  await input.fill(title);
  await input.press("Enter");
  await expect(page).toHaveURL(/\/forms\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Builder" })).toBeVisible();
}
