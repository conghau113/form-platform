import { IsArray, IsString } from "class-validator";

/** Body for `PUT /rbac/roles/:id/data-scopes` — the full set of org-unit ids the role is scoped to
 *  (C3). An empty array clears the scope, making the role tenant-wide again. */
export class SetRoleDataScopesDto {
  @IsArray()
  @IsString({ each: true })
  orgUnitIds!: string[];
}
