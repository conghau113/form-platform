import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import { Public } from "../../auth/public.decorator.js";
import { ApiKeyGuard, type ExternalCaller } from "./api-key.guard.js";
import type { CheckTransitionResult } from "./check-transition.js";
import { CurrentCaller } from "./current-caller.decorator.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { CheckTransitionDto } from "./dto/check-transition.dto.js";
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
    return this.service.getFormTemplate(
      caller,
      query.ticketTypeCode,
      query.version,
      query.formCode,
    );
  }

  /**
   * §12.C — may this action move this ticket, and where to?
   *
   * `@HttpCode(200)`: `@Post` answers 201 by default, and this creates nothing — it is a question.
   *
   * No `@CurrentCaller()`, unlike the route above, and that is deliberate rather than an omission:
   * the answer is derived from EVN's own transition table, which is the same for every tenant, so
   * taking the caller would imply a scoping that does not exist. `ApiKeyGuard` still authenticates
   * at the class level.
   */
  @Post("check-transition")
  @HttpCode(200)
  checkTransition(@Body() body: CheckTransitionDto): CheckTransitionResult {
    return this.service.checkTransition(body);
  }
}
