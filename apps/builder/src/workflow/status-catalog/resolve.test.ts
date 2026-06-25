import type { StatusCatalogEntry } from "@org/workflow-schema";
import { describe, expect, it } from "vitest";
import { indexStatusCatalog, KIND_COLOR, resolveStatusStyle } from "./resolve.js";

const catalog: StatusCatalogEntry[] = [
  { code: "pending", label: "Chờ duyệt", kind: "start", color: "#fa8c16" },
  { code: "done", label: "Hoàn tất", kind: "end" }, // no custom colour
];
const byCode = indexStatusCatalog(catalog);

describe("resolveStatusStyle", () => {
  it("uses the catalog entry's label, custom colour, and kind when statusCode resolves", () => {
    const r = resolveStatusStyle({ status: "old label", statusCode: "pending" }, byCode);
    expect(r.label).toBe("Chờ duyệt");
    expect(r.color).toBe("#fa8c16");
    expect(r.kind).toBe("start");
    expect(r.missing).toBe(false);
  });

  it("falls back to the kind default colour when the entry has no custom colour", () => {
    const r = resolveStatusStyle({ status: "x", statusCode: "done" }, byCode);
    expect(r.color).toBe(KIND_COLOR.end);
    expect(r.kind).toBe("end");
  });

  it("falls back to the node snapshot when statusCode is absent", () => {
    const r = resolveStatusStyle({ status: "Đang xử lý", kind: "normal" }, byCode);
    expect(r.label).toBe("Đang xử lý");
    expect(r.color).toBe(KIND_COLOR.normal);
    expect(r.missing).toBe(false);
  });

  it("flags missing + keeps the snapshot when statusCode references a deleted entry", () => {
    const r = resolveStatusStyle(
      { status: "Frozen label", kind: "end", statusCode: "gone" },
      byCode,
    );
    expect(r.missing).toBe(true);
    expect(r.label).toBe("Frozen label"); // snapshot survives
    expect(r.color).toBe(KIND_COLOR.end); // snapshot kind drives colour
  });

  it("defaults kind to 'normal' when neither catalog nor node carry one", () => {
    const r = resolveStatusStyle({ status: "bare" }, byCode);
    expect(r.kind).toBe("normal");
    expect(r.color).toBe(KIND_COLOR.normal);
  });
});
