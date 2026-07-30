import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { CaseCommentsService } from "./case-comments.service.js";
import { WorkflowInstancesController } from "./workflow-instances.controller.js";
import { WorkflowInstancesService } from "./workflow-instances.service.js";
import { WorkflowsController } from "./workflows.controller.js";
import { WorkflowsService } from "./workflows.service.js";

/**
 * Feature module: workflow save/load/list/move/delete endpoints + their service (persists via
 * WorkflowRepo), plus the WF3 runtime (instance start/load/list/advance via WorkflowInstanceRepo
 * + the pure engine). Imports {@link ProjectsModule} to reuse its owner-scoped access gate, and
 * {@link MailModule} to notify a case's new assignee (Phase E).
 *
 * Repos are NOT listed here: `PersistenceModule` is `@Global` and exports every repo token, so
 * declaring one locally would shadow the global binding with a second instance.
 */
@Module({
  imports: [ProjectsModule, MailModule],
  controllers: [WorkflowsController, WorkflowInstancesController],
  providers: [WorkflowsService, WorkflowInstancesService, CaseCommentsService],
})
export class WorkflowsModule {}
