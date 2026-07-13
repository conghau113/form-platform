import { expect, test } from "@playwright/test";
import { createProject, registerAndSignIn } from "./helpers";

// Critical-path flow — run a workflow to a terminal state (ADR-0008 Option C, framework E7 T7.2.3).
// The workflow EDITOR is a churn-prone drag-drop canvas (ADR-0008 says avoid it), so we API-arrange a
// minimal two-state workflow (draft --submit--> submitted) via the authed session, then drive the real
// Run view: launch a case, fire the one action, and assert the case reaches the terminal state with the
// step recorded in history.

test("start a workflow case and advance it to a terminal state", async ({ page, request }) => {
  await registerAndSignIn(page, request);
  await createProject(page, `E2E Project ${Date.now()}`);
  // createProject lands on /projects/:projectId — capture the id for the workflow placement + run URL.
  const projectId = new URL(page.url()).pathname.split("/").pop() as string;

  // API-arrange a minimal valid workflow in this project. `page.request` shares the browser context's
  // auth cookie (the standalone `request` fixture does not), so this POST runs as the signed-in owner.
  // No roles, guard, or bound form → the single "submit" action is always fireable with empty data.
  const workflowId = `e2e-wf-${Date.now()}`;
  const def = {
    workflowVersion: 1,
    id: workflowId,
    title: `E2E Approval ${Date.now()}`,
    start: "draft",
    nodes: [
      { id: "draft", status: "draft", position: { x: 80, y: 40 } },
      { id: "submitted", status: "submitted", position: { x: 360, y: 40 } },
    ],
    transitions: [{ id: "t-submit", from: "draft", to: "submitted", action: "submit" }],
  };
  const saved = await page.request.post(`/api/workflows?projectId=${projectId}`, { data: def });
  expect(saved.ok(), `save workflow failed: ${saved.status()} ${await saved.text()}`).toBeTruthy();

  // Drive the Run view: launch a fresh case at the start node.
  await page.goto(`/projects/${projectId}/workflows/${workflowId}/run`);
  await page.getByRole("button", { name: "Bắt đầu case mới" }).click();
  await expect(page).toHaveURL(/\/run\/[^/]+$/);

  // From `draft` the one available action is "submit" (the raw action id — no i18n label). Firing it
  // POSTs to /advance and the server-authoritative engine moves the case to `submitted`.
  await page.getByRole("button", { name: "submit", exact: true }).click();

  // `submitted` is terminal (no outgoing transition): the action buttons give way to the terminal
  // marker, and the step is recorded in the history timeline. Both are catalog-independent, so they
  // assert the happy path deterministically without depending on status-catalog labels.
  await expect(page.getByText("Trạng thái kết thúc — không còn hành động")).toBeVisible();
  await expect(page.getByText(/draft\s*→\s*submitted/)).toBeVisible();
});
