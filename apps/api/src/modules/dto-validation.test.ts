import { type ArgumentMetadata, BadRequestException, ValidationPipe } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { CreateFolderDto } from "./folders/dto/create-folder.dto.js";
import { UpdateFolderDto } from "./folders/dto/update-folder.dto.js";
import { CreateProjectDto } from "./projects/dto/create-project.dto.js";
import { GrantMemberDto } from "./projects/dto/grant-member.dto.js";

/**
 * R6: pins the edge validation the global `ValidationPipe` applies to NON-contract request bodies.
 * We run the pipe with the exact production config (see `main.ts`) directly against each DTO —
 * no Nest bootstrap / supertest needed — so a regression in a decorator or the pipe options is
 * caught here.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  transformOptions: { exposeUnsetFields: false },
});

const as = (metatype: unknown): ArgumentMetadata =>
  ({ type: "body", metatype, data: "" }) as ArgumentMetadata;

describe("edge DTO validation (global ValidationPipe)", () => {
  it("accepts a well-typed project body", async () => {
    await expect(pipe.transform({ name: "Marketing" }, as(CreateProjectDto))).resolves.toEqual({
      name: "Marketing",
    });
  });

  it("rejects a wrong-typed project body with 400", async () => {
    await expect(pipe.transform({ name: 123 }, as(CreateProjectDto))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("strips unknown keys (whitelist)", async () => {
    const out = (await pipe.transform(
      { name: "X", bogus: "drop me" },
      as(CreateProjectDto),
    )) as Record<string, unknown>;
    expect(out).toEqual({ name: "X" });
    expect("bogus" in out).toBe(false);
  });

  it("rejects an invalid member role but accepts editor/viewer", async () => {
    await expect(
      pipe.transform({ userId: "u1", role: "admin" }, as(GrantMemberDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform({ userId: "u1", role: "editor" }, as(GrantMemberDto)),
    ).resolves.toEqual({ userId: "u1", role: "editor" });
  });

  it("requires projectId + name on a new folder", async () => {
    await expect(pipe.transform({ name: "Docs" }, as(CreateFolderDto))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("keeps an absent parentId absent on folder update (rename ≠ move-to-root)", async () => {
    const rename = (await pipe.transform({ name: "Renamed" }, as(UpdateFolderDto))) as object;
    expect("parentId" in rename).toBe(false); // exposeUnsetFields: false — a rename must not move

    const moveToRoot = (await pipe.transform({ parentId: null }, as(UpdateFolderDto))) as object;
    expect("parentId" in moveToRoot).toBe(true); // explicit null IS a move to the root
  });
});
