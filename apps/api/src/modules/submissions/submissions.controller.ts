import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
} from "@nestjs/common";
import type { Submission } from "@org/form-schema";
import { CurrentOwner } from "../../auth/current-owner.decorator.js";
import type { SubmissionSummary } from "../../persistence/repositories/submission.repo.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { SubmitDto } from "./dto/submit.dto.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { SubmissionsService } from "./submissions.service.js";

/**
 * Form submission endpoints (FS1). Submissions nest under their form for create/list; a single
 * submission is addressed by its own id under `/submissions` (a separate static prefix so it can't
 * be captured by {@link FormsController}'s `GET /forms/:id`). Server-side validation failures
 * surface as 422 from the service (with the offending field paths).
 */
@Controller()
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  /** Record a submission against a form (server re-validates `data`; invalid → 422). */
  @Post("forms/:formId/submissions")
  async submit(
    @CurrentOwner() ownerId: string,
    @Param("formId") formId: string,
    @Body() dto: SubmitDto,
  ): Promise<Submission> {
    try {
      return await this.submissions.submit(ownerId, formId, { data: dto.data });
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new BadRequestException((err as Error).message);
    }
  }

  /** List a form's submissions (summaries, no body). */
  @Get("forms/:formId/submissions")
  list(
    @CurrentOwner() ownerId: string,
    @Param("formId") formId: string,
  ): Promise<SubmissionSummary[]> {
    return this.submissions.list(ownerId, formId);
  }

  /** Load a single submission by id → 404 if missing or not accessible. Fields the reader can't
   *  view are masked server-side (FS2) against roles the SERVER derives — there is no `?roles=`
   *  any more (Phase E3c), because a reader who could name their own roles unmasked everything. */
  @Get("submissions/:id")
  findOne(@CurrentOwner() ownerId: string, @Param("id") id: string): Promise<Submission> {
    return this.submissions.load(ownerId, id);
  }
}
