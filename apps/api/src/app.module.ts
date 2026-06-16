import { Module } from "@nestjs/common";
import { FormsModule } from "./modules/forms/forms.module.js";
import { PresetsModule } from "./modules/presets/presets.module.js";
import { ThemesModule } from "./modules/themes/themes.module.js";
import { PersistenceModule } from "./persistence/persistence.module.js";

/** Root module — composes the feature modules. New features (e.g. workflow) are added
 *  here as their own `src/modules/<feature>` module rather than registering controllers
 *  and providers flat. `PersistenceModule` is global, so feature services can inject the
 *  repo interfaces without re-importing it. */
@Module({
  imports: [PersistenceModule, FormsModule, ThemesModule, PresetsModule],
})
export class AppModule {}
