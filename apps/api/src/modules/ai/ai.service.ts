import { BadGatewayException, Injectable, UnprocessableEntityException } from "@nestjs/common";
import { generateForm, stripDisallowedUrls } from "@org/form-ai";
import type { FormSchema } from "@org/form-schema";
import { type AiServerConfig, loadAiConfig } from "./ai.config.js";
import type { AiCredentials } from "./ai-credentials.decorator.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { AiProviderFactory } from "./ai-provider.factory.js";
import type { GenerateFormDto } from "./dto/generate-form.dto.js";

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

  async generate(creds: AiCredentials, dto: GenerateFormDto): Promise<GenerateFormResponse> {
    const provider = this.providers.create(creds);
    let result: Awaited<ReturnType<typeof generateForm>>;
    try {
      result = await generateForm(
        provider,
        { prompt: dto.prompt, guidance: dto.guidance, images: dto.images },
        { maxRepairs: dto.maxRepairs },
      );
    } catch (err) {
      // The provider/upstream itself failed (bad key or model, network, an
      // incompatible response). Surface the reason as 502 instead of a generic
      // 500 so the caller sees what to fix (e.g. an unconfigured 9router model).
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
