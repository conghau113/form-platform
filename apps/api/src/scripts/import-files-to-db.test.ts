import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED_OWNER_ID } from "../common/constants.js";
import { PrismaService } from "../persistence/prisma/prisma.service.js";
import { UNFILED_SLUG } from "../persistence/prisma/prisma-project.repo.js";
import { importFilesToDb } from "./import-files-to-db.js";

/**
 * Integration test: the flat-file importer must adopt forms/themes/presets into a fresh
 * SQLite DB and be idempotent (re-running creates no duplicates). Uses a throwaway temp db so
 * the dev workspace is untouched.
 */
describe("importFilesToDb", () => {
  let tmp: string;
  let dataDir: string;
  let prisma: PrismaService;

  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), "w0-import-"));
    const dbUrl = `file:${join(tmp, "test.db")}`;
    process.env.DATABASE_URL = dbUrl;

    // Create the schema in the temp db (no migration history needed for a test db).
    execSync("pnpm exec prisma db push --skip-generate", {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: "ignore",
    });

    // A fixture .data dir mirroring the legacy flat-file layout.
    dataDir = join(tmp, ".data");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      join(dataDir, "fixture-form.json"),
      JSON.stringify({
        formVersion: 3,
        id: "fixture-form",
        title: "Fixture",
        fields: [{ type: "text", name: "fullName", label: "Full name" }],
      }),
    );
    writeFileSync(
      join(dataDir, "fixture-form.theme.json"),
      JSON.stringify({
        themeVersion: 1,
        algorithm: "default",
        colors: { primary: "#1677ff" },
        radius: 6,
        spacing: 16,
        typography: { fontSize: 14 },
      }),
    );
    writeFileSync(
      join(dataDir, "presets.json"),
      JSON.stringify([
        { id: "fixture-preset", fieldType: "text", name: "Fixture preset", patch: {} },
      ]),
    );

    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("imports forms, themes and presets into the Unfiled project", async () => {
    const result = await importFilesToDb(dataDir, prisma);
    expect(result).toMatchObject({ forms: 1, themes: 1, presets: 1 });

    const project = await prisma.project.findUniqueOrThrow({
      where: { ownerId_slug: { ownerId: SEED_OWNER_ID, slug: UNFILED_SLUG } },
    });
    const form = await prisma.formRecord.findUniqueOrThrow({ where: { id: "fixture-form" } });
    expect(form.projectId).toBe(project.id);
    expect(form.title).toBe("Fixture");
    expect(await prisma.theme.count()).toBe(1);
    expect(await prisma.preset.count()).toBe(1);
  });

  it("is idempotent — re-running does not duplicate rows", async () => {
    await importFilesToDb(dataDir, prisma);
    expect(await prisma.formRecord.count()).toBe(1);
    expect(await prisma.theme.count()).toBe(1);
    expect(await prisma.preset.count()).toBe(1);
    expect(await prisma.project.count()).toBe(1);
  });
});
