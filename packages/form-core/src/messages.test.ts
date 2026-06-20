import { describe, expect, it } from "vitest";
import {
  enMessages,
  registerMessages,
  resolveMessages,
  type ValidationMessages,
  viMessages,
} from "./messages.js";

describe("validation message packs", () => {
  it("resolves the en pack by default and for unknown locales (fallback chain)", () => {
    expect(resolveMessages()).toBe(enMessages);
    expect(resolveMessages("xx")).toBe(enMessages);
    expect(resolveMessages("xx", "yy")).toBe(enMessages);
  });

  it("resolves a registered locale, honoring the fallback before en", () => {
    expect(resolveMessages("vi")).toBe(viMessages);
    expect(resolveMessages("xx", "vi")).toBe(viMessages);
  });

  it("keeps en byte-identical to form-core's historical hardcoded strings (parity guard)", () => {
    expect(enMessages.required("Email")).toBe("Email is required");
    expect(enMessages.invalid("Email")).toBe("Email is invalid");
    expect(enMessages.minItems("Tags", 2)).toBe("Tags requires at least 2 item(s)");
    expect(enMessages.maxItems("Tags", 5)).toBe("Tags allows at most 5 item(s)");
    expect(enMessages.maxFiles("Docs", 3)).toBe("Docs allows at most 3 file(s)");
    expect(enMessages.format.phone).toBe("Invalid phone number");
    expect(enMessages.format.integer).toBe("Must be an integer");
    // en carries no errorMap so bare Zod constraints keep their built-in defaults.
    expect(enMessages.errorMap).toBeUndefined();
  });

  it("vi provides translated strings and an errorMap", () => {
    expect(viMessages.required("Email")).toBe("Email là bắt buộc");
    expect(viMessages.format.phone).toBe("Số điện thoại không hợp lệ");
    expect(typeof viMessages.errorMap).toBe("function");
  });

  it("registerMessages adds a custom pack resolvable by locale", () => {
    const fr: ValidationMessages = {
      ...enMessages,
      required: (l) => `${l} est requis`,
    };
    registerMessages("fr", fr);
    expect(resolveMessages("fr")).toBe(fr);
    expect(resolveMessages("fr").required("Nom")).toBe("Nom est requis");
  });
});
