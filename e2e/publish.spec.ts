import { expect, test } from "@playwright/test";
import { createForm, createProject, registerAndSignIn } from "./helpers";

// Critical-path flow — publish a form (ADR-0008 Option C, framework E7 T7.2.2). Drives the editor
// header's PublishControl: a fresh form reads "Chưa publish"; clicking Publish saves the draft, then
// freezes it into version 1, and the badge flips to "Đã publish v1". Selectors are role/text only.

test("publishing a fresh form freezes it into version 1", async ({ page, request }) => {
  await registerAndSignIn(page, request);
  await createProject(page, `E2E Project ${Date.now()}`);
  await createForm(page, `E2E Form ${Date.now()}`);

  // A never-published form shows the "Chưa publish" badge next to the Publish button.
  await expect(page.getByText("Chưa publish")).toBeVisible();

  // Publish saves the editor then POSTs /forms/:id/publish — wait for that before asserting.
  const published = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" && /\/forms\/[^/]+\/publish$/.test(new URL(r.url()).pathname),
  );
  await page.getByRole("button", { name: "Publish" }).click();
  await published;

  // The badge flips to the up-to-date "Đã publish v1" state (draft matches the frozen version).
  await expect(page.getByText(/Đã publish v1/)).toBeVisible();
});
