import { IsArray, IsString } from "class-validator";

/** Body for `PUT /rbac/roles/:id/functions` — the full set of function codes the role grants. */
export class SetRoleFunctionsDto {
  @IsArray()
  @IsString({ each: true })
  functions!: string[];
}
