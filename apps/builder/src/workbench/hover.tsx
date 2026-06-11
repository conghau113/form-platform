import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

/* ----------------------------------------------------------------------------
 * Shared hover state for the workbench. Lifted out of DesignCanvas so the
 * Outline tree (CompositePanel) and the design canvas highlight the same node
 * both ways. Kept in its OWN provider — not in App state — so moving the
 * pointer only re-renders hover consumers (NodeShells / outline rows), never
 * App and the memoised FormRenderer element.
 * ------------------------------------------------------------------------- */

interface HoverValue {
  hovered: string | null;
  setHovered: (uid: string | null) => void;
}

const HoverContext = createContext<HoverValue>({ hovered: null, setHovered: () => {} });

export function HoverProvider({ children }: { children: ReactNode }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const value = useMemo(() => ({ hovered, setHovered }), [hovered]);
  return <HoverContext.Provider value={value}>{children}</HoverContext.Provider>;
}

export function useHover(): HoverValue {
  return useContext(HoverContext);
}
