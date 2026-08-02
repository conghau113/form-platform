import { IsString, Matches, MaxLength } from "class-validator";

/**
 * Body for `POST /workflow-instances/:instanceId/participants` (product-roadmap Phase E3a) — cast a
 * workspace member into a domain role on this case.
 *
 * `roleCode` is matched verbatim against a definition's `transition.role`, so the charset is kept to
 * what an identifier can hold: it lands in responses, audit entries and (Phase E3b) notification
 * text, and free-form text there is a needless injection surface. It is NOT checked against the
 * workflow definition — a graph can be edited after the fact, and a cast must not be quietly
 * invalidated because someone renamed a transition. The reserved codes are refused in the service,
 * where the same list guards tenant role names.
 */
export class AddParticipantDto {
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: "roleCode may only contain letters, digits, dot, underscore or hyphen",
  })
  roleCode!: string;

  @IsString()
  @MaxLength(191)
  userId!: string;
}
