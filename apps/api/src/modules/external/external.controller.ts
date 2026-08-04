import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Public } from "../../auth/public.decorator.js";
import { ApiKeyGuard, type ExternalCaller } from "./api-key.guard.js";
import { CurrentCaller } from "./current-caller.decorator.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { FormTemplateQueryDto } from "./dto/form-template.query.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { type ExternalFormTemplate, ExternalService } from "./external.service.js";

/**
 * Machine-to-machine integration surface (EVN §12, D0-a/D1).
 *
 * ⚠️ `@Public()` and `@UseGuards(ApiKeyGuard)` are both bound **here, at the class**, and must stay
 * that way. `@Public()` is required — the global `JwtAuthGuard` 401s any caller without a browser
 * session — and it is what makes `ApiKeyGuard` the sole gate on every route below. Split the two
 * across different levels (class + method) and the next route added inherits the opt-out without
 * inheriting the check. `external.controller.test.ts` asserts both live on the class.
 */
@Public()
@UseGuards(ApiKeyGuard)
@Controller("external")
export class ExternalController {
  constructor(private readonly service: ExternalService) {}

  /** §12.B — the form template behind one of the caller's ticket types. */
  @Get("form-template")
  getFormTemplate(
    @CurrentCaller() caller: ExternalCaller,
    @Query() query: FormTemplateQueryDto,
  ): Promise<ExternalFormTemplate> {
    return this.service.getFormTemplate(caller, query.ticketTypeCode, query.version);
  }
}
