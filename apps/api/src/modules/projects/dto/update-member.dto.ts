import { IsIn } from "class-validator";

/** Body for `PATCH /projects/:projectId/members/:userId` — change a collaborator's role. */
export class UpdateMemberDto {
  @IsIn(["editor", "viewer"])
  role!: string;
}
