import { Body, Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { ConfigService } from "@nestjs/config";
import {
  AUTH_COOKIE_NAME,
  authCookieOptions,
  parseCookies,
  REFRESH_COOKIE_NAME,
} from "../../auth/cookie.js";
import { CurrentOwner } from "../../auth/current-owner.decorator.js";
import { Public } from "../../auth/public.decorator.js";
import { durationToMs } from "../../config/env.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { type AuthResult, AuthService, type UserProfile } from "./auth.service.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { LoginDto } from "./dto/login.dto.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { RegisterDto } from "./dto/register.dto.js";

/** The subset of the Express response the controller needs to (un)set the auth cookies. */
interface CookieResponse {
  cookie(name: string, value: string, options: object): void;
  clearCookie(name: string, options?: object): void;
}

/** The subset of the Express request the controller reads the refresh cookie from. */
interface CookieRequest {
  headers: { cookie?: string | string[] };
}

/**
 * Auth endpoints (production-hardening 2A/2B/A1). `register`/`login` are {@link Public} and, on
 * success, set a **short-lived** access token and a **long-lived rotating** refresh token as
 * separate **HttpOnly** cookies (see {@link authCookieOptions}) — browser JS never touches either.
 * `refresh` (also Public, since the access token may already be expired) exchanges the refresh
 * cookie for a fresh pair; `logout` revokes the presented refresh token and clears both cookies;
 * `logout-all` revokes every session for the caller. `me` requires a valid access token. Both
 * entry points stay rate-limited (brute-force protection).
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
    const result = await this.auth.register(dto.email, dto.password, dto.displayName);
    this.setAuthCookies(res, result);
    return { user: result.user };
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<{ user: UserProfile }> {
    const result = await this.auth.login(dto.email, dto.password);
    this.setAuthCookies(res, result);
    return { user: result.user };
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Req() req: CookieRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<{ user: UserProfile }> {
    const raw = parseCookies(req.headers.cookie)[REFRESH_COOKIE_NAME]?.trim();
    try {
      const result = await this.auth.refresh(raw ?? "");
      this.setAuthCookies(res, result);
      return { user: result.user };
    } catch (err) {
      // A rejected refresh means the session is over — clear both cookies so the client goes anon.
      this.clearAuthCookies(res);
      throw err;
    }
  }

  @Public()
  @Post("logout")
  @HttpCode(200)
  async logout(
    @Req() req: CookieRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<{ ok: true }> {
    // Public so an expired/absent session can still clear its cookies without a 401.
    const raw = parseCookies(req.headers.cookie)[REFRESH_COOKIE_NAME]?.trim();
    await this.auth.logout(raw);
    this.clearAuthCookies(res);
    return { ok: true };
  }

  @Post("logout-all")
  @HttpCode(200)
  async logoutAll(
    @CurrentOwner() ownerId: string,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<{ ok: true }> {
    await this.auth.logoutAll(ownerId);
    this.clearAuthCookies(res);
    return { ok: true };
  }

  @Get("me")
  me(@CurrentOwner() ownerId: string): Promise<UserProfile> {
    return this.auth.me(ownerId);
  }

  private setAuthCookies(res: CookieResponse, { accessToken, refreshToken }: AuthResult): void {
    const secure = this.config.get<boolean>("AUTH_COOKIE_SECURE", false);
    const accessMaxAge = durationToMs(this.config.get<string>("JWT_ACCESS_EXPIRES_IN", "15m"));
    const refreshMaxAge = durationToMs(this.config.get<string>("JWT_REFRESH_EXPIRES_IN", "30d"));
    res.cookie(AUTH_COOKIE_NAME, accessToken, authCookieOptions(secure, accessMaxAge));
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, authCookieOptions(secure, refreshMaxAge));
  }

  private clearAuthCookies(res: CookieResponse): void {
    res.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
    res.clearCookie(REFRESH_COOKIE_NAME, { path: "/" });
  }
}
