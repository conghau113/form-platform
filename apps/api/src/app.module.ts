import { Module } from "@nestjs/common";
import { AiModule } from "./modules/ai/ai.module.js";
import { FoldersModule } from "./modules/folders/folders.module.js";
import { FormsModule } from "./modules/forms/forms.module.js";
import { PresetsModule } from "./modules/presets/presets.module.js";
import { ProjectsModule } from "./modules/projects/projects.module.js";
import { StatusCatalogModule } from "./modules/status-catalog/status-catalog.module.js";
import { ThemesModule } from "./modules/themes/themes.module.js";
import { WorkflowsModule } from "./modules/workflows/workflows.module.js";
import { PersistenceModule } from "./persistence/persistence.module.js";

/** Root module — composes the feature modules. New features (e.g. workflow) are added
 *  here as their own `src/modules/<feature>` module rather than registering controllers
 *  and providers flat. `PersistenceModule` is global, so feature services can inject the
 *  repo interfaces without re-importing it. */
@Module({
  imports: [
    PersistenceModule,
    ProjectsModule,
    FoldersModule,
    FormsModule,
    WorkflowsModule,
    ThemesModule,
    PresetsModule,
    StatusCatalogModule,
    AiModule,
  ],
})
export class AppModule {}
