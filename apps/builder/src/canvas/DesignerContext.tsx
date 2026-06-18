import { createContext, useContext } from "react";
import type { FieldType } from "../field-registry";
import type { ColKey } from "../PropertyPanel/types";
import type { DragState } from "./useDragon";

/**
 * The designer context — App-provided editor state + handlers (selection, drag engine, node
 * ops) that the canvas and the panels read. Extracted from `DesignCanvas.tsx` (R2) so the
 * context contract lives apart from the (large) canvas component.
 */

/** App-provided designer state + handlers (selection, drag engine, node ops). */
export interface DesignerValue {
  selected: string[];
  drag: DragState | null;
  beginMove: (uids: string[], e: React.PointerEvent, clickUid?: string) => void;
  beginCreate: (
    type: FieldType,
    e: React.PointerEvent,
    opts?: { patch?: Record<string, unknown>; label?: string },
  ) => void;
  copy: (uid: string) => void;
  remove: (uid: string) => void;
  /** Select a single node (Outline tree / breadcrumb); `additive` toggles it in a
   *  multi-selection. */
  select: (uid: string, additive?: boolean) => void;
  /** A press on empty canvas: the host decides (App selects the Form root). */
  clearSelection: () => void;
  /** Replace the selection with exactly these uids (D7 marquee). Empty → clears. */
  setSelected: (uids: string[]) => void;
  /** Drag-resize a leaf's responsive width: write `layout.colSpan[key]` (1..24)
   *  for the active breakpoint. `gesture` ties one continuous drag to a single
   *  undo step (see `useHistory`'s coalesce). */
  resizeColSpan: (uid: string, key: ColKey, span: number, gesture: string) => void;
}

const DesignerContext = createContext<DesignerValue | null>(null);
export const DesignerProvider = DesignerContext.Provider;

export function useDesigner(): DesignerValue {
  const v = useContext(DesignerContext);
  if (!v) throw new Error("useDesigner must be used inside a DesignerProvider");
  return v;
}
