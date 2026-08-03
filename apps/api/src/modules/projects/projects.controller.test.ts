import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActorRolesService } from "./actor-roles.service.js";
import { ProjectsController } from "./projects.controller.js";
import type { ProjectsService } from "./projects.service.js";

/**
 * `GET /projects/:id/my-roles` (Phase E3c). Stubs rather than fakes: the route's whole job is to
 * make the access decision BEFORE the derivation, and that order is the only thing worth pinning —
 * what each collaborator returns is already covered by their own tests.
 */
describe("ProjectsController.myRoles (Phase E3c)", () => {
  const requireAccess = vi.fn();
  const forProject = vi.fn();
  let controller: ProjectsController;

  beforeEach(() => {
    requireAccess.mockReset().mockResolvedValue({ id: "p1" });
    forProject.mockReset().mockResolvedValue(["editor", "hr"]);
    controller = new ProjectsController(
      { requireAccess } as unknown as ProjectsService,
      {
        forProject,
      } as unknown as ActorRolesService,
    );
  });

  it("returns the roles the server derives, after checking the caller can open the project", async () => {
    await expect(controller.myRoles("u1", "p1")).resolves.toEqual({ roles: ["editor", "hr"] });
    expect(requireAccess).toHaveBeenCalledWith("u1", "p1", "viewer");
    expect(forProject).toHaveBeenCalledWith("u1", "p1");
  });

  // The E3a lesson: `forProject` hands back the names of tenant `Role`s. If the access check ran
  // after it — or not at all — a stranger would learn a workspace's role vocabulary from a 404 body.
  it("never derives roles for someone who cannot open the project", async () => {
    requireAccess.mockRejectedValue(new NotFoundException("Project not found: p1"));

    await expect(controller.myRoles("stranger", "p1")).rejects.toBeInstanceOf(NotFoundException);
    expect(forProject).not.toHaveBeenCalled();
  });
});
