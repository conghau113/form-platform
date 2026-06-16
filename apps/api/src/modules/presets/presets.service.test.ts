import { ConflictException, NotFoundException } from "@nestjs/common";
import type { Preset } from "@org/form-schema";
import { beforeEach, describe, expect, it } from "vitest";
import { PresetRepo } from "../../persistence/repositories/preset.repo.js";
import { PresetsService } from "./presets.service.js";

/** In-memory PresetRepo mirroring the Prisma scope-union/ownership rules (see PrismaPresetRepo). */
class FakePresetRepo extends PresetRepo {
  readonly rows = new Map<string, Preset & { ownerId: string }>();

  async list(ownerId: string, projectId?: string): Promise<Preset[]> {
    return [...this.rows.values()]
      .filter((r) => r.ownerId === ownerId)
      .filter((r) =>
        projectId
          ? r.scope === "global" || (r.scope === "project" && r.projectId === projectId)
          : r.scope === "global",
      )
      .map(({ ownerId: _o, ...p }) => p);
  }

  async findOwner(id: string): Promise<string | null> {
    return this.rows.get(id)?.ownerId ?? null;
  }

  async upsert(ownerId: string, preset: Preset): Promise<Preset> {
    const scope = preset.scope ?? "global";
    const normalized: Preset = {
      ...preset,
      scope,
      ...(scope === "project" ? { projectId: preset.projectId } : { projectId: undefined }),
    };
    this.rows.set(preset.id, { ...normalized, ownerId });
    return normalized;
  }

  async remove(ownerId: string, id: string): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.ownerId !== ownerId) return false;
    this.rows.delete(id);
    return true;
  }

  async promote(ownerId: string, id: string): Promise<Preset | null> {
    const row = this.rows.get(id);
    if (!row || row.ownerId !== ownerId) return null;
    row.scope = "global";
    row.projectId = undefined;
    const { ownerId: _o, ...p } = row;
    return p;
  }
}

const OWNER = "owner-a";
const base = (over: Partial<Preset>): Preset => ({
  id: "p1",
  fieldType: "text",
  name: "Field",
  patch: {},
  ...over,
});

let repo: FakePresetRepo;
let presets: PresetsService;

beforeEach(() => {
  repo = new FakePresetRepo();
  presets = new PresetsService(repo);
});

describe("PresetsService", () => {
  it("a project sees global ∪ its own presets, not other projects'", async () => {
    await presets.save(OWNER, base({ id: "g", scope: "global", name: "Global" }));
    await presets.save(OWNER, base({ id: "a", scope: "project", projectId: "proj-a", name: "A" }));
    await presets.save(OWNER, base({ id: "b", scope: "project", projectId: "proj-b", name: "B" }));

    const inA = await presets.list(OWNER, "proj-a");
    expect(inA.map((p) => p.id).sort()).toEqual(["a", "g"]);

    const globalOnly = await presets.list(OWNER);
    expect(globalOnly.map((p) => p.id)).toEqual(["g"]);
  });

  it("rejects a project preset without a projectId (validation)", async () => {
    // `parsePreset` throws synchronously inside `save`; wrap so it surfaces as a rejection.
    await expect((async () => presets.save(OWNER, base({ scope: "project" })))()).rejects.toThrow();
  });

  it("does not leak presets across owners", async () => {
    await presets.save(OWNER, base({ id: "g", scope: "global" }));
    expect(await presets.list("intruder")).toEqual([]);
  });

  it("rejects an upsert that would overwrite another owner's preset id (409)", async () => {
    await presets.save(OWNER, base({ id: "shared", scope: "global", name: "Mine" }));
    await expect(
      presets.save("intruder", base({ id: "shared", scope: "global", name: "Hijack" })),
    ).rejects.toBeInstanceOf(ConflictException);
    // Owner A's preset is untouched.
    expect((await presets.list(OWNER))[0]?.name).toBe("Mine");
  });

  it("promote makes a project preset visible everywhere", async () => {
    await presets.save(OWNER, base({ id: "a", scope: "project", projectId: "proj-a" }));
    expect(await presets.list(OWNER)).toEqual([]); // not global yet
    const promoted = await presets.promote(OWNER, "a");
    expect(promoted.scope).toBe("global");
    expect(promoted.projectId).toBeUndefined();
    expect((await presets.list(OWNER, "proj-b")).map((p) => p.id)).toContain("a");
  });

  it("remove / promote a missing preset → 404", async () => {
    await expect(presets.remove(OWNER, "nope")).rejects.toBeInstanceOf(NotFoundException);
    await expect(presets.promote(OWNER, "nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});
