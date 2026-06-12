import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FormRenderer } from "./FormRenderer.js";

const base = { formVersion: 3, id: "f", title: "Reactions" };
const eq = (path: string, val: unknown) => ({ rule: { "==": [{ var: path }, val] } });

describe("FormRenderer reactions (web)", () => {
  it("shows a field when the source matches (reaction overrides visibleWhen:false)", async () => {
    const user = userEvent.setup();
    const schema = {
      ...base,
      fields: [
        {
          type: "text",
          name: "kind",
          label: "Kind",
          reactions: [{ when: eq("kind", "show"), target: "secret", effect: "visible" }],
        },
        // statically hidden; only the reaction can reveal it
        { type: "text", name: "secret", label: "Secret", visibleWhen: { rule: { "==": [1, 0] } } },
      ],
    };
    render(<FormRenderer schema={schema} />);

    expect(screen.queryByLabelText("Secret")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Kind"), "show");
    expect(await screen.findByLabelText("Secret")).toBeInTheDocument();
  });

  it("a reaction-hidden required field doesn't block submit and is stripped", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const schema = {
      ...base,
      fields: [
        {
          type: "text",
          name: "kind",
          label: "Kind",
          reactions: [
            { when: eq("kind", "person"), target: "vat", effect: "visible", value: false },
          ],
        },
        { type: "text", name: "vat", label: "VAT", required: true },
      ],
    };
    render(<FormRenderer schema={schema} initialValues={{ kind: "person" }} onSubmit={onSubmit} />);

    // vat is hidden by the reaction, so its `required` must not block submit.
    expect(screen.queryByLabelText("VAT")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ kind: "person" });
  });

  it("disables a field while the source matches", async () => {
    const user = userEvent.setup();
    const schema = {
      ...base,
      fields: [
        {
          type: "text",
          name: "toggle",
          label: "Toggle",
          reactions: [{ when: eq("toggle", "off"), target: "a", effect: "disabled" }],
        },
        { type: "text", name: "a", label: "A" },
      ],
    };
    render(<FormRenderer schema={schema} />);

    expect(screen.getByLabelText("A")).not.toBeDisabled();
    await user.type(screen.getByLabelText("Toggle"), "off");
    await waitFor(() => expect(screen.getByLabelText("A")).toBeDisabled());
  });

  it("re-enables a statically disabled field via a disabled:false reaction", async () => {
    const user = userEvent.setup();
    const schema = {
      ...base,
      fields: [
        {
          type: "text",
          name: "toggle",
          label: "Toggle",
          reactions: [{ when: eq("toggle", "on"), target: "b", effect: "disabled", value: false }],
        },
        { type: "text", name: "b", label: "B", disabled: true },
      ],
    };
    render(<FormRenderer schema={schema} />);

    expect(screen.getByLabelText("B")).toBeDisabled();
    await user.type(screen.getByLabelText("Toggle"), "on");
    await waitFor(() => expect(screen.getByLabelText("B")).not.toBeDisabled());
  });

  it("sets a value via a reaction without looping", async () => {
    const user = userEvent.setup();
    const schema = {
      ...base,
      fields: [
        {
          type: "text",
          name: "src",
          label: "Src",
          reactions: [{ when: eq("src", "fill"), target: "dst", effect: "value", value: "AUTO" }],
        },
        { type: "text", name: "dst", label: "Dst" },
      ],
    };
    render(<FormRenderer schema={schema} />);

    const dst = screen.getByLabelText("Dst") as HTMLInputElement;
    expect(dst.value).toBe("");
    await user.type(screen.getByLabelText("Src"), "fill");
    await waitFor(() =>
      expect((screen.getByLabelText("Dst") as HTMLInputElement).value).toBe("AUTO"),
    );
  });

  it("swaps a select's options via an options reaction", async () => {
    const user = userEvent.setup();
    const schema = {
      ...base,
      fields: [
        {
          type: "text",
          name: "mode",
          label: "Mode",
          reactions: [
            {
              when: eq("mode", "b"),
              target: "pick",
              effect: "options",
              value: [{ label: "Beta", value: "beta" }],
            },
          ],
        },
        {
          type: "select",
          name: "pick",
          label: "Pick",
          options: [{ label: "Alpha", value: "alpha" }],
        },
      ],
    };
    render(<FormRenderer schema={schema} />);

    // Static option before the reaction fires.
    await user.click(screen.getByRole("combobox"));
    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.type(screen.getByLabelText("Mode"), "b");
    await user.click(screen.getByRole("combobox"));
    expect(await screen.findByText("Beta")).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });
});
