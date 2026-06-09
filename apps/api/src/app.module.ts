import { Module } from "@nestjs/common";
import { FormsController } from "./forms.controller.js";
import { FormsService } from "./forms.service.js";
import { ThemesController } from "./themes.controller.js";
import { ThemesService } from "./themes.service.js";

@Module({
  controllers: [FormsController, ThemesController],
  providers: [FormsService, ThemesService],
})
export class AppModule {}
