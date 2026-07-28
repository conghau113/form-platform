import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

/** Body for `POST /auth/forgot-password` (A2). Always answered with `{ok:true}`, account or not. */
export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

/** Body for `POST /auth/reset-password` (A2): the emailed one-time token + the new password. */
export class ResetPasswordDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}

/** Body for `POST /auth/verify-email` (A2). */
export class VerifyEmailDto {
  @IsString()
  @MinLength(1)
  token!: string;
}

/** Body for `POST /auth/change-password` (A2) — the current password re-authenticates the caller. */
export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  newPassword!: string;
}
