import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Builder dev server runs on a different origin; allow it to call the API.
  app.enableCors();
  // Validate non-contract request bodies (projects/folders/members/form-move DTOs) at the edge:
  // strip unknown keys (`whitelist`) and coerce param/body types (`transform`). Bodies typed
  // `unknown` (the form/theme contract + the preset) carry no DTO metadata, so the pipe leaves
  // them for `migrate()` / `migrateTheme()` / the schema parse. `exposeUnsetFields: false` keeps
  // absent optional keys absent — the folder-move path relies on `"parentId" in dto`.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { exposeUnsetFields: false },
    }),
  );
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
}

bootstrap();
