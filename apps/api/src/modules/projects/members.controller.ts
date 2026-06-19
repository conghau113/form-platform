import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { CurrentOwner } from "../../auth/current-owner.decorator.js";
import type { ProjectMemberRecord } from "../../persistence/repositories/project-member.repo.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { GrantMemberDto } from "./dto/grant-member.dto.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { UpdateMemberDto } from "./dto/update-member.dto.js";
import type { ProjectMembersView } from "./members.service.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { MembersService } from "./members.service.js";

/** Project sharing endpoints (W5). Roster is readable by any member; mutations are owner-only. */
@Controller("projects/:projectId/members")
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  list(
    @CurrentOwner() ownerId: string,
    @Param("projectId") projectId: string,
  ): Promise<ProjectMembersView> {
    return this.members.list(ownerId, projectId);
  }

  @Post()
  grant(
    @CurrentOwner() ownerId: string,
    @Param("projectId") projectId: string,
    @Body() dto: GrantMemberDto,
  ): Promise<ProjectMemberRecord> {
    return this.members.grant(ownerId, projectId, dto.userId, dto.role);
  }

  @Patch(":userId")
  updateRole(
    @CurrentOwner() ownerId: string,
    @Param("projectId") projectId: string,
    @Param("userId") userId: string,
    @Body() dto: UpdateMemberDto,
  ): Promise<ProjectMemberRecord> {
    return this.members.updateRole(ownerId, projectId, userId, dto.role);
  }

  @Delete(":userId")
  @HttpCode(204)
  revoke(
    @CurrentOwner() ownerId: string,
    @Param("projectId") projectId: string,
    @Param("userId") userId: string,
  ): Promise<void> {
    return this.members.revoke(ownerId, projectId, userId);
  }
}
