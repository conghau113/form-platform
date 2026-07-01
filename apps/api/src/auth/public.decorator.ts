import { SetMetadata } from "@nestjs/common";

/** Metadata key the {@link JwtAuthGuard} checks to let a route through unauthenticated. */
export const IS_PUBLIC_KEY = "isPublic";

/**
 * Marks a route (or controller) as reachable without a bearer token — the global
 * {@link JwtAuthGuard} skips it. Used for `/health` and the `/auth/register` + `/auth/login`
 * entry points. Everything else requires a valid token by default (secure-by-default).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
