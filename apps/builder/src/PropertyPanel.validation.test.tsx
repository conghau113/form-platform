import type { FieldNode } from "@org/form-schema";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FormProps } from "./engine/tree";
import { PropertyPanel, readSimpleRule } from "./PropertyPanel";

function setup(field: FieldNode, siblingNames: string[] = ["other"]) {
  const onChange = vi.fn();
  render(
    <PropertyPanel
      selected={{ uid: "u1", field }}
      siblingNames={siblingNames}
      fieldNames={siblingNames}
      onChange={onChange}
    />,
  );
  // FieldForm groups sections into a Collapse with only Basic+Properties open by default,
  // so the Validation panel's controls aren't mounted until it's expanded. These tests all
  // exercise validation, so open it up front.
  fireEvent.click(screen.getByText("Validation"));
  // The panel re-emits the WHOLE rebuilt node; tests read the last emitted field.
  const lastField = () => onChange.mock.calls[onChange.mock.calls.length - 1]?.[1] as FieldNode;
  return { onChange, lastField };
}

describe("readSimpleRule", () => {
  it("reads field-vs-field and field-vs-literal comparisons", () => {
    expect(readSimpleRule({ "<=": [{ var: "start" }, { var: "end" }] })).toEqual({
      op: "<=",
      left: "start",
      right: { kind: "field", name: "end" },
    });
    expect(readSimpleRule({ ">": [{ var: "age" }, 18] })).toEqual({
      op: ">",
      left: "age",
      right: { kind: "value", value: "18" },
    });
  });

  it("returns null for anything more complex", () => {
    expect(readSimpleRule({ and: [{ "==": [1, 1] }] })).toBeNull();
    expect(readSimpleRule({ "==": [{ var: "a" }] })).toBeNull();
    expect(readSimpleRule({ "==": [5, { var: "a" }] })).toBeNull();
    expect(readSimpleRule(null)).toBeNull();
  });
});

describe("ValidationEditor severity", () => {
  it("marks a rule as warning (and serializes the default error away)", async () => {
    const user = userEvent.setup();
    const { lastField } = setup({
      type: "text",
      name: "bio",
      label: "Bio",
      validations: [{ type: "min", value: 3 }],
    });

    await user.click(screen.getByText("Error"));
    await user.click(await screen.findByText("Warning"));

    expect(lastField()).toMatchObject({
      validations: [{ type: "min", value: 3, severity: "warning" }],
    });

    // Switching back to Error drops the key entirely (default serializes away).
  });

  it("switching a warning back to error removes the severity key", async () => {
    const user = userEvent.setup();
    const { lastField } = setup({
      type: "text",
      name: "bio",
      label: "Bio",
      validations: [{ type: "min", value: 3, severity: "warning" }],
    });

    await user.click(screen.getByText("Warning", { selector: ".ant-select-selection-item" }));
    await user.click(await screen.findByText("Error"));

    const rule = (lastField() as { validations?: Array<Record<string, unknown>> }).validations?.[0];
    expect(rule).toBeDefined();
    expect("severity" in (rule as object)).toBe(false);
  });
});

