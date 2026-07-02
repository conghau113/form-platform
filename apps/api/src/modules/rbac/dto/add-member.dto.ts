import { IsEmail } from "class-validator";

/** Body for `POST /rbac/users` — add an existing user to the caller's tenant by email (D1). */
export class AddMemberDto {
  @IsEmail()
  email!: string;
}
