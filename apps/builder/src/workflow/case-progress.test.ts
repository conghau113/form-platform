import { describe, expect, it } from "vitest";
import { progressTag } from "./case-progress";

describe("progressTag", () => {
  it("names a left node Xong and an untouched one Chưa tới", () => {
    expect(progressTag("done", false)).toEqual({ label: "Xong", color: "green" });
    expect(progressTag("pending", false)).toEqual({ label: "Chưa tới" });
  });

  it("names the node the case is on Đang xử lý", () => {
    expect(progressTag("active", false)).toEqual({ label: "Đang xử lý", color: "processing" });
  });

  it("names it Kết thúc instead when that node is terminal", () => {
    // Otherwise the row reads "Đang xử lý" right under the screen's own
    // "Trạng thái kết thúc — không còn hành động" tag.
    expect(progressTag("active", true)).toEqual({ label: "Kết thúc" });
  });

  it("ignores `isTerminal` for rows the case is not standing on", () => {
    expect(progressTag("done", true)).toEqual({ label: "Xong", color: "green" });
    expect(progressTag("pending", true)).toEqual({ label: "Chưa tới" });
  });
});
