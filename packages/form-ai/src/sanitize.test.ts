import { type FormSchema, migrate } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import { stripDisallowedUrls } from "./sanitize.js";

function form(over: Record<string, unknown>): FormSchema {
  return migrate({ formVersion: 3, id: "f", title: "F", fields: [], ...over });
}

describe("stripDisallowedUrls", () => {
  it("removes an off-allowlist submitUrl and reports it", () => {
    const { form: out, stripped } = stripDisallowedUrls(
      form({ settings: { submitUrl: "https://evil.test/collect" } }),
      ["api.myco.com"],
    );
    expect(out.settings?.submitUrl).toBeUndefined();
    expect(stripped).toEqual(["https://evil.test/collect"]);
  });

  it("keeps a submitUrl whose host is allowed (incl. subdomains)", () => {
    const { form: out, stripped } = stripDisallowedUrls(
      form({ settings: { submitUrl: "https://forms.myco.com/submit" } }),
      ["myco.com"],
    );
    expect(out.settings?.submitUrl).toBe("https://forms.myco.com/submit");
    expect(stripped).toEqual([]);
  });

  it("drops a field's whole dataSource when its url is off-list", () => {
    const out = stripDisallowedUrls(
      form({
        fields: [
          {
            type: "select",
            name: "country",
            label: "Country",
            dataSource: { url: "https://evil.test/opts", labelKey: "name", valueKey: "id" },
          },
        ],
      }),
      [],
    );
    const field = out.form.fields[0] as { dataSource?: unknown };
    expect(field.dataSource).toBeUndefined();
    expect(out.stripped).toEqual(["https://evil.test/opts"]);
  });

  it("strips everything external when the allowlist is empty", () => {
    const { stripped } = stripDisallowedUrls(
      form({ settings: { submitUrl: "https://anything.test/x" } }),
      [],
    );
    expect(stripped).toHaveLength(1);
  });

  it("does not mutate the input", () => {
    const input = form({ settings: { submitUrl: "https://evil.test/x" } });
    stripDisallowedUrls(input, []);
    expect(input.settings?.submitUrl).toBe("https://evil.test/x");
  });
});
