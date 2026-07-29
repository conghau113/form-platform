import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { WorkflowInstancesController } from "./workflow-instances.controller.js";
import { WorkflowInstancesService } from "./workflow-instances.service.js";
import { WorkflowsController } from "./workflows.controller.js";
import { WorkflowsService } from "./workflows.service.js";

/**
 * Feature module: workflow save/load/list/move/delete endpoints + their service (persists via
 * WorkflowRepo), plus the WF3 runtime (instance start/load/list/advance via WorkflowInstanceRepo
 * + the pure engine). Imports {@link ProjectsModule} to reuse its owner-scoped access gate, and
 * {@link MailModule} to notify a case's new assignee (Phase E).
 */
@Module({
  imports: [ProjectsModule, MailModule],
  controllers: [WorkflowsController, WorkflowInstancesController],
  providers: [WorkflowsService, WorkflowInstancesService],
})
export class WorkflowsModule {}
