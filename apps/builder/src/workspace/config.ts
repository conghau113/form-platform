import { API_BASE } from "../presets/config";

/**
 * Workspace (Track W) client config. Reuses the shared `@app/api` base URL; adds the single
 * owner seam: every workspace request carries `x-owner-id`. The api defaults a missing header to
 * its own `SEED_OWNER_ID` ("local"), so this constant must match it for the existing editor
 * Save/Load (which send no header) to address the same owner. W5 replaces this with the real
 * authenticated owner — the only place to change.
 */
export { API_BASE };

export const OWNER_ID = "local";

/** Owner header attached to every workspace request (the W5-auth seam). */
export function ownerHeaders(): Record<string, string> {
  return { "x-owner-id": OWNER_ID };
}
