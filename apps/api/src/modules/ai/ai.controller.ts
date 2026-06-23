import { Body, Controller, Post } from "@nestjs/common";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { AiService, type GenerateFormResponse } from "./ai.service.js";
import { type AiCredentials, AiCreds } from "./ai-credentials.decorator.js";
// biome-ignore lint/style/useImportType: DTO class ref is read at runtime (ValidationPipe + emitDecoratorMetadata).
import { GenerateFormDto } from "./dto/generate-form.dto.js";
// biome-ignore lint/style/useImportType: DTO class ref is read at runtime (ValidationPipe + emitDecoratorMetadata).
import { RefineFormDto } from "./dto/refine-form.dto.js";

/**
 * Headless AI endpoints. `POST /ai/forms/generate` turns a prompt (and optional
 * images) into a contract-valid form; `POST /ai/forms/refine` applies a
 * natural-language edit to an existing form. Both use the caller's BYOK
 * credentials (sent as `x-ai-*` headers) and return the form plus metadata;
 * saving is a separate step via `POST /forms`.
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
}
