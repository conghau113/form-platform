import { describe, expect, it } from "vitest";
// Importing the barrel registers the built-in `antd:` namespace (side-effect).
import { type IconComponent, registerIcon, registerIconNamespace, resolveIcon } from "./index.js";

const Dummy: IconComponent = () => null;
const Other: IconComponent = () => null;

describe("icon registry", () => {
  it("resolves a built-in antd token to a component", () => {
    expect(resolveIcon("antd:SearchOutlined")).toBeTypeOf("object");
  });

  it("returns undefined for an empty/nullish token", () => {
    expect(resolveIcon(undefined)).toBeUndefined();
    expect(resolveIcon(null)).toBeUndefined();
    expect(resolveIcon("")).toBeUndefined();
  });

  it("returns undefined for a bare name with no namespace", () => {
    expect(resolveIcon("SearchOutlined")).toBeUndefined();
  });

  it("returns undefined for an unknown namespace or unknown name", () => {
    expect(resolveIcon("lucide:search")).toBeUndefined();
    expect(resolveIcon("antd:DefinitelyNotAnIcon")).toBeUndefined();
  });

  it("resolves an exactly-registered token, overriding the namespace resolver", () => {
    registerIconNamespace("test", () => Other);
    registerIcon("test:special", Dummy);
    expect(resolveIcon("test:special")).toBe(Dummy);
    // a different name in the same namespace still falls through to the resolver
    expect(resolveIcon("test:plain")).toBe(Other);
  });

  it("resolves a whole namespace via a registered resolver", () => {
    const map: Record<string, IconComponent> = { foo: Dummy };
    registerIconNamespace("brand", (name) => map[name]);
    expect(resolveIcon("brand:foo")).toBe(Dummy);
    expect(resolveIcon("brand:missing")).toBeUndefined();
  });

  it("handles names that themselves contain a colon (splits on the first only)", () => {
    registerIconNamespace("ns", (name) => (name === "a:b" ? Dummy : undefined));
    expect(resolveIcon("ns:a:b")).toBe(Dummy);
  });
});
