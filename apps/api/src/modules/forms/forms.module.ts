import { Module } from "@nestjs/common";
import { FormsController } from "./forms.controller.js";
import { FormsService } from "./forms.service.js";

/** Feature module: form save/load endpoints + their file-backed service. */
@Module({
  controllers: [FormsController],
  providers: [FormsService],
})
export class FormsModule {}
