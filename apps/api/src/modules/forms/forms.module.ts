import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module.js";
import { FormsController } from "./forms.controller.js";
import { FormsService } from "./forms.service.js";

/**
 * Feature module: form save/load/list/move/delete endpoints + their service (persists via
 * FormRepo). Imports {@link ProjectsModule} to reuse its owner-scoped ownership gate.
 */
@Module({
  imports: [ProjectsModule],
  controllers: [FormsController],
  providers: [FormsService],
})
export class FormsModule {}
