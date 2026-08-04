import { Module } from "@nestjs/common";
import { ApiKeyGuard } from "./api-key.guard.js";
import { ExternalController } from "./external.controller.js";
import { ExternalService } from "./external.service.js";

/**
 * Feature module: the machine-to-machine surface an integrating system reads through (EVN §12,
 * D0-a/D1). {@link ApiKeyGuard} is a provider so Nest can inject its repo when the controller binds
 * it with `@UseGuards`. Repos are not listed: `PersistenceModule` is `@Global`.
 *
 * Nothing here writes. Credentials and ticket-type bindings are seeded out of band on purpose —
 * this slice deliberately ships no admin endpoint that could mint a key.
 */
@Module({
  controllers: [ExternalController],
  providers: [ExternalService, ApiKeyGuard],
})
export class ExternalModule {}
