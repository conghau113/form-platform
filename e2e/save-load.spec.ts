import { expect, test } from "@playwright/test";
import { createForm, createProject, registerAndSignIn } from "./helpers";

// Critical-path flow — editor save/load (ADR-0008 Option C, framework E7 T7.2.1). Make an edit in
// the JSON view, Save it, reload the page, and confirm the edit was persisted (loaded back from the
// server). Uses the JSON view rather than the churn-prone drag-drop canvas, per the ADR.

test("an edit made in the editor is saved and survives a reload", async ({ page, request }) => {
  await registerAndSignIn(page, request);
  await createProject(page, `E2E Project ${Date.now()}`);
  const formTitle = `E2E Form ${Date.now()}`;
  await createForm(page, formTitle);

  // Switch to the JSON view. The editor briefly shows a default form before its async load of the
  // freshly-created form resolves — wait until the JSON reflects OUR form before editing it.
  // antd's Segmented hides the underlying radio <input>, so click the visible option label.
  await page.getByText("JSON", { exact: true }).click();
  const editor = page.getByLabel("Form schema JSON");
  await expect(editor).toHaveValue(new RegExp(formTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  // Rename the form's title in the contract.
  const schema = JSON.parse(await editor.inputValue()) as Record<string, unknown>;
  const savedTitle = `Saved ${Date.now()}`;
  schema.title = savedTitle;
  await editor.fill(JSON.stringify(schema, null, 2));
  // JsonEditor debounces validation ~400ms before applying the edit to the document; wait past it
  // so Save serializes the edited contract, not the pre-edit one.
  await page.waitForTimeout(700);

  // Save, and wait for the form POST to land before reloading so we read persisted state.
  const saved = page.waitForResponse(
    (r) => r.request().method() === "POST" && /\/forms(\?|$)/.test(new URL(r.url()).pathname),
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await saved;

  // Reload: the editor re-fetches from the server, and the persisted title shows in the Explorer
  // tree (which reads the stored form title).
  await page.reload();
  await expect(page.getByRole("tree").getByText(savedTitle)).toBeVisible();
});
