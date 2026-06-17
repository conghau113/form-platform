import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module.js";
import { ThemesController } from "./themes.controller.js";
import { ThemesService } from "./themes.service.js";

/**
 * Feature module: theme save/load endpoints + their service (persists via ThemeRepo). Imports
 * ProjectsModule for the role-based access gate (a theme inherits its form's project access).
 */
@Module({
  imports: [ProjectsModule],
  controllers: [ThemesController],
  providers: [ThemesService],
})
export class ThemesModule {}
