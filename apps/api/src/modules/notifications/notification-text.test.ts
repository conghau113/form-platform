import { describe, expect, it } from "vitest";
import { caseLink, caseNotificationText } from "./notification-text.js";

describe("caseNotificationText", () => {
  it("names the case in the title and the state in the body", () => {
    expect(
      caseNotificationText("case.assigned", { label: "Đơn A", statusLabel: "review" }),
    ).toEqual({ title: "Bạn được giao việc: Đơn A", body: "Trạng thái: review" });
    expect(caseNotificationText("case.advanced", { label: "Đơn A", statusLabel: "done" })).toEqual({
      title: "Việc đã chuyển bước: Đơn A",
      body: "Trạng thái mới: done",
    });
  });

  it("says a comment arrived without quoting it", () => {
    const { title, body } = caseNotificationText("case.commented", {
      label: "Đơn A",
      statusLabel: "review",
    });
    expect(title).toBe("Bình luận mới trong việc: Đơn A");
    expect(body).toBeNull();
  });

  it("carries the role someone was cast into", () => {
    expect(
      caseNotificationText("case.participant-added", {
        label: "Đơn A",
        statusLabel: null,
        roleCode: " hr ",
      }),
    ).toEqual({ title: "Bạn được cử tham gia việc: Đơn A", body: "Vai trò: hr" });
  });

  it("falls back to a placeholder for a case with no label, and omits an empty body", () => {
    expect(caseNotificationText("case.advanced", { label: "   ", statusLabel: "" })).toEqual({
      title: "Việc đã chuyển bước: (chưa có nhãn)",
      body: null,
    });
  });
});

describe("caseLink", () => {
  it("points at the Run route as the SPA declares it, relative to the deployment base", () => {
    expect(caseLink("p1", "wf1", "i1")).toBe("/projects/p1/workflows/wf1/run/i1");
  });
});
