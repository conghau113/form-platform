import { BadGatewayException, Injectable, UnprocessableEntityException } from "@nestjs/common";
import {
  type GenerateFormResult,
  generateForm,
  refineForm,
  stripDisallowedUrls,
} from "@org/form-ai";
import type { FormSchema } from "@org/form-schema";
import { type AiServerConfig, loadAiConfig } from "./ai.config.js";
import type { AiCredentials } from "./ai-credentials.decorator.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { AiProviderFactory } from "./ai-provider.factory.js";
import type { GenerateFormDto } from "./dto/generate-form.dto.js";
import type { RefineFormDto } from "./dto/refine-form.dto.js";

export interface GenerateFormResponse {
  form: FormSchema;
  /** Model calls it took (1 = valid on the first try). */
  attempts: number;
  /** URLs removed from the form by the output allowlist (see `AI_URL_ALLOWLIST`). */
  strippedUrls: string[];
}

/**
 * Headless form generation. Builds a provider from the request's BYOK credentials,
 * runs the guaranteed-valid pipeline (generate → Zod → repair), then strips any
 * off-allowlist URL. The result is a contract-valid `FormSchema`; the caller saves
 * it via `POST /forms` (this endpoint does NOT persist). On unrecoverable model
 * failure it returns 422 with the structured errors rather than a broken form.
 */
@Injectable()
export class AiService {
  private readonly config: AiServerConfig = loadAiConfig();

  constructor(private readonly providers: AiProviderFactory) {}

  /** Generate a brand-new form from a prompt (and optional reference images). */
  async generate(creds: AiCredentials, dto: GenerateFormDto): Promise<GenerateFormResponse> {
    const provider = this.providers.create(creds);
    return this.run(() =>
      generateForm(
        provider,
        { prompt: dto.prompt, guidance: dto.guidance, images: dto.images },
        { maxRepairs: dto.maxRepairs, imageStrategy: dto.imageStrategy },
      ),
    );
  }

  /** Apply a natural-language edit to an existing form, returning a valid result. */
  async refine(creds: AiCredentials, dto: RefineFormDto): Promise<GenerateFormResponse> {
    const provider = this.providers.create(creds);
    return this.run(() =>
      refineForm(
        provider,
        {
          currentForm: dto.baseForm,
          instruction: dto.instruction,
          guidance: dto.guidance,
          images: dto.images,
        },
        { maxRepairs: dto.maxRepairs, imageStrategy: dto.imageStrategy },
      ),
    );
  }

  /**
   * Shared pipeline boundary for generate + refine: a provider/upstream failure
   * surfaces as 502 (the caller sees what to fix — bad key, unconfigured model),
   * an unrecoverable model output as 422 with the structured errors, and a valid
   * form has its off-allowlist URLs stripped before it is returned.
   */
  private async run(call: () => Promise<GenerateFormResult>): Promise<GenerateFormResponse> {
    let result: GenerateFormResult;
    try {
      result = await call();
    } catch (err) {
      throw new BadGatewayException({
        message: `AI provider request failed: ${(err as Error).message}`,
      });
    }
    if (!result.ok) {
      throw new UnprocessableEntityException({
        message: "The AI could not produce a valid form.",
        errors: result.errors,
        attempts: result.attempts,
      });
    }
    const { form, stripped } = stripDisallowedUrls(result.form, this.config.urlAllowlist);
    return { form, attempts: result.attempts, strippedUrls: stripped };
  }
}
