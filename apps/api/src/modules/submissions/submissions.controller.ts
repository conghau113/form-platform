import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Query,
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
      return await this.submissions.submit(ownerId, formId, { data: dto.data, roles: dto.roles });
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

  /** Load a single submission by id → 404 if missing or not accessible. Optional `?roles=a,b`
   *  declares the reader's domain roles; fields they can't view are masked server-side (FS2). */
  @Get("submissions/:id")
  findOne(
    @CurrentOwner() ownerId: string,
    @Param("id") id: string,
    @Query("roles") roles?: string,
  ): Promise<Submission> {
    return this.submissions.load(ownerId, id, parseRoles(roles));
  }
}

/** Parse a `?roles=a,b,c` query into a clean role list (empty/blank ⇒ undefined). */
function parseRoles(roles: string | undefined): string[] | undefined {
  if (!roles) return undefined;
  const parsed = roles
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  return parsed.length > 0 ? parsed : undefined;
}
