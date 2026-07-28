import { Alert } from "antd";
import { useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../auth";
import { NavRail } from "./NavRail";

/**
 * The unified app shell (Product Roadmap §6.1/§6.7 — one adaptive platform, not two portals). A
 * layout route behind `RequireAuth`: a persistent {@link NavRail} on the left, the routed section in
 * the rest. Design (`/projects`) and Settings render here today; Operate/Admin slot in at Phase C-E.
 * An unverified account gets a dismissible nudge (A2) — verification never blocks any feature.
 */
export function AppShell() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const showVerifyNotice = !!user && !user.emailVerifiedAt && !dismissed;

  return (
    <div style={{ display: "flex", height: "100vh", minHeight: 0 }}>
      <NavRail />
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {showVerifyNotice && (
          <Alert
            type="info"
            banner
            closable
            onClose={() => setDismissed(true)}
            message={
              <>
                Email của bạn chưa được xác minh. <Link to="/settings">Gửi lại email xác minh</Link>
              </>
            }
          />
        )}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
