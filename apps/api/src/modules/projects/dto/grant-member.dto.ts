import { IsIn, IsString } from "class-validator";

/** Body for `POST /projects/:projectId/members` — share with a collaborator. `role` is narrowed
 *  to a grantable role here (the owner role is implicit and never granted). */
export class GrantMemberDto {
  @IsString()
  userId!: string;

  @IsIn(["editor", "viewer"])
  role!: string;
}
