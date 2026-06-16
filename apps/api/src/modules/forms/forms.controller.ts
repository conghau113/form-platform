import { BadRequestException, Body, Controller, Get, Param, Post } from "@nestjs/common";
import type { FormSchema } from "@org/form-schema";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { FormsService } from "./forms.service.js";

@Controller("forms")
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  /** Save a form. Body is validated server-side; invalid schema → 400. */
  @Post()
  async create(@Body() body: unknown): Promise<FormSchema> {
    try {
      return await this.forms.save(body);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  /** Load a previously saved form by id → 404 if missing. */
  @Get(":id")
  findOne(@Param("id") id: string): Promise<FormSchema> {
    return this.forms.load(id);
  }
}
