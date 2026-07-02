import { Injectable } from "@nestjs/common";
import type { RefreshToken } from "@prisma/client";
import { type RefreshTokenRecord, RefreshTokenRepo } from "../repositories/refresh-token.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

function toRecord(t: RefreshToken): RefreshTokenRecord {
  return {
    id: t.id,
    userId: t.userId,
    tokenHash: t.tokenHash,
    expiresAt: t.expiresAt,
    revokedAt: t.revokedAt,
    createdAt: t.createdAt,
  };
}

@Injectable()
export class PrismaRefreshTokenRepo extends RefreshTokenRepo {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<RefreshTokenRecord> {
    const row = await this.prisma.refreshToken.create({ data: input });
    return toRecord(row);
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    return row ? toRecord(row) : null;
  }

  async revoke(id: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
