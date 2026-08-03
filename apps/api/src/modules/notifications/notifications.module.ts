import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module.js";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";

/**
 * Feature module: the in-app notification inbox + the fan-out the case runtime calls (Phase E3b).
 *
 * Imports {@link ProjectsModule} for the one access question the delivery rules ask ("can this
 * recipient still open the project?"), and EXPORTS its service so {@link WorkflowsModule} can emit
 * events. The dependency runs one way — projects knows nothing about notifications — so there is no
 * cycle. Repos are not listed here: `PersistenceModule` is `@Global`.
 */
@Module({
  imports: [ProjectsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
