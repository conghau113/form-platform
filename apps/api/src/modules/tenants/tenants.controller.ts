import { Controller, Get } from "@nestjs/common";
import { CurrentOwner } from "../../auth/current-owner.decorator.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { TenantsService, type TenantSummary } from "./tenants.service.js";

@Controller("tenants")
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  /** The caller's tenants + the project role they hold in each (B4 workspace picker). */
  @Get()
  listMine(@CurrentOwner() userId: string): Promise<TenantSummary[]> {
    return this.tenants.listMine(userId);
  }
}
