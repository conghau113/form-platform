import type { FieldNode, FormSchema } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import { isGeneratedCode, isKnownItemCode } from "./evn-item-codes.check.js";
import { EVN_ITEM_CODES } from "./evn-item-codes.js";
import { type EvnExportResult, toEvnTemplate } from "./evn-template.js";

const META = { formTypeCode: "PCT", formCode: "CPCT", formTypeName: "Công Tác" };

/**
 * Cast rather than parse. Unlike `evn-template.test.ts` these fixtures plant no forbidden key, so
 * the cast buys only brevity — nothing here depends on skipping validation.
 */
function exportOf(fields: unknown[]): EvnExportResult {
  const form = { formVersion: 1, id: "f1", title: "Tạo phiếu", fields } as FormSchema;
  return toEvnTemplate(form, META);
}

function warningsOf(result: EvnExportResult): string[] {
  if (!result.ok) throw new Error(`expected success, got ${JSON.stringify(result.errors)}`);
  return result.warnings;
}

/** The one warning this slice adds, isolated by content — never by array length. */
function catalogWarnings(result: EvnExportResult): string[] {
  return warningsOf(result).filter((w) =>
    w.includes("không có trong danh mục mã đọc được từ bên nhận"),
  );
}

const text = (name: string): FieldNode =>
  ({ type: "text", name, label: name }) as unknown as FieldNode;

describe("EVN item-code catalog (generated data)", () => {
  /** A pin on the committed data, not a comparison against EVN — only the generator reads them. */
  it("holds the measured number of codes, without duplicates", () => {
    expect(EVN_ITEM_CODES).toHaveLength(2142);
    expect(new Set(EVN_ITEM_CODES).size).toBe(2142);
  });

  /**
   * The third source. `initTemplateForm()` loads the shipped templates through the same
   * auto-inserting path, so their codes enter `form_item_codes` by that route — and 1600 of the 1813
   * appear in neither the enum nor the seed routine. Reading only those two flagged 82 of the 151
   * codes in their own `CPCT.json` as unknown.
   */
  it("includes codes that only the shipped templates use", () => {
    for (const code of [
      "PCT_WORK_CONDITION__CONDITION",
      "POWER_RUN_OUT_DEVICE__DEVICE_2",
      "LOCATION_TO_EARTHING__EARTHING_2",
      "PCT_R_CHO_PHEP_SIGN",
    ]) {
      expect(EVN_ITEM_CODES).toContain(code);
    }
  });

  /**
   * The half the enum does not declare. `initFormItemCode()` seeds `${action}_SIGN|_SIGNDATA|
   * _SIGNTIME`, and EVN resolves signature slots by that SUFFIX rather than by enum membership — so
   * dropping this half tells an author who named a signature field correctly that it is unknown.
   */
  it("includes the signature families the seed derives, not just the enum", () => {
    for (const code of [
      "PTT_A_MEMBER_TAKEOVER_SIGN",
      "BBKSHT_A_WORKED_SIGNTIME",
      "PTT_A_MEMBER_TAKEOVER_PTT_R_GSTT_SIGN",
      "DATE_TIME_PCT_A_ALLOW_HOUR",
      "DATE_LCT_A_FINISHED_DAY",
    ]) {
      expect(EVN_ITEM_CODES).toContain(code);
    }
  });

  it("is sorted, so regenerating it never churns the diff", () => {
    expect([...EVN_ITEM_CODES].sort()).toEqual([...EVN_ITEM_CODES]);
  });

  /**
   * The five members whose VALUE disagrees with their own key. `form_items.code` receives the value,
   * so extracting by member name would ship five codes that do not exist and miss five that do.
   * This test is the reason the generator reads `= '...'` rather than the identifier before it.
   */
  it("holds the mismatched members by value, not by member name", () => {
    for (const value of [
      "WORK_PERMIT_PROVIDER",
      "WORK_PERMIT_PROVIDER_ROLE",
      "WORK_PERMIT_PROVIDER_SIGN",
      "FINISH_WORK_ROLE",
      "LCT__NHAN_VIEN_LIST__ATD",
    ]) {
      expect(EVN_ITEM_CODES).toContain(value);
    }
    // Four of the five names, not all five: `FINISH_WORK_COMMAND_ROLE` is independently a REAL code
    // in one shipped template, so its presence says nothing about how the enum was parsed. The
    // remaining four appear in no template, so this still fails the moment someone reads names.
    for (const memberName of [
      "WORK_PERMIT_ALLOWER",
      "WORK_PERMIT_ALLOWER_ROLE",
      "WORK_PERMIT_ALLOWER_SIGN",
      "LCT_NHAN_VIEN_ATD",
    ]) {
      expect(EVN_ITEM_CODES).not.toContain(memberName);
    }
  });

  it("recognises a real code and refuses an authored one", () => {
    expect(isKnownItemCode("ORGANIZATIONCODE")).toBe(true);
    expect(isKnownItemCode("nguoi_nhan_ban_giao")).toBe(false);
    expect(isGeneratedCode("GEN_ROOT_CARD_0")).toBe(true);
    expect(isGeneratedCode("ORGANIZATIONCODE")).toBe(false);
  });
});

