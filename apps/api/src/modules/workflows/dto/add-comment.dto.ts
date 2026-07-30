import { IsNotEmpty, IsString, MaxLength } from "class-validator";

/**
 * Body for `POST /workflow-instances/:instanceId/comments` (product-roadmap Phase E2). Free text
 * written by a person — no interpretation, no interpolation; the UI renders it as plain text.
 *
 * The 2000-char ceiling keeps one note from becoming a document; the builder's textarea stops at the
 * same number so the 400 is never the user's first hint.
 */
export class AddCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;
}
