import { expect, test } from "@playwright/test";
import { createForm, createProject, registerAndSignIn } from "./helpers";

// Critical-path flow — submit a form + view the answer (ADR-0008 Option C, framework E7 T7.2.2).
// A fresh form has no fields, so we first give it one text field via the JSON view (the save-load
// spec proves that edit path), then drive the runtime Submissions view: fill + Submit, confirm the
// answer is listed, open its read-only detail, and confirm the submitted value round-trips.

test("submit an answer and view it back in the submission detail", async ({ page, request }) => {
  const { userId } = await registerAndSignIn(page, request);
  await createProject(page, `E2E Project ${Date.now()}`);
  const formTitle = `E2E Form ${Date.now()}`;
  await createForm(page, formTitle);

  // Give the form one text field via the JSON view. Wait until the editor reflects OUR form (it
  // briefly shows a default form before the async load resolves) before editing it.
  await page.getByText("JSON", { exact: true }).click();
  const editor = page.getByLabel("Form schema JSON");
  await expect(editor).toHaveValue(new RegExp(formTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const schema = JSON.parse(await editor.inputValue()) as Record<string, unknown>;
  schema.fields = [{ type: "text", name: "answer", label: "Your answer" }];
  await editor.fill(JSON.stringify(schema, null, 2));
  // JsonEditor debounces validation ~400ms before applying the edit — wait past it so Save persists
  // the field-bearing contract, not the pre-edit one.
  await page.waitForTimeout(700);
  const savedForm = page.waitForResponse(
    (r) => r.request().method() === "POST" && /\/forms(\?|$)/.test(new URL(r.url()).pathname),
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await savedForm;

  // Open the runtime Submissions view via the Explorer context menu (mirrors the CRUD spec's nav).
  await page.getByRole("tree").getByText(formTitle).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Submissions" }).click();
  await expect(page).toHaveURL(/\/submissions$/);

  // Fill the field and submit; wait for the POST so the list refetch reflects the new answer.
  const answer = `answer-${Date.now()}`;
  await page.getByLabel("Your answer").fill(answer);
  const submitted = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      /\/forms\/[^/]+\/submissions$/.test(new URL(r.url()).pathname),
  );
  await page.getByRole("button", { name: "Submit" }).click();
  await submitted;

  // The answer is now listed under "Đã gửi (1)".
  await expect(page.getByText("Đã gửi (1)")).toBeVisible();

  // Open its read-only detail (the row button is labelled with the submitter's id) and confirm the
  // submitted value round-trips from the pinned snapshot.
  await page.getByRole("button").filter({ hasText: userId }).click();
  await expect(page).toHaveURL(/\/submissions\/[^/]+$/);
  await expect(page.getByText(answer)).toBeVisible();
});
