import { Body, Controller, Get, HttpCode, Post, Res } from "@nestjs/common";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { ConfigService } from "@nestjs/config";
import { AUTH_COOKIE_NAME, authCookieOptions } from "../../auth/cookie.js";
import { CurrentOwner } from "../../auth/current-owner.decorator.js";
import { Public } from "../../auth/public.decorator.js";
import { durationToMs } from "../../config/env.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { AuthService, type UserProfile } from "./auth.service.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { LoginDto } from "./dto/login.dto.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { RegisterDto } from "./dto/register.dto.js";

/** The subset of the Express response the controller needs to (un)set the auth cookie. */
interface CookieResponse {
  cookie(name: string, value: string, options: object): void;
  clearCookie(name: string, options?: object): void;
}

/**
 * Auth endpoints (production-hardening 2A/2B). `register`/`login` are {@link Public} and, on
 * success, set the token as an **HttpOnly** cookie (see {@link authCookieOptions}) rather than
 * returning it in the body — so browser JS never touches it. `logout` clears that cookie. `me`
 * requires a valid token; the global `JwtAuthGuard` enforces it and `CurrentOwner` yields the
 * verified user id. Both entry points stay rate-limited (brute-force protection).
 */
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post("register")
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<{ user: UserProfile }> {
    const { token, user } = await this.auth.register(dto.email, dto.password, dto.displayName);
    this.setAuthCookie(res, token);
    return { user };
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<{ user: UserProfile }> {
    const { token, user } = await this.auth.login(dto.email, dto.password);
    this.setAuthCookie(res, token);
    return { user };
  }

  @Public()
  @Post("logout")
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: CookieResponse): { ok: true } {
    // Public so an expired/absent session can still clear its cookie without a 401.
    res.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
    return { ok: true };
  }

  @Get("me")
  me(@CurrentOwner() ownerId: string): Promise<UserProfile> {
    return this.auth.me(ownerId);
  }

  private setAuthCookie(res: CookieResponse, token: string): void {
    const secure = this.config.get<boolean>("AUTH_COOKIE_SECURE", false);
    const maxAge = durationToMs(this.config.get<string>("JWT_EXPIRES_IN", "7d"));
    res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions(secure, maxAge));
  }
}
