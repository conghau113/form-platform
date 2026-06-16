import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module.js";
import { FoldersController } from "./folders.controller.js";
import { FoldersService } from "./folders.service.js";

/**
 * Feature module: owner-scoped folder CRUD. Imports {@link ProjectsModule} to reuse its
 * ownership gate (`ProjectsService.getOne`); persists via the global repo interfaces.
 */
@Module({
  imports: [ProjectsModule],
  controllers: [FoldersController],
  providers: [FoldersService],
})
export class FoldersModule {}