describe("unknown item codes are warned about, never rejected", () => {
  it("still exports, and says how many codes miss the catalog", () => {
    const result = exportOf([
      { type: "card", title: "Thông tin", children: [text("nguoi_nhan"), text("thoi_diem")] },
    ]);

    expect(result.ok).toBe(true);
    const warnings = catalogWarnings(result);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("2/2 mã trường");
    expect(warnings[0]).toContain("nguoi_nhan");
    // The measured truth: their ingest inserts the missing code row itself.
    expect(warnings[0]).toContain("vẫn nạp được");
  });

  it("says nothing when every code is one of theirs", () => {
    const result = exportOf([
      {
        type: "card",
        title: "Thông tin",
        children: [text("ORGANIZATIONCODE"), text("DEPARTMENTCODE")],
      },
    ]);

    expect(catalogWarnings(result)).toHaveLength(0);
  });

  it("names only the first few, then counts the rest", () => {
    const children = ["a1", "a2", "a3", "a4", "a5"].map(text);
    const result = exportOf([{ type: "card", title: "Thông tin", children }]);

    const warning = catalogWarnings(result)[0];
    expect(warning).toContain("5/5 mã trường");
    expect(warning).toContain("a1, a2, a3, … +2");
    expect(warning).not.toContain("a4");
  });

  /**
   * Codes we generate for nameless containers are outside their catalog by design, so counting them
   * would report our own decision back as the author's mistake. The card here has no `name`.
   */
  it("does not count the code of a nameless container", () => {
    const result = exportOf([{ type: "card", title: "Thông tin", children: [text("a1")] }]);

    const warning = catalogWarnings(result)[0];
    // One field, one generated CARD code: the container must be in neither half of the ratio.
    expect(warning).toContain("1/1 mã trường");
  });

  /** The other generator: stray root leaves get wrapped in a `GEN_ROOT_CARD_*` we invented. */
  it("does not count the wrapper generated for stray root fields", () => {
    const result = exportOf([text("a1"), text("a2")]);

    expect(catalogWarnings(result)[0]).toContain("2/2 mã trường");
  });

  /** Row fields sit two levels down, so the walk has to reach them. */
  it("counts fields nested inside an array row", () => {
    const result = exportOf([
      {
        type: "array",
        name: "NHAN_VIEN_LIST",
        label: "Nhân viên",
        itemFields: [text("ho_ten")],
      },
    ]);

    const warning = catalogWarnings(result)[0];
    // `NHAN_VIEN_LIST` is one of theirs, `ho_ten` is not — so exactly one of the two misses.
    expect(warning).toContain("1/2 mã trường");
    expect(warning).toContain("ho_ten");
  });
});
