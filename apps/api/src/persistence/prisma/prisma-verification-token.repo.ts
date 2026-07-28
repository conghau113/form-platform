import { Injectable } from "@nestjs/common";
import type { VerificationToken } from "@prisma/client";
import {
  type TokenPurpose,
  type VerificationTokenRecord,
  VerificationTokenRepo,
} from "../repositories/verification-token.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

function toRecord(t: VerificationToken): VerificationTokenRecord {
  return {
    id: t.id,
    userId: t.userId,
    // `purpose` is a plain column (no enum in the DB) — rows only ever come from this repo's writers.
    purpose: t.purpose as TokenPurpose,
    tokenHash: t.tokenHash,
    expiresAt: t.expiresAt,
    consumedAt: t.consumedAt,
    createdAt: t.createdAt,
  };
}

@Injectable()
export class PrismaVerificationTokenRepo extends VerificationTokenRepo {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: {
    userId: string;
    purpose: TokenPurpose;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<VerificationTokenRecord> {
    const row = await this.prisma.verificationToken.create({ data: input });
    return toRecord(row);
  }

  async findByHash(tokenHash: string): Promise<VerificationTokenRecord | null> {
    const row = await this.prisma.verificationToken.findUnique({ where: { tokenHash } });
    return row ? toRecord(row) : null;
  }

  async consume(id: string): Promise<boolean> {
    const { count } = await this.prisma.verificationToken.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return count === 1;
  }

  async invalidateActive(userId: string, purpose: TokenPurpose): Promise<void> {
    await this.prisma.verificationToken.updateMany({
      where: { userId, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }
}
