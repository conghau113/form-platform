import { Spin } from "antd";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";

/**
 * Route guard (production-hardening 2B). Wraps the app's protected routes: while the session probe
 * is loading it shows a spinner; an anonymous visitor is bounced to `/login` (remembering where
 * they were headed so login can send them back); an authenticated one renders the nested route.
 */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
        <Spin size="large" />
      </div>
    );
  }
  if (status === "anon") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}
