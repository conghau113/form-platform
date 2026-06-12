import type { AsyncValidator } from "@org/form-schema";
import { describe, expect, it, vi } from "vitest";
import { buildAsyncValidatorUrl, checkAsyncValidator } from "./async-validator.js";

const av: AsyncValidator = { url: "https://api.test/check" };

function fetchJson(data: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(data),
  } as Response);
}

describe("buildAsyncValidatorUrl", () => {
  it("appends value and name params", () => {
    expect(buildAsyncValidatorUrl(av, "username", "ada")).toBe(
      "https://api.test/check?value=ada&name=username",
    );
  });

  it("preserves an existing query string", () => {
    expect(buildAsyncValidatorUrl({ url: "https://api.test/check?kind=u" }, "u", 7)).toBe(
      "https://api.test/check?kind=u&value=7&name=u",
    );
  });

  it("keeps relative urls relative", () => {
    expect(buildAsyncValidatorUrl({ url: "/api/check" }, "email", "a@b.c")).toBe(
      "/api/check?value=a%40b.c&name=email",
    );
  });
});

describe("checkAsyncValidator", () => {
  it("returns invalid with the server message on valid:false", async () => {
    const fetchImpl = fetchJson({ valid: false, message: "Taken" });
    const out = await checkAsyncValidator(av, "username", "ada", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith("https://api.test/check?value=ada&name=username");
    expect(out).toEqual({ valid: false, message: "Taken" });
  });

  it("falls back to the configured message when the server sends none", async () => {
    const out = await checkAsyncValidator(
      { ...av, message: "Already used" },
      "u",
      "x",
      fetchJson({ valid: false }),
    );
    expect(out).toEqual({ valid: false, message: "Already used" });
  });

  it("treats valid:true and malformed bodies as valid", async () => {
    expect((await checkAsyncValidator(av, "u", "x", fetchJson({ valid: true }))).valid).toBe(true);
    expect((await checkAsyncValidator(av, "u", "x", fetchJson({ nonsense: 1 }))).valid).toBe(true);
    expect((await checkAsyncValidator(av, "u", "x", fetchJson(null))).valid).toBe(true);
  });

  it("throws on a non-ok response (caller decides the failure policy)", async () => {
    await expect(checkAsyncValidator(av, "u", "x", fetchJson(null, false, 500))).rejects.toThrow(
      "Request failed (500)",
    );
  });
});
