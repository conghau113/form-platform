import { Module } from "@nestjs/common";
import { PresetsController } from "./presets.controller.js";
import { PresetsService } from "./presets.service.js";

/** Feature module: user-preset CRUD endpoints + their service (persists via PresetRepo). */
@Module({
  controllers: [PresetsController],
  providers: [PresetsService],
})
export class PresetsModule {}
