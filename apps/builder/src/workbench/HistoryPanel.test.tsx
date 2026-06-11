import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HistoryEntry } from "../history";
import { HistoryPanel } from "./HistoryPanel";

const entries: HistoryEntry<number>[] = [
  { value: 0, label: "Initial" },
  { value: 1, label: "Drop field" },
  { value: 2 },
];

describe("HistoryPanel", () => {
  it("shows an empty state until there is something to undo", () => {
    render(<HistoryPanel entries={[{ value: 0 }]} index={0} onJump={vi.fn()} />);
    expect(screen.getByText("No history yet")).toBeTruthy();
  });

  it("lists every step with its label, falling back to 'Edit'", () => {
    render(<HistoryPanel entries={entries} index={2} onJump={vi.fn()} />);
    expect(screen.getByText("Initial")).toBeTruthy();
    expect(screen.getByText("Drop field")).toBeTruthy();
    expect(screen.getByText("Edit")).toBeTruthy();
  });

  it("jumps to the clicked step", () => {
    const onJump = vi.fn();
    render(<HistoryPanel entries={entries} index={2} onJump={onJump} />);
    fireEvent.click(screen.getByText("Drop field"));
    expect(onJump).toHaveBeenCalledWith(1);
  });
});
