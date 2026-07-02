import { IsArray, IsString } from "class-validator";

/** Body for `PUT /rbac/users/:userId/roles` — the full set of role ids assigned to the user. */
export class SetUserRolesDto {
  @IsArray()
  @IsString({ each: true })
  roleIds!: string[];
}
