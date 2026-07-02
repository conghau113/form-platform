import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { FunctionGuard } from "../../auth/function.guard.js";
import { RbacController } from "./rbac.controller.js";
import { RbacService } from "./rbac.service.js";

/**
 * RBAC module (product-roadmap Phase C). Persists via the global repo interfaces (`RbacRepo`,
 * `TenantRepo`). Registers the global {@link FunctionGuard} here (bound after `JwtAuthGuard` so
 * `req.user` is already populated) — routes opt in via `@RequireFunction`. Imported after
 * `AuthModule` in `AppModule` to keep that guard ordering.
 */
@Module({
  controllers: [RbacController],
  providers: [RbacService, { provide: APP_GUARD, useClass: FunctionGuard }],
})
export class RbacModule {}
