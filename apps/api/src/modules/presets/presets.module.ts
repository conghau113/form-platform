import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module.js";
import { PresetsController } from "./presets.controller.js";
import { PresetsService } from "./presets.service.js";

/**
 * Feature module: user-preset CRUD endpoints + their service (persists via PresetRepo). Imports
 * ProjectsModule so project-scoped presets gate on project role (shared project library, W5).
 */
@Module({
  imports: [ProjectsModule],
  controllers: [PresetsController],
  providers: [PresetsService],
})
export class PresetsModule {}
