import { Module } from "@nestjs/common";
import { AiController } from "./ai.controller.js";
import { AiService } from "./ai.service.js";
import { AiProviderFactory } from "./ai-provider.factory.js";

/**
 * Feature module: headless AI generation for forms and workflows. Stateless (no
 * persistence) — it builds a provider from BYOK headers, runs the `@org/form-ai`
 * / `@org/workflow-ai` pipelines, and returns a contract-valid artifact. The
 * caller persists it via the forms / workflows module.
 */
@Module({
  controllers: [AiController],
  providers: [AiService, AiProviderFactory],
})
export class AiModule {}
