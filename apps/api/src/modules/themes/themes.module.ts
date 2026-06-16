import { Module } from "@nestjs/common";
import { ThemesController } from "./themes.controller.js";
import { ThemesService } from "./themes.service.js";

/** Feature module: theme save/load endpoints + their service (persists via ThemeRepo). */
@Module({
  controllers: [ThemesController],
  providers: [ThemesService],
})
export class ThemesModule {}
