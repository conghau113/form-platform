import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { BoundedThrottlerStorage } from "./common/throttler-storage.js";
import { validateEnv } from "./config/env.js";
import { AdminCatalogModule } from "./modules/admin-catalog/admin-catalog.module.js";
import { AiModule } from "./modules/ai/ai.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { ExternalModule } from "./modules/external/external.module.js";
import { buildThrottlers } from "./modules/external/external-throttle.js";
import { FoldersModule } from "./modules/folders/folders.module.js";
import { FormsModule } from "./modules/forms/forms.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { NotificationsModule } from "./modules/notifications/notifications.module.js";
import { OrgUnitsModule } from "./modules/org-units/org-units.module.js";
import { PresetsModule } from "./modules/presets/presets.module.js";
import { ProjectsModule } from "./modules/projects/projects.module.js";
import { RbacModule } from "./modules/rbac/rbac.module.js";
import { StatusCatalogModule } from "./modules/status-catalog/status-catalog.module.js";
import { SubmissionsModule } from "./modules/submissions/submissions.module.js";
import { TenantsModule } from "./modules/tenants/tenants.module.js";
import { ThemesModule } from "./modules/themes/themes.module.js";
import { WorkOrdersModule } from "./modules/work-orders/work-orders.module.js";
import { WorkflowsModule } from "./modules/workflows/workflows.module.js";
import { PersistenceModule } from "./persistence/persistence.module.js";

/** Root module — composes the feature modules. New features (e.g. workflow) are added
 *  here as their own `src/modules/<feature>` module rather than registering controllers
 *  and providers flat. `PersistenceModule` is global, so feature services can inject the
 *  repo interfaces without re-importing it.
 *
 *  `ConfigModule` validates the environment (Zod) at boot — fail-fast on a missing required
 *  var. `ThrottlerModule` + the global `ThrottlerGuard` rate-limit every route (window/limits from
 *  env); `/health` opts out via `@SkipThrottle()`. Production-hardening 1D. Since P6 the limits are
 *  no longer one number: `buildThrottlers` keeps the ordinary per-IP budget for everything, and
 *  gives `/external/*` calls that present an API key a budget per *credential* instead — an
 *  integrator's whole organisation shares one egress IP. That policy lives with the surface it
 *  belongs to (`modules/external/external-throttle.ts`), not here. `AuthModule` adds the global
 *  `JwtAuthGuard` (secure-by-default; `@Public` opts out) — 2A. */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      // Per-environment env files (Phase 0): `.env.<NODE_ENV>` overrides the base `.env`, so a
      // single checkout can run dev / test / production against different config. Missing files
      // are ignored; in Docker the values come from the process env (compose), not these files.
      envFilePath: [`.env.${process.env.NODE_ENV ?? "development"}`, ".env"],
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // Our own counter store, not the library's: since the `/external/*` tracker is derived from
        // a header the caller chooses, a store that never forgets a key and expires hits per
        // throttler name instead of per key stops being an implementation detail. See the file.
        storage: new BoundedThrottlerStorage(),
        // No literal fallbacks: `envSchema` already defaults every one of these, so a second copy
        // here would only ever be reached by a *misspelled* key — and would then hide the mistake
        // behind a plausible number instead of letting `buildThrottlers` reject `undefined`.
        throttlers: buildThrottlers({
          ttl: config.getOrThrow<number>("THROTTLE_TTL"),
          ipLimit: config.getOrThrow<number>("THROTTLE_LIMIT"),
          externalIpLimit: config.getOrThrow<number>("EXTERNAL_IP_THROTTLE_LIMIT"),
          externalKeyLimit: config.getOrThrow<number>("EXTERNAL_THROTTLE_LIMIT"),
        }),
      }),
    }),
    PersistenceModule,
    // Order matters: AuthModule's global JwtAuthGuard must run before RbacModule's FunctionGuard
    // (which reads the `req.user` the former populates). Keep AuthModule before RbacModule.
    AuthModule,
    RbacModule,
    HealthModule,
    ProjectsModule,
    TenantsModule,
    OrgUnitsModule,
    FoldersModule,
    FormsModule,
    WorkflowsModule,
    ThemesModule,
    PresetsModule,
    StatusCatalogModule,
    SubmissionsModule,
    AdminCatalogModule,
    WorkOrdersModule,
    NotificationsModule,
    ExternalModule,
    AiModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
