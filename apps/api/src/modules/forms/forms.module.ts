import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module.js";
import { FormVersionsController } from "./form-versions.controller.js";
import { FormVersionsService } from "./form-versions.service.js";
import { FormsController } from "./forms.controller.js";
import { FormsService } from "./forms.service.js";

/**
 * Feature module: form save/load/list/move/delete endpoints + their service (persists via
 * FormRepo), plus draft/publish/version endpoints (FB1). Imports {@link ProjectsModule} to reuse
 * its owner-scoped ownership gate.
 */
@Module({
  imports: [ProjectsModule],
  controllers: [FormsController, FormVersionsController],
  providers: [FormsService, FormVersionsService],
})
export class FormsModule {}
