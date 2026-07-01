/**
 * The safe, password-free account view the API returns (mirrors `apps/api` `UserProfile`). `builder`
 * is a separate app, so we restate the shape here rather than import across the app boundary.
 * `createdAt` is an ISO string over the wire (server `Date` → JSON).
 */
export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}
