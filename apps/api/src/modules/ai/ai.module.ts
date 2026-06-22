import { Module } from "@nestjs/common";
import { AiController } from "./ai.controller.js";
import { AiService } from "./ai.service.js";
import { AiProviderFactory } from "./ai-provider.factory.js";

/**
 * Feature module: headless AI form generation. Stateless (no persistence) — it
 * builds a provider from BYOK headers, runs the `@org/form-ai` pipeline, and
 * returns a contract-valid form. The caller persists it via the forms module.
 */
@Module({
  controllers: [AiController],
  providers: [AiService, AiProviderFactory],
})
export class AiModule {}
