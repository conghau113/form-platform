import { createHmac, randomBytes } from "node:crypto";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { ConfigService } from "@nestjs/config";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { JwtService } from "@nestjs/jwt";
import { Throttle } from "@nestjs/throttler";
import {
  AUTH_COOKIE_NAME,
  authCookieOptions,
  OAUTH_STATE_COOKIE_NAME,
  oauthStateCookieOptions,
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
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from "./dto/password.dto.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { RegisterDto } from "./dto/register.dto.js";
import { googleAuthUrl, googleConfig } from "./google-oauth.js";

/** The subset of the Express response the controller needs to (un)set the auth cookies. */
interface CookieResponse {
  cookie(name: string, value: string, options: object): void;
  clearCookie(name: string, options?: object): void;
}

/** Response for the two OAuth handlers, which answer with a 302 instead of a body (A3). */
interface RedirectResponse extends CookieResponse {
  redirect(url: string): void;
}

/** Marks the `state` JWT as an OAuth nonce carrier — see `oauthStart` for why this matters. */
const OAUTH_STATE_TYP = "oauth_state";

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
    private readonly jwt: JwtService,
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

  /**
   * Email a reset link (A2). Always `{ok:true}` — telling the caller whether the address exists
   * would turn this into an account-enumeration oracle. Tightly throttled: it sends mail.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("forgot-password")
  @HttpCode(200)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ ok: true }> {
    await this.auth.forgotPassword(dto.email);
    return { ok: true };
  }

  /** Redeem a reset token and set the new password (A2). Public: the caller has no session yet. */
  @Public()
  @Post("reset-password")
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ ok: true }> {
    await this.auth.resetPassword(dto.token, dto.password);
    return { ok: true };
  }

  /** Redeem an email-verification token (A2). Public: the link may be opened in any browser. */
  @Public()
  @Post("verify-email")
  @HttpCode(200)
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<{ ok: true }> {
    await this.auth.verifyEmail(dto.token);
    return { ok: true };
  }

  /** Re-send the verification email to the signed-in account (A2). No-op once verified. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("resend-verification")
  @HttpCode(200)
  async resendVerification(@CurrentOwner() ownerId: string): Promise<{ ok: true }> {
    await this.auth.resendVerification(ownerId);
    return { ok: true };
  }

  /** Change the password of the signed-in account (A2). Other sessions are revoked; this one is
   *  re-issued, so the caller stays signed in with fresh cookies. */
  @Post("change-password")
  @HttpCode(200)
  async changePassword(
    @CurrentOwner() ownerId: string,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<{ user: UserProfile }> {
    const result = await this.auth.changePassword(ownerId, dto.currentPassword, dto.newPassword);
    this.setAuthCookies(res, result);
    return { user: result.user };
  }

  /**
   * Which external sign-in providers this deployment has configured (A3). Public and unauthenticated
   * because the login page asks BEFORE anyone is signed in. Unlike A2's mail (which degrades
   * invisibly), the UI has to know: a sign-in button that leads to a 404 is a visible defect.
   */
  @Public()
  @Get("providers")
  providers(): { google: boolean } {
    return { google: googleConfig() !== null };
  }

  /**
   * Start Google sign-in (A3): redirect the browser to Google's consent screen.
   *
   * CSRF defence is a double submit — a random nonce travels to Google inside a signed `state`
   * JWT *and* is stored in a short-lived cookie; the callback only proceeds when the two agree, so
   * a callback URL forged by an attacker cannot sign a victim into the attacker's Google account.
   *
   * ⚠️ `state` is signed with the SAME `JWT_SECRET` as the access token and is fully visible in the
   * URL bar and browser history, so it carries an explicit `typ` that the callback checks. Without
   * that, a future payload change (anything resembling a `sub`) would silently turn this public
   * string into a credential the global `JwtAuthGuard` would accept.
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get("oauth/google")
  async oauthStart(@Res() res: RedirectResponse): Promise<void> {
    const cfg = googleConfig();
    // Not configured ⇒ the route does not exist, rather than a half-working endpoint.
    if (!cfg) throw new NotFoundException();
    const nonce = randomBytes(16).toString("hex");
    const state = await this.jwt.signAsync(
      { typ: OAUTH_STATE_TYP, n: nonce },
      { secret: this.stateSecret(), expiresIn: "10m" },
    );
    res.cookie(OAUTH_STATE_COOKIE_NAME, nonce, this.oauthStateCookie());
    res.redirect(googleAuthUrl(cfg, state));
  }

  /**
   * Google's redirect back (A3). On success the session lands in the usual HttpOnly cookies and the
   * browser continues into the SPA — deliberately NOT as tokens in the query string (they would
   * leak into history, logs and `Referer`).
   *
   * Every failure funnels to the same `?error=oauth`: an attacker must not learn *why* their forged
   * callback was rejected, and Google's own error text has no business in our URL.
   */
  @Public()
  @Get("oauth/google/callback")
  async oauthCallback(
    @Req() req: CookieRequest,
    @Res() res: RedirectResponse,
    @Query("code") code?: string,
    @Query("state") state?: string,
  ): Promise<void> {
    const appUrl = this.config
      .get<string>("APP_PUBLIC_URL", "http://localhost:5173")
      .replace(/\/$/, "");
    // Whatever happens next, this nonce has been spent.
    res.clearCookie(OAUTH_STATE_COOKIE_NAME, { path: "/" });
    try {
      if (!code || !state) throw new Error("missing code/state");
      const payload = await this.jwt.verifyAsync<{ typ?: string; n?: string }>(state, {
        secret: this.stateSecret(),
      });
      if (payload.typ !== OAUTH_STATE_TYP) throw new Error("wrong state token type");
      const cookieNonce = parseCookies(req.headers.cookie)[OAUTH_STATE_COOKIE_NAME];
      if (!payload.n || !cookieNonce || payload.n !== cookieNonce)
        throw new Error("state mismatch");

      const identity = await this.auth.exchangeGoogleCode(code);
      const result = await this.auth.loginWithGoogle(identity);
      this.setAuthCookies(res, result);
      res.redirect(`${appUrl}/projects`);
    } catch {
      res.redirect(`${appUrl}/login?error=oauth`);
    }
  }

  /**
   * Signing key for the OAuth `state` token — derived from `JWT_SECRET`, never `JWT_SECRET` itself.
   *
   * The state token is published: it rides the URL bar, browser history and Google's logs. Signed
   * with the access-token key it would BE an access token as far as {@link JwtAuthGuard} is
   * concerned (it verifies a signature, not a purpose), and any handler that doesn't happen to read
   * `sub` would accept it. Domain separation makes that structurally impossible; the `typ` claim
   * and the guard's `sub` check are the second and third lines of defence.
   */
  private stateSecret(): string {
    const base = this.config.get<string>("JWT_SECRET", "");
    return createHmac("sha256", base).update("oauth-state").digest("hex");
  }

  private oauthStateCookie() {
    return oauthStateCookieOptions(this.config.get<boolean>("AUTH_COOKIE_SECURE", false));
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
