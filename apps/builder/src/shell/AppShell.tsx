import { Outlet } from "react-router-dom";
import { NavRail } from "./NavRail";

/**
 * The unified app shell (Product Roadmap §6.1/§6.7 — one adaptive platform, not two portals). A
 * layout route behind `RequireAuth`: a persistent {@link NavRail} on the left, the routed section in
 * the rest. Design (`/projects`) and Settings render here today; Operate/Admin slot in at Phase C-E.
 */
export function AppShell() {
  return (
    <div style={{ display: "flex", height: "100vh", minHeight: 0 }}>
      <NavRail />
      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <Outlet />
      </div>
    </div>
  );
}
