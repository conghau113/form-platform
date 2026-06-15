import { Module } from "@nestjs/common";
import { FormsModule } from "./modules/forms/forms.module.js";
import { PresetsModule } from "./modules/presets/presets.module.js";
import { ThemesModule } from "./modules/themes/themes.module.js";

/** Root module — composes the feature modules. New features (e.g. workflow) are added
 *  here as their own `src/modules/<feature>` module rather than registering controllers
 *  and providers flat. */
@Module({
  imports: [FormsModule, ThemesModule, PresetsModule],
})
export class AppModule {}
