import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { SEED_OWNER_ID } from "../common/constants.js";

/** The slice of the HTTP request we read — avoids a hard dependency on express' types. */
interface RequestWithHeaders {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Minimal owner-aware auth seam (Track W, D3). Resolves the current owner from the
 * `x-owner-id` request header, falling back to {@link SEED_OWNER_ID} when absent so the API
 * works without a login. Real auth (session/JWT, multi-tenant) lands in W5; because every row
 * is scoped to this owner from day one, that swap is non-destructive.
 *
 * Usage: `findAll(@CurrentOwner() ownerId: string)`.
 */
export const CurrentOwner = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<RequestWithHeaders>();
    const header = req.headers["x-owner-id"];
    const value = Array.isArray(header) ? header[0] : header;
    return value?.trim() ? value.trim() : SEED_OWNER_ID;
  },
);
