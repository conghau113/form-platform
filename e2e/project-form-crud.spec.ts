import { expect, test } from "@playwright/test";
import { createForm, createProject, registerAndSignIn } from "./helpers";

// Critical-path flow — project + form CRUD (ADR-0008 Option C, framework E7 T7.2.1). Drives the
// real Explorer UI: create a project, create a form inside it, then rename and delete the form.
// Selectors are role/label/placeholder only (resist antd DOM churn — ADR-0008 Risks).

test("create a project and a form, and it survives a reload", async ({ page, request }) => {
  await registerAndSignIn(page, request);

  await createProject(page, `E2E Project ${Date.now()}`);
  // A fresh project's Explorer shows the empty-state hint.
  await expect(page.getByText("Empty project — create a folder or a form.")).toBeVisible();

  const formTitle = `E2E Form ${Date.now()}`;
  await createForm(page, formTitle);
  // The new form shows in the Explorer tree...
  await expect(page.getByRole("tree").getByText(formTitle)).toBeVisible();

  // ...and it was persisted server-side: a full reload re-loads the tree from the API.
  await page.reload();
  await expect(page.getByRole("tree").getByText(formTitle)).toBeVisible();
});

test("rename and delete a form from the Explorer", async ({ page, request }) => {
  await registerAndSignIn(page, request);
  await createProject(page, `E2E Project ${Date.now()}`);
  const original = `E2E Form ${Date.now()}`;
  await createForm(page, original);

  const tree = page.getByRole("tree");

  // Rename (U) via the right-click context menu → inline edit (a loadForm → saveForm round-trip).
  await tree.getByText(original).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const renamed = `${original} renamed`;
  const renameInput = page.getByPlaceholder("Form title");
  await renameInput.fill(renamed);
  await renameInput.press("Enter");
  await expect(tree.getByText(renamed)).toBeVisible();

  // Delete (D) via the context menu → confirm modal.
  await tree.getByText(renamed).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(tree.getByText(renamed)).toHaveCount(0);
});
