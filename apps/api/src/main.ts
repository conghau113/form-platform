import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module.js";
import { parseCorsOrigins } from "./config/env.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Security headers (CSP off — this is a JSON API, not an HTML app; the SPA is served by nginx).
  app.use(helmet());

  // CORS: only the configured browser origins (the builder SPA) may call the API. An empty
  // allowlist disables cross-origin requests rather than falling back to allow-all.
  const origins = parseCorsOrigins(config.get<string>("CORS_ORIGINS", ""));
  app.enableCors({ origin: origins.length > 0 ? origins : false, credentials: true });

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

  const port = config.get<number>("PORT", 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
}

bootstrap();
