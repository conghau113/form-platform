import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";

/**
 * Feature module: the `GET /health` probe. `PrismaService` is exported by the global
 * `PersistenceModule`, so the controller can inject it directly.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
