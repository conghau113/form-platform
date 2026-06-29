import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module.js";
import { SubmissionsController } from "./submissions.controller.js";
import { SubmissionsService } from "./submissions.service.js";

/**
 * Feature module: form submission runtime (FS1). Records/loads/lists submissions via
 * SubmissionRepo, re-validating each answer server-side with `@org/form-core`. Imports
 * {@link ProjectsModule} to reuse its owner-scoped access gate.
 */
@Module({
  imports: [ProjectsModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService],
})
export class SubmissionsModule {}
