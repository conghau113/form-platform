import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FormRenderer } from "./FormRenderer.js";

/** A minimal current-version form around the given fields. */
function form(fields: unknown[], extra: Record<string, unknown> = {}) {
  return { formVersion: 3, id: "t", title: "T", fields, ...extra };
}

function jsonResponse(data: unknown, ok = true, status = 200): Promise<Response> {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(data) } as Response);
}

const regionTree = [
  {
    label: "Vietnam",
    value: "vn",
    children: [
      { label: "Ho Chi Minh", value: "hcm" },
      { label: "Hanoi", value: "hn" },
    ],
  },
];

describe("FormRenderer cascader", () => {
  it("selects a path from static tree options and submits it", async () => {
    const onSubmit = vi.fn();
    render(
      <FormRenderer
        onSubmit={onSubmit}
        schema={form([{ type: "cascader", name: "region", label: "Region", options: regionTree }])}
      />,
    );
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByText("Vietnam"));
    await userEvent.click(await screen.findByText("Ho Chi Minh"));
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ region: ["vn", "hcm"] });
  });

  it("blocks submit when a required cascader is empty", async () => {
    const onSubmit = vi.fn();
    render(
      <FormRenderer
        onSubmit={onSubmit}
        schema={form([
          {
            type: "cascader",
            name: "region",
            label: "Region",
            required: true,
            options: regionTree,
          },
        ])}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(screen.getByText("Region is required")).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("loads a remote tree via dataSource childrenKey", async () => {
    const fetchMock = vi
      .fn()
      .mockReturnValue(
        jsonResponse([{ name: "Vietnam", id: "vn", subs: [{ name: "Hanoi", id: "hn" }] }]),
      );
    vi.stubGlobal("fetch", fetchMock);
    try {
      render(
        <FormRenderer
          schema={form([
            {
              type: "cascader",
              name: "region",
              label: "Region",
              dataSource: {
                url: "https://api.test/regions",
                labelKey: "name",
                valueKey: "id",
                childrenKey: "subs",
              },
            },
          ])}
        />,
      );
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("https://api.test/regions"));
      await userEvent.click(screen.getByRole("combobox"));
      await userEvent.click(await screen.findByText("Vietnam"));
      // The child level mapped through childrenKey expands under the parent.
      expect(await screen.findByText("Hanoi")).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("readPretty previews the path as labels joined by ' / '", () => {
    render(
      <FormRenderer
        readPretty
        schema={form([{ type: "cascader", name: "region", label: "Region", options: regionTree }])}
        initialValues={{ region: ["vn", "hcm"] }}
      />,
    );
    expect(screen.getByText("Vietnam / Ho Chi Minh")).toBeInTheDocument();
  });
});

describe("FormRenderer tree-select", () => {
  it("selects a node from the tree and submits its value", async () => {
    const onSubmit = vi.fn();
    render(
      <FormRenderer
        onSubmit={onSubmit}
        schema={form([{ type: "tree-select", name: "dept", label: "Dept", options: regionTree }])}
      />,
    );
    await userEvent.click(screen.getByRole("combobox"));
    // The fieldNames mapping makes the contract's `label` the displayed text.
    await userEvent.click(await screen.findByText("Vietnam"));
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ dept: "vn" });
  });

  it("blocks submit when a required multiple tree-select is empty", async () => {
    const onSubmit = vi.fn();
    render(
      <FormRenderer
        onSubmit={onSubmit}
        schema={form([
          {
            type: "tree-select",
            name: "dept",
            label: "Dept",
            required: true,
            multiple: true,
            options: regionTree,
          },
        ])}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(screen.getByText("Dept is required")).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("readPretty previews values as labels found anywhere in the tree", () => {
    render(
      <FormRenderer
        readPretty
        schema={form([
          { type: "tree-select", name: "dept", label: "Dept", multiple: true, options: regionTree },
        ])}
        initialValues={{ dept: ["hcm", "hn"] }}
      />,
    );
    expect(screen.getByText("Ho Chi Minh, Hanoi")).toBeInTheDocument();
  });
});
