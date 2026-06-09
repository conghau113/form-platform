import { CURRENT_FORM_VERSION } from "@org/form-schema";
import { render, screen, waitFor } from "@testing-library/react";
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

describe("FormRenderer dataSource (web)", () => {
  it("fetches remote options and maps them via labelKey/valueKey", async () => {
    fetchMock.mockReturnValue(
      jsonResponse([
        { name: "Vietnam", code: "VN" },
        { name: "United States", code: "US" },
      ]),
    );
    const schema = {
      ...base,
      fields: [
        {
          type: "select",
          name: "country",
          label: "Country",
          dataSource: { url: "https://api.test/countries", labelKey: "name", valueKey: "code" },
        },
      ],
    };

    render(<FormRenderer schema={schema} />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("https://api.test/countries"),
    );

    await userEvent.click(screen.getByRole("combobox"));
    expect(await screen.findByText("Vietnam")).toBeInTheDocument();
    expect(screen.getByText("United States")).toBeInTheDocument();
  });

  describe("dependsOn", () => {
    const schema = {
      ...base,
      fields: [
        {
          type: "select",
          name: "country",
          label: "Country",
          options: [
            { label: "Vietnam", value: "VN" },
            { label: "United States", value: "US" },
          ],
        },
        {
          type: "select",
          name: "city",
          label: "City",
          dataSource: {
            url: "https://api.test/cities",
            labelKey: "name",
            valueKey: "id",
            dependsOn: "country",
          },
        },
      ],
    };

    it("does not fetch the dependent select until the parent has a value", () => {
      render(<FormRenderer schema={schema} />);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("fetches with the parent value as a query param named after dependsOn", async () => {
      fetchMock.mockReturnValue(jsonResponse([{ name: "Hanoi", id: 1 }]));
      render(<FormRenderer schema={schema} initialValues={{ country: "VN" }} />);

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith("https://api.test/cities?country=VN"),
      );
    });

    it("refetches with the new value when the parent field changes", async () => {
      fetchMock.mockReturnValue(jsonResponse([{ name: "Hanoi", id: 1 }]));
      render(<FormRenderer schema={schema} initialValues={{ country: "VN" }} />);

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith("https://api.test/cities?country=VN"),
      );

      const [countrySelect] = screen.getAllByRole("combobox");
      await userEvent.click(countrySelect);
      await userEvent.click(await screen.findByText("United States"));

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith("https://api.test/cities?country=US"),
      );
    });
  });

  it("surfaces an error state when the request fails", async () => {
    fetchMock.mockReturnValue(jsonResponse(null, false, 500));
    const schema = {
      ...base,
      fields: [
        {
          type: "select",
          name: "country",
          label: "Country",
          dataSource: { url: "https://api.test/countries", labelKey: "name", valueKey: "code" },
        },
      ],
    };

    render(<FormRenderer schema={schema} />);

    await userEvent.click(screen.getByRole("combobox"));
    expect(await screen.findByText("Request failed (500)")).toBeInTheDocument();
  });
});
