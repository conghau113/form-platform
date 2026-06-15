import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormRenderer } from "./FormRenderer.js";

/** A minimal current-version form around the given fields. */
function form(fields: unknown[]) {
  return { formVersion: 3, id: "t", title: "T", fields };
}

describe("FormRenderer prefix/suffix icons (I1)", () => {
  it("renders a registered icon token in a text input's prefix slot", () => {
    render(
      <FormRenderer
        schema={form([
          { type: "text", name: "q", label: "Search", prefixIcon: "antd:SearchOutlined" },
        ])}
      />,
    );
    // antd renders the glyph as <span role="img" aria-label="search">.
    expect(screen.getByRole("img", { name: "search" })).toBeInTheDocument();
  });

  it("falls back to the text prefix when the icon token is unknown (no crash)", () => {
    render(
      <FormRenderer
        schema={form([
          { type: "text", name: "amt", label: "Amount", prefixIcon: "lucide:dollar", prefix: "$" },
        ])}
      />,
    );
    // unknown token resolves to undefined → the text prefix shows instead.
    expect(screen.getByText("$")).toBeInTheDocument();
  });

  it("lets prefixIcon take precedence over the text prefix when both resolve", () => {
    render(
      <FormRenderer
        schema={form([
          {
            type: "number",
            name: "price",
            label: "Price",
            prefixIcon: "antd:DollarOutlined",
            prefix: "USD",
          },
        ])}
      />,
    );
    expect(screen.getByRole("img", { name: "dollar" })).toBeInTheDocument();
    expect(screen.queryByText("USD")).not.toBeInTheDocument();
  });
});
