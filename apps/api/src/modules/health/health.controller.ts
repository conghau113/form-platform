import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { PrismaService } from "../../persistence/prisma/prisma.service.js";

/**
 * Liveness/readiness probe (production-hardening 1D). Runs a trivial `SELECT 1` so a green
 * response means the process is up AND the database is reachable — what the docker-compose
 * healthcheck and any uptime monitor want. `@SkipThrottle()` keeps frequent probes off the
 * rate limiter. A DB failure throws → non-200, which is the correct "unhealthy" signal.
 */
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @SkipThrottle()
  async check(): Promise<{ status: "ok"; db: "up" }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ok", db: "up" };
  }
}
