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

describe("FormRenderer Phase L field types", () => {
  it("renders a checkbox-group from static options and submits the checked values", async () => {
    const onSubmit = vi.fn();
    render(
      <FormRenderer
        onSubmit={onSubmit}
        schema={form([
          {
            type: "checkbox-group",
            name: "perks",
            label: "Perks",
            options: [
              { label: "Lunch", value: "lunch" },
              { label: "Gym", value: "gym" },
            ],
          },
        ])}
      />,
    );
    await userEvent.click(screen.getByText("Lunch"));
    await userEvent.click(screen.getByText("Gym"));
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ perks: ["lunch", "gym"] });
  });

  it("blocks submit when a required checkbox-group is empty", async () => {
    const onSubmit = vi.fn();
    render(
      <FormRenderer
        onSubmit={onSubmit}
        schema={form([
          {
            type: "checkbox-group",
            name: "perks",
            label: "Perks",
            required: true,
            options: [{ label: "Gym", value: "gym" }],
          },
        ])}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(screen.getByText("Perks is required")).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders a checkbox-group from a remote dataSource", async () => {
    const fetchMock = vi.fn().mockReturnValue(
      jsonResponse([
        { name: "Hanoi", id: "hn" },
        { name: "Saigon", id: "sg" },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      render(
        <FormRenderer
          schema={form([
            {
              type: "checkbox-group",
              name: "cities",
              label: "Cities",
              dataSource: { url: "https://api.test/cities", labelKey: "name", valueKey: "id" },
            },
          ])}
        />,
      );
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("https://api.test/cities"));
      expect(await screen.findByText("Hanoi")).toBeInTheDocument();
      expect(screen.getByText("Saigon")).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("renders a select in tags mode (multi-value, free typing)", () => {
    render(
      <FormRenderer
        schema={form([{ type: "select", name: "labels", label: "Labels", tags: true }])}
        initialValues={{ labels: ["a", "b"] }}
      />,
    );
    // Tags mode renders each value as a removable tag.
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("b")).toBeInTheDocument();
  });

  it("applies step/precision to a number input", () => {
    render(
      <FormRenderer
        schema={form([{ type: "number", name: "qty", label: "Qty", step: 0.5, precision: 2 }])}
        initialValues={{ qty: 1 }}
      />,
    );
    // antd InputNumber formats to the configured precision.
    expect(screen.getByRole("spinbutton")).toHaveValue("1.00");
  });

  it("renders an Upload control and keeps added files local (no auto-upload)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      render(
        <FormRenderer schema={form([{ type: "upload", name: "docs", label: "Documents" }])} />,
      );
      const file = new File(["x"], "report.pdf", { type: "application/pdf" });
      // antd Upload renders a hidden file input.
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await userEvent.upload(input, file);
      expect(await screen.findByText("report.pdf")).toBeInTheDocument();
      // beforeUpload→false: nothing is uploaded to a server.
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("blocks submit when a required date-range is empty", async () => {
    const onSubmit = vi.fn();
    render(
      <FormRenderer
        onSubmit={onSubmit}
        schema={form([{ type: "date-range", name: "stay", label: "Stay", required: true }])}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(screen.getByText("Stay is required")).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders date-range and time-range pickers with start/end inputs", () => {
    render(
      <FormRenderer
        schema={form([
          { type: "date-range", name: "stay", label: "Stay" },
          { type: "time-range", name: "shift", label: "Shift" },
        ])}
      />,
    );
    expect(screen.getByPlaceholderText("Start date")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("End date")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Start time")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("End time")).toBeInTheDocument();
  });

  it("applies the picker variant to date fields", () => {
    render(
      <FormRenderer
        schema={form([{ type: "date", name: "month", label: "Month", picker: "month" }])}
      />,
    );
    expect(screen.getByPlaceholderText("Select month")).toBeInTheDocument();
  });

  it("readPretty previews a range as 'start ~ end'", () => {
    // dayjs-like stubs: previewText only needs `.format` (dayjs itself is not a dep here).
    const day = (text: string) => ({ format: () => text });
    render(
      <FormRenderer
        readPretty
        schema={form([{ type: "date-range", name: "stay", label: "Stay" }])}
        initialValues={{ stay: [day("2026-01-01"), day("2026-01-15")] }}
      />,
    );
    expect(screen.getByText("2026-01-01 ~ 2026-01-15")).toBeInTheDocument();
  });

  it("readPretty previews a checkbox-group as option labels", () => {
    render(
      <FormRenderer
        readPretty
        schema={form([
          {
            type: "checkbox-group",
            name: "perks",
            label: "Perks",
            options: [
              { label: "Lunch", value: "lunch" },
              { label: "Gym", value: "gym" },
            ],
          },
        ])}
        initialValues={{ perks: ["lunch", "gym"] }}
      />,
    );
    expect(screen.getByText("Lunch, Gym")).toBeInTheDocument();
  });
});
