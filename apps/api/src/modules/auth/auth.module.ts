import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard.js";
import { MailModule } from "../mail/mail.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";

/**
 * Auth module (production-hardening 2A). Configures `@nestjs/jwt` from validated env and registers
 * the global {@link JwtAuthGuard} (secure-by-default: every route needs a token unless `@Public`).
 * Declaring the `APP_GUARD` here (rather than in `AppModule`) keeps the guard's `JwtService`
 * dependency resolvable from this module's `JwtModule` registration.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: { expiresIn: config.get<string>("JWT_ACCESS_EXPIRES_IN", "15m") },
      }),
    }),
    // A2: verify-email / password-reset mail. Optional SMTP — falls back to logging (MailService).
    MailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AuthModule {}
