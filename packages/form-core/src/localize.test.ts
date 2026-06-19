import type { FormSchema } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import { localizeForm } from "./localize.js";

function form(fields: FormSchema["fields"], extra: Partial<FormSchema> = {}): FormSchema {
  return { formVersion: 3, id: "t", title: "Test", fields, ...extra };
}

describe("localizeForm", () => {
  it("overrides a leaf's text attributes for the locale and strips the i18n map", () => {
    const out = localizeForm(
      form([
        {
          type: "text",
          name: "email",
          label: "Email",
          placeholder: "you@example.com",
          i18n: { label: { vi: "Thư điện tử" }, placeholder: { vi: "ban@vidu.com" } },
        },
      ]),
      "vi",
    );
    const field = out.fields[0] as { label: string; placeholder: string; i18n?: unknown };
    expect(field.label).toBe("Thư điện tử");
    expect(field.placeholder).toBe("ban@vidu.com");
    expect(field.i18n).toBeUndefined(); // resolved away
  });

  it("keeps the authored default when the locale has no translation", () => {
    const out = localizeForm(
      form([{ type: "text", name: "n", label: "Name", i18n: { label: { fr: "Nom" } } }]),
      "vi",
    );
    expect((out.fields[0] as { label: string }).label).toBe("Name");
  });

  it("falls back to fallbackLocale before the authored default", () => {
    const out = localizeForm(
      form([{ type: "text", name: "n", label: "Name", i18n: { label: { en: "Name (en)" } } }]),
      "vi",
      "en",
    );
    expect((out.fields[0] as { label: string }).label).toBe("Name (en)");
  });

  it("localizes static option labels", () => {
    const out = localizeForm(
      form([
        {
          type: "radio",
          name: "gender",
          label: "Gender",
          options: [
            { label: "Male", value: "m", i18n: { vi: "Nam" } },
            { label: "Female", value: "f", i18n: { vi: "Nữ" } },
          ],
        },
      ]),
      "vi",
    );
    const opts = (out.fields[0] as { options: Array<{ label: string; i18n?: unknown }> }).options;
    expect(opts.map((o) => o.label)).toEqual(["Nam", "Nữ"]);
    expect(opts[0].i18n).toBeUndefined();
  });

  it("descends nested containers and array item fields, and localizes the form title", () => {
    const out = localizeForm(
      form(
        [
          {
            type: "card",
            title: "Details",
            i18n: { title: { vi: "Chi tiết" } },
            children: [
              { type: "text", name: "a", label: "A", i18n: { label: { vi: "Ạ" } } },
              {
                type: "array",
                name: "rows",
                label: "Rows",
                itemFields: [
                  { type: "text", name: "b", label: "B", i18n: { label: { vi: "Bê" } } },
                ],
              },
            ],
          },
        ],
        { i18n: { title: { vi: "Khảo sát" } } },
      ),
      "vi",
    );
    expect(out.title).toBe("Khảo sát");
    const card = out.fields[0] as { title: string; children: Array<Record<string, unknown>> };
    expect(card.title).toBe("Chi tiết");
    expect(card.children[0].label).toBe("Ạ");
    const arr = card.children[1] as { itemFields: Array<{ label: string }> };
    expect(arr.itemFields[0].label).toBe("Bê");
  });

  it("round-trips a form with no i18n unchanged", () => {
    const input = form([{ type: "text", name: "n", label: "N" }]);
    const out = localizeForm(input, "vi");
    expect(out).toEqual(input);
    expect(out).not.toBe(input); // a clone, not the same reference
  });
});