describe("ValidationEditor cross rules", () => {
  it("choosing Cross-field seeds a field-vs-first-sibling equality", async () => {
    const user = userEvent.setup();
    const { lastField } = setup(
      {
        type: "text",
        name: "end",
        label: "End",
        validations: [{ type: "required" }],
      },
      ["start"],
    );

    await user.click(screen.getByText("Required", { selector: ".ant-select-selection-item" }));
    await user.click(await screen.findByText("Cross-field (logic)"));

    expect(lastField()).toMatchObject({
      validations: [{ type: "cross", rule: { "==": [{ var: "end" }, { var: "start" }] } }],
    });
  });

  it("edits the operator of a simple cross rule", async () => {
    const user = userEvent.setup();
    const { lastField } = setup(
      {
        type: "text",
        name: "end",
        label: "End",
        validations: [{ type: "cross", rule: { "==": [{ var: "end" }, { var: "start" }] } }],
      },
      ["start"],
    );

    await user.click(screen.getByText("==", { selector: ".ant-select-selection-item" }));
    await user.click(await screen.findByText("<="));

    expect(lastField()).toMatchObject({
      validations: [{ type: "cross", rule: { "<=": [{ var: "end" }, { var: "start" }] } }],
    });
  });

  it("switching the right side to a literal emits an empty literal comparison", async () => {
    const user = userEvent.setup();
    const { lastField } = setup(
      {
        type: "number",
        name: "age",
        label: "Age",
        validations: [{ type: "cross", rule: { ">": [{ var: "age" }, { var: "min" }] } }],
      },
      ["min"],
    );

    await user.click(screen.getByText("Value"));

    expect(lastField()).toMatchObject({
      validations: [{ type: "cross", rule: { ">": [{ var: "age" }, ""] } }],
    });
  });

  it("numeric-looking literals are stored as numbers", () => {
    const { lastField } = setup(
      {
        type: "number",
        name: "age",
        label: "Age",
        validations: [{ type: "cross", rule: { ">": [{ var: "age" }, ""] } }],
      },
      ["min"],
    );

    fireEvent.change(screen.getByPlaceholderText("value"), { target: { value: "18" } });

    expect(lastField()).toMatchObject({
      validations: [{ type: "cross", rule: { ">": [{ var: "age" }, 18] } }],
    });
  });

  it("shows the JSON hint for a complex rule", () => {
    setup({
      type: "text",
      name: "t",
      label: "T",
      validations: [{ type: "cross", rule: { and: [{ "==": [1, 1] }] } }],
    });

    expect(screen.getByText(/edit via the JSON panel/i)).toBeTruthy();
  });
});

describe("ValidationEditor remote check", () => {
  it("writes asyncValidator from the URL input and clears it when emptied", () => {
    const { lastField } = setup({ type: "text", name: "username", label: "Username" });

    fireEvent.change(screen.getByPlaceholderText("/api/check-username"), {
      target: { value: "/api/check" },
    });
    expect(lastField()).toMatchObject({ asyncValidator: { url: "/api/check" } });
  });

  it("drops the whole asyncValidator when the URL is cleared", () => {
    const { lastField } = setup({
      type: "text",
      name: "username",
      label: "Username",
      asyncValidator: { url: "/api/check", message: "Taken" },
    });

    fireEvent.change(screen.getByDisplayValue("/api/check"), { target: { value: "" } });

    const out = lastField() as { asyncValidator?: unknown };
    expect(out.asyncValidator).toBeUndefined();
  });

  it("renders the remote check even for types with no rule kinds (e.g. select)", () => {
    setup({ type: "select", name: "city", label: "City", options: [] });
    expect(screen.getByPlaceholderText("/api/check-username")).toBeTruthy();
  });
});

describe("FormSettingsEditor validateTrigger", () => {
  function setupForm(settings?: FormProps["settings"]) {
    const onChangeForm = vi.fn();
    const form: FormProps = {
      type: "form",
      id: "f",
      title: "F",
      ...(settings ? { settings } : {}),
    };
    render(
      <PropertyPanel
        selected={null}
        form={form}
        siblingNames={[]}
        fieldNames={[]}
        onChange={vi.fn()}
        onChangeForm={onChangeForm}
      />,
    );
    return onChangeForm;
  }

  it("picking a trigger patches settings.validateTrigger", async () => {
    const user = userEvent.setup();
    const onChangeForm = setupForm();

    // Target the validateTrigger select by its placeholder (robust to other selects on the
    // form, e.g. the i18n "Other locales" tags select).
    const triggerSelect = screen.getByText("On submit (default)").closest(".ant-select");
    await user.click(within(triggerSelect as HTMLElement).getByRole("combobox"));
    await user.click(await screen.findByText("On blur"));

    expect(onChangeForm).toHaveBeenCalledWith({ settings: { validateTrigger: "onBlur" } });
  });

  it("clearing the trigger drops the empty settings block", async () => {
    const onChangeForm = setupForm({ validateTrigger: "onBlur" });

    const clear = document.querySelector(".ant-select-clear");
    expect(clear).toBeTruthy();
    fireEvent.mouseDown(clear as Element);

    expect(onChangeForm).toHaveBeenCalledWith({ settings: undefined });
  });
});
