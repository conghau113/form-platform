import { CURRENT_FORM_VERSION } from "@org/form-schema";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormRenderer } from "./FormRenderer.js";

// A minimal fetch Response stub good enough for the renderer (ok/status/json).
function jsonResponse(data: unknown, ok = true, status = 200): Promise<Response> {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(data) } as Response);
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const base = { formVersion: CURRENT_FORM_VERSION, id: "f", title: "Test" };

// Beta deliberately carries NO address: picking it must CLEAR a previously filled address.
const customers = [
  { code: "C1", name: "Alpha Ltd", taxCode: "0101", address: "1 Main St" },
  { code: "C2", name: "Beta Co", taxCode: "0202" },
];

const lookupField = {
  type: "lookup",
  name: "customer",
  label: "Customer",
  dataSource: { url: "https://api.test/customers", labelKey: "name", valueKey: "code" },
  mapping: [
    { from: "taxCode", to: "taxCode" },
    { from: "address", to: "address" },
  ],
};

const schema = {
  ...base,
  fields: [
    lookupField,
    { type: "text", name: "taxCode", label: "Tax code" },
    { type: "text", name: "address", label: "Address" },
  ],
};

/** Open the picker modal and wait for its rows. */
async function openPicker() {
  await userEvent.click(screen.getByRole("button", { name: /select/i }));
  return await screen.findByRole("dialog");
}

describe("FormRenderer lookup (web)", () => {
  it("does not fetch until the picker is opened, then fills SEVERAL fields on Apply", async () => {
    fetchMock.mockReturnValue(jsonResponse(customers));

    render(<FormRenderer schema={schema} />);

    // Lazy: no request on mount.
    expect(fetchMock).not.toHaveBeenCalled();

    const dialog = await openPicker();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("https://api.test/customers"));
    await within(dialog).findByText("Alpha Ltd");

    await userEvent.click(within(dialog).getByText("Alpha Ltd"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply" }));

    // One pick wrote three fields: the lookup itself + both mapped targets.
    await waitFor(() =>
      expect(screen.getByLabelText("Customer", { selector: "input" })).toHaveValue("Alpha Ltd"),
    );
    expect(screen.getByLabelText("Tax code")).toHaveValue("0101");
    expect(screen.getByLabelText("Address")).toHaveValue("1 Main St");
  });

  it("CLEARS a mapped field when the newly picked record lacks that key", async () => {
    fetchMock.mockReturnValue(jsonResponse(customers));

    render(<FormRenderer schema={schema} />);

    const first = await openPicker();
    await within(first).findByText("Alpha Ltd");
    await userEvent.click(within(first).getByText("Alpha Ltd"));
    await userEvent.click(within(first).getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(screen.getByLabelText("Address")).toHaveValue("1 Main St"));

    const second = await openPicker();
    await within(second).findByText("Beta Co");
    await userEvent.click(within(second).getByText("Beta Co"));
    await userEvent.click(within(second).getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(screen.getByLabelText("Tax code")).toHaveValue("0202"));
    // Alpha's address must not survive the switch — the mapping owns its targets.
    expect(screen.getByLabelText("Address")).toHaveValue("");
  });

  it("filters the picker rows client-side, with no extra request", async () => {
    fetchMock.mockReturnValue(jsonResponse(customers));

    render(<FormRenderer schema={schema} />);

    const dialog = await openPicker();
    await within(dialog).findByText("Alpha Ltd");

    await userEvent.type(within(dialog).getByPlaceholderText("Search"), "beta");

    await waitFor(() => expect(within(dialog).queryByText("Alpha Ltd")).not.toBeInTheDocument());
    expect(within(dialog).getByText("Beta Co")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the injected fetcher instead of the global fetch", async () => {
    const fetcher = vi.fn().mockReturnValue(jsonResponse(customers));

    render(<FormRenderer schema={schema} fetcher={fetcher as unknown as typeof fetch} />);
    await openPicker();

    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("https://api.test/customers"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("waits for its dependency field before fetching records", async () => {
    fetchMock.mockReturnValue(jsonResponse(customers));
    const dependent = {
      ...base,
      fields: [
        { type: "text", name: "region", label: "Region" },
        {
          ...lookupField,
          dataSource: { ...lookupField.dataSource, dependsOn: "region" },
        },
      ],
    };

    render(<FormRenderer schema={dependent} />);

    const dialog = await openPicker();
    expect(await within(dialog).findByText("Select region first")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await userEvent.type(screen.getByLabelText("Region"), "north");
    await openPicker();

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("https://api.test/customers?region=north"),
    );
  });

  it("writes into the SAME ROW when the lookup lives inside an array", async () => {
    fetchMock.mockReturnValue(jsonResponse(customers));
    const inArray = {
      ...base,
      fields: [
        {
          type: "array",
          name: "lines",
          label: "Lines",
          itemFields: [lookupField, { type: "text", name: "taxCode", label: "Tax code" }],
        },
      ],
    };

    render(<FormRenderer schema={inArray} />);

    // Two rows, so a wrong write (bare name / row 0) would be visible.
    const add = screen.getByRole("button", { name: /add/i });
    await userEvent.click(add);
    await userEvent.click(add);

    const rows = screen.getAllByLabelText("Customer", { selector: "input" });
    expect(rows).toHaveLength(2);

    await userEvent.click(screen.getAllByRole("button", { name: /select/i })[1]);
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Alpha Ltd");
    await userEvent.click(within(dialog).getByText("Alpha Ltd"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply" }));

    const taxCodes = await screen.findAllByLabelText("Tax code");
    await waitFor(() => expect(taxCodes[1]).toHaveValue("0101"));
    expect(taxCodes[0]).toHaveValue("");
  });

  it("renders an unconfigured lookup (freshly dropped) without crashing", () => {
    render(
      <FormRenderer
        schema={{ ...base, fields: [{ type: "lookup", name: "lookup1", label: "Lookup" }] }}
      />,
    );

    expect(screen.getByRole("button", { name: /select/i })).toBeDisabled();
    expect(screen.getByText("No data source configured")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders read-only through the preview text", () => {
    render(
      <FormRenderer
        schema={{ ...base, fields: [{ ...lookupField, readPretty: true }] }}
        initialValues={{ customer: "C1" }}
      />,
    );

    expect(screen.getByText("C1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /select/i })).not.toBeInTheDocument();
  });
});
