import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/** Body for `POST /auth/register`. Validated at the edge by the global `ValidationPipe`. */
export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;
}
