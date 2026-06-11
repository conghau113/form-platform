import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JsonEditor } from "./JsonEditor";

const schema = {
  formVersion: 3,
  id: "t",
  title: "T",
  fields: [{ type: "text", name: "a", label: "A" }],
};
const json = JSON.stringify(schema, null, 2);

function editor() {
  const onApply = vi.fn();
  render(<JsonEditor json={json} onApply={onApply} />);
  const textarea = screen.getByLabelText("Form schema JSON") as HTMLTextAreaElement;
  return { onApply, textarea };
}

/** Type a draft and let the debounce window elapse. */
function typeAndSettle(textarea: HTMLTextAreaElement, value: string) {
  fireEvent.change(textarea, { target: { value } });
  act(() => vi.advanceTimersByTime(500));
}

describe("JsonEditor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies a valid edit after the debounce", () => {
    const { onApply, textarea } = editor();
    typeAndSettle(textarea, JSON.stringify({ ...schema, title: "Renamed" }, null, 2));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ title: "Renamed" }));
    expect(screen.queryByText(/Schema errors/)).toBeNull();
  });

  it("shows a parse error inline and never applies broken JSON", () => {
    const { onApply, textarea } = editor();
    typeAndSettle(textarea, "{ this is not json");
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText(/Schema errors/)).toBeTruthy();
    // The draft is kept for fixing — no forced revert to the canonical text.
    expect(textarea.value).toBe("{ this is not json");
  });

  it("shows Zod issues with their paths and leaves the tree untouched", () => {
    const { onApply, textarea } = editor();
    typeAndSettle(
      textarea,
      JSON.stringify({ ...schema, fields: [{ type: "bogus", name: "x" }] }, null, 2),
    );
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText(/Schema errors/)).toBeTruthy();
    expect(screen.getByRole("list").textContent).toMatch(/fields/);
  });

  it("reverts to the canonical JSON on demand", () => {
    const { onApply, textarea } = editor();
    typeAndSettle(textarea, "broken{");
    fireEvent.click(screen.getByText("Revert"));
    expect(textarea.value).toBe(json);
    expect(screen.queryByText(/Schema errors/)).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("resyncs an idle editor when the tree changes elsewhere, but keeps a dirty draft", () => {
    const onApply = vi.fn();
    const { rerender } = render(<JsonEditor json={json} onApply={onApply} />);
    const textarea = screen.getByLabelText("Form schema JSON") as HTMLTextAreaElement;

    // Idle (committed) editor follows canvas edits.
    const fromCanvas = JSON.stringify({ ...schema, title: "Canvas edit" }, null, 2);
    rerender(<JsonEditor json={fromCanvas} onApply={onApply} />);
    expect(textarea.value).toBe(fromCanvas);

    // A dirty (invalid, unapplied) draft must never be clobbered.
    fireEvent.change(textarea, { target: { value: "draft{" } });
    rerender(<JsonEditor json={json} onApply={onApply} />);
    expect(textarea.value).toBe("draft{");
  });
});
