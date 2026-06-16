import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { migrate, parsePreset } from "@org/form-schema";
import { migrateTheme } from "@org/form-theme";
import { SEED_OWNER_ID } from "../common/constants.js";
import { DATA_DIR } from "../common/file-store.js";
import { PrismaService } from "../persistence/prisma/prisma.service.js";
import { PrismaFormRepo } from "../persistence/prisma/prisma-form.repo.js";
import { PrismaPresetRepo } from "../persistence/prisma/prisma-preset.repo.js";
import { PrismaProjectRepo } from "../persistence/prisma/prisma-project.repo.js";
import { PrismaThemeRepo } from "../persistence/prisma/prisma-theme.repo.js";

const THEME_SUFFIX = ".theme.json";
const PRESETS_FILE = "presets.json";

export interface ImportResult {
  projectId: string;
  forms: number;
  themes: number;
  presets: number;
}

/**
 * Adopt the legacy flat-file store into the DB (W0). Idempotent: every write is an upsert, so
 * re-running imports the same files without creating duplicates. Forms land in the owner's
 * "Unfiled" project; `migrate` / `migrateTheme` / `parsePreset` stay the validation gate so
 * only normalized data is persisted.
 */
export async function importFilesToDb(
  dataDir: string,
  prisma: PrismaService,
): Promise<ImportResult> {
  const projects = new PrismaProjectRepo(prisma);
  const forms = new PrismaFormRepo(prisma);
  const themes = new PrismaThemeRepo(prisma);
  const presets = new PrismaPresetRepo(prisma);

  const unfiled = await projects.ensureUnfiled(SEED_OWNER_ID);
  const result: ImportResult = { projectId: unfiled.id, forms: 0, themes: 0, presets: 0 };
  if (!existsSync(dataDir)) return result;

  const entries = readdirSync(dataDir);

  // Forms: `<id>.json`, excluding theme sidecars and the shared presets collection.
  for (const name of entries) {
    if (!name.endsWith(".json") || name.endsWith(THEME_SUFFIX) || name === PRESETS_FILE) continue;
    const form = migrate(JSON.parse(readFileSync(resolve(dataDir, name), "utf8")));
    await forms.upsert(form, { projectId: unfiled.id });
    result.forms++;
  }

  // Themes: `<formId>.theme.json`, keyed by the form id encoded in the filename.
  for (const name of entries) {
    if (!name.endsWith(THEME_SUFFIX)) continue;
    const formId = name.slice(0, -THEME_SUFFIX.length);
    const tokens = migrateTheme(JSON.parse(readFileSync(resolve(dataDir, name), "utf8")));
    await themes.upsert(formId, tokens);
    result.themes++;
  }

  // Presets: the single global collection → global-scoped Preset rows.
  const presetsPath = resolve(dataDir, PRESETS_FILE);
  if (existsSync(presetsPath)) {
    const list = JSON.parse(readFileSync(presetsPath, "utf8")) as unknown[];
    for (const entry of list) {
      await presets.upsert(parsePreset(entry));
      result.presets++;
    }
  }

  return result;
}

async function main(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const r = await importFilesToDb(DATA_DIR, prisma);
    console.log(
      `Imported ${r.forms} form(s), ${r.themes} theme(s), ${r.presets} preset(s) into project ${r.projectId}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when executed directly (not when imported by the test). `pathToFileURL` handles
// Windows drive letters / slash differences that a manual `file://` concat gets wrong.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
