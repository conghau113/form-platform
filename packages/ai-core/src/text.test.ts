import { describe, expect, it } from "vitest";
import { foldedIncludes, foldForMatch } from "./text.js";

describe("foldForMatch", () => {
  it("strips Vietnamese diacritics", () => {
    expect(foldForMatch("duyệt")).toBe("duyet");
    expect(foldForMatch("Quản lý")).toBe("quanly");
    expect(foldForMatch("Nhân sự")).toBe("nhansu");
    expect(foldForMatch("đơn")).toBe("don");
    expect(foldForMatch("Đã duyệt")).toBe("daduyet");
  });

  it("ignores case and separators", () => {
    expect(foldForMatch("tu_choi")).toBe("tuchoi");
    expect(foldForMatch("tu-choi")).toBe("tuchoi");
    expect(foldForMatch("Từ Chối")).toBe("tuchoi");
    expect(foldForMatch("In progress")).toBe("inprogress");
  });

  it("collapses the same concept across spellings", () => {
    const variants = ["tu_choi", "từ chối", "Tu-Choi", "TỪ CHỐI"];
    const folded = variants.map(foldForMatch);
    expect(new Set(folded).size).toBe(1);
  });
});

describe("foldedIncludes", () => {
  it("matches a romanized needle against a diacritic haystack", () => {
    // The exact failure mode the workflow eval hit: needle authored ascii,
    // model emitted Vietnamese with diacritics.
    expect(foldedIncludes("Quản lý duyệt", "quan ly")).toBe(true);
    expect(foldedIncludes("từ chối", "tu_choi")).toBe(true);
    expect(foldedIncludes("Thanh toán", "thanh_toan")).toBe(true);
    expect(foldedIncludes("Xác nhận", "xac_nhan")).toBe(true);
  });

  it("still rejects genuinely absent concepts", () => {
    expect(foldedIncludes("Approved", "reject")).toBe(false);
    expect(foldedIncludes("Quản lý", "ke toan")).toBe(false);
  });

  it("treats a needle that folds to nothing as no match", () => {
    // A non-latin needle the fold can't romanize must not match everything.
    expect(foldedIncludes("anything", "承認")).toBe(false);
    expect(foldedIncludes("anything", "___")).toBe(false);
  });
});
