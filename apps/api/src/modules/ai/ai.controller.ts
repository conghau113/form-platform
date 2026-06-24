import { Body, Controller, Post } from "@nestjs/common";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import {
  AiService,
  type GenerateFormResponse,
  type GeneratePresetResponse,
  type GenerateWorkflowResponse,
} from "./ai.service.js";
import { type AiCredentials, AiCreds } from "./ai-credentials.decorator.js";
// biome-ignore lint/style/useImportType: DTO class ref is read at runtime (ValidationPipe + emitDecoratorMetadata).
import { GenerateFormDto } from "./dto/generate-form.dto.js";
// biome-ignore lint/style/useImportType: DTO class ref is read at runtime (ValidationPipe + emitDecoratorMetadata).
import { GeneratePresetDto } from "./dto/generate-preset.dto.js";
// biome-ignore lint/style/useImportType: DTO class ref is read at runtime (ValidationPipe + emitDecoratorMetadata).
import { GenerateWorkflowDto, RefineWorkflowDto } from "./dto/generate-workflow.dto.js";
// biome-ignore lint/style/useImportType: DTO class ref is read at runtime (ValidationPipe + emitDecoratorMetadata).
import { RefineFormDto } from "./dto/refine-form.dto.js";

/**
 * Headless AI endpoints. `POST /ai/forms/{generate,refine}` produce a
 * contract-valid form; `POST /ai/workflows/{generate,refine}` produce a
 * contract- AND graph-valid `WorkflowDefinition`; `POST /ai/presets/generate`
 * produces a reusable field preset whose `patch` builds a valid field. All use the
 * caller's BYOK credentials (sent as `x-ai-*` headers) and return the artifact plus
 * metadata; saving is a separate step (`POST /forms`, `POST /workflows`, `POST /presets`).
 */
@Controller("ai")
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post("forms/generate")
  generateForm(
    @AiCreds() creds: AiCredentials,
    @Body() dto: GenerateFormDto,
  ): Promise<GenerateFormResponse> {
    return this.ai.generate(creds, dto);
  }

  @Post("forms/refine")
  refineForm(
    @AiCreds() creds: AiCredentials,
    @Body() dto: RefineFormDto,
  ): Promise<GenerateFormResponse> {
    return this.ai.refine(creds, dto);
  }

  @Post("presets/generate")
  generatePreset(
    @AiCreds() creds: AiCredentials,
    @Body() dto: GeneratePresetDto,
  ): Promise<GeneratePresetResponse> {
    return this.ai.generatePreset(creds, dto);
  }

  @Post("workflows/generate")
  generateWorkflow(
    @AiCreds() creds: AiCredentials,
    @Body() dto: GenerateWorkflowDto,
  ): Promise<GenerateWorkflowResponse> {
    return this.ai.generateWorkflow(creds, dto);
  }

  @Post("workflows/refine")
  refineWorkflow(
    @AiCreds() creds: AiCredentials,
    @Body() dto: RefineWorkflowDto,
  ): Promise<GenerateWorkflowResponse> {
    return this.ai.refineWorkflow(creds, dto);
  }
}
