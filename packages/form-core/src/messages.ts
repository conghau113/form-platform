import { z } from "zod";

/** The `format` checks form-core compiles a regex for (email/url use Zod's built-ins
 *  and are intentionally absent). Each needs a default failure message. */
export type FormatCheckName =
  | "phone"
  | "integer"
  | "number"
  | "money"
  | "idcard"
  | "zh"
  | "en"
  | "qq"
  | "zip";

/** A locale's pack of the validation messages form-core would otherwise hardcode in English.
 *  The function entries take the field's resolved label (and a bound for the count-based ones);
 *  `format` maps each compiled-regex check to its default message; the optional `errorMap`
 *  localizes Zod's own generic codes (too_small/too_big/invalid_string/invalid_type) for the
 *  bare constraints form-core leaves to Zod's defaults. A pack with no `errorMap` keeps Zod's
 *  built-in English text — which is exactly why {@link enMessages} omits it (EN parity). */
export interface ValidationMessages {
  required(label: string): string;
  invalid(label: string): string;
  minItems(label: string, n: number): string;
  maxItems(label: string, n: number): string;
  maxFiles(label: string, n: number): string;
  format: Record<FormatCheckName, string>;
  errorMap?: z.ZodErrorMap;
}

/** English pack — reproduces form-core's current hardcoded strings VERBATIM and carries no
 *  `errorMap`, so bare Zod constraints keep their exact built-in defaults. This is the parity
 *  baseline: with no locale the renderer resolves to this and behaviour is byte-identical. */
export const enMessages: ValidationMessages = {
  required: (label) => `${label} is required`,
  invalid: (label) => `${label} is invalid`,
  minItems: (label, n) => `${label} requires at least ${n} item(s)`,
  maxItems: (label, n) => `${label} allows at most ${n} item(s)`,
  maxFiles: (label, n) => `${label} allows at most ${n} file(s)`,
  format: {
    phone: "Invalid phone number",
    integer: "Must be an integer",
    number: "Must be a number",
    money: "Invalid amount",
    idcard: "Invalid ID card number",
    zh: "Chinese characters only",
    en: "Letters only",
    qq: "Invalid QQ number",
    zip: "Invalid postal code",
  },
};

/** Localizes Zod's generic codes for the constraints form-core builds without an explicit
 *  message (string/number `.min`/`.max`/`.length`, `.email`/`.url`, `.regex`). A *contextual*
 *  errorMap (passed at parse) outranks a schema-bound one, so this deliberately DEFERS
 *  `invalid_type` to `ctx.defaultError` — that keeps the explicit `required_error`/
 *  `invalid_type_error` messages form-core sets (e.g. the localized "… là bắt buộc"). Explicit
 *  per-check messages (`.min(n, msg)`, `.regex(re, msg)`) already win over any errorMap. */
const viErrorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.too_small:
      if (issue.type === "string") return { message: `Phải có ít nhất ${issue.minimum} ký tự` };
      if (issue.type === "number") return { message: `Phải lớn hơn hoặc bằng ${issue.minimum}` };
      if (issue.type === "array") return { message: `Cần ít nhất ${issue.minimum} mục` };
      break;
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === "email") return { message: "Email không hợp lệ" };
      if (issue.validation === "url") return { message: "URL không hợp lệ" };
      return { message: "Giá trị không hợp lệ" };
    case z.ZodIssueCode.too_big:
      if (issue.type === "string") return { message: `Tối đa ${issue.maximum} ký tự` };
      if (issue.type === "number") return { message: `Phải nhỏ hơn hoặc bằng ${issue.maximum}` };
      if (issue.type === "array") return { message: `Tối đa ${issue.maximum} mục` };
      break;
  }
  return { message: ctx.defaultError };
};

/** Vietnamese pack. */
export const viMessages: ValidationMessages = {
  required: (label) => `${label} là bắt buộc`,
  invalid: (label) => `${label} không hợp lệ`,
  minItems: (label, n) => `${label} cần ít nhất ${n} mục`,
  maxItems: (label, n) => `${label} cho phép tối đa ${n} mục`,
  maxFiles: (label, n) => `${label} cho phép tối đa ${n} tệp`,
  format: {
    phone: "Số điện thoại không hợp lệ",
    integer: "Phải là số nguyên",
    number: "Phải là số",
    money: "Số tiền không hợp lệ",
    idcard: "Số CMND/CCCD không hợp lệ",
    zh: "Chỉ chấp nhận ký tự Trung",
    en: "Chỉ chấp nhận chữ cái",
    qq: "Số QQ không hợp lệ",
    zip: "Mã bưu chính không hợp lệ",
  },
  errorMap: viErrorMap,
};

const registry = new Map<string, ValidationMessages>([
  ["en", enMessages],
  ["vi", viMessages],
]);

/** Register (or override) a locale's validation message pack — the seam for a host to add
 *  languages form-core doesn't ship. */
export function registerMessages(locale: string, messages: ValidationMessages): void {
  registry.set(locale, messages);
}

/** Resolve the message pack for a locale: exact `locale` → `fallbackLocale` → `en`. Built-in
 *  `en`/`vi` are seeded; anything else must have been `registerMessages`-ed. */
export function resolveMessages(locale?: string, fallbackLocale?: string): ValidationMessages {
  if (locale && registry.has(locale)) return registry.get(locale) as ValidationMessages;
  if (fallbackLocale && registry.has(fallbackLocale))
    return registry.get(fallbackLocale) as ValidationMessages;
  return enMessages;
}
