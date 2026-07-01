import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import { CurrentOwner } from "../../auth/current-owner.decorator.js";
import { Public } from "../../auth/public.decorator.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { type AuthResult, AuthService, type UserProfile } from "./auth.service.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { LoginDto } from "./dto/login.dto.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { RegisterDto } from "./dto/register.dto.js";

/**
 * Auth endpoints (production-hardening 2A). `register`/`login` are {@link Public} (no token yet);
 * `me` requires a valid bearer token — the global `JwtAuthGuard` enforces it and `CurrentOwner`
 * yields the verified user id. Both entry points stay rate-limited (brute-force protection).
 */
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("register")
  register(@Body() dto: RegisterDto): Promise<AuthResult> {
    return this.auth.register(dto.email, dto.password, dto.displayName);
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<AuthResult> {
    return this.auth.login(dto.email, dto.password);
  }

  @Get("me")
  me(@CurrentOwner() ownerId: string): Promise<UserProfile> {
    return this.auth.me(ownerId);
  }
}
