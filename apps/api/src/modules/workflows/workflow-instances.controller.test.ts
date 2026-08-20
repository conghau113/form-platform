import { UnprocessableEntityException } from "@nestjs/common";
import type { WorkflowInstance } from "@org/workflow-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CaseCommentsService } from "./case-comments.service.js";
import type { CaseParticipantsService } from "./case-participants.service.js";
import { WorkflowInstancesController } from "./workflow-instances.controller.js";
import type { WorkflowInstancesService } from "./workflow-instances.service.js";

/**
 * `POST /workflow-instances/:id/advance` — the controller layer alone (E3c, parallel track).
 *
 * It exists because nothing else measures this hop. The service tests build their options object by
 * hand, and the `ValidationPipe` tests stop at the DTO, so deleting `token: dto.token` from the
 * controller left every one of them green while a caller's chosen branch vanished on the way in.
 *
 * A stub service, not a fake graph: the only claims here are about what this method forwards and
 * what it does with what comes back.
 */
describe("WorkflowInstancesController.advance (E3c, parallel track)", () => {
  const advance = vi.fn();
  let controller: WorkflowInstancesController;

  beforeEach(() => {
    advance.mockReset().mockResolvedValue({ id: "c1" } as WorkflowInstance);
    controller = new WorkflowInstancesController(
      { advance } as unknown as WorkflowInstancesService,
      {} as unknown as CaseCommentsService,
      {} as unknown as CaseParticipantsService,
    );
  });

  it("forwards the branch the caller named", async () => {
    await controller.advance("u1", "c1", { action: "approve", token: "t2" });

    expect(advance).toHaveBeenCalledWith("u1", "c1", {
      action: "approve",
      data: undefined,
      token: "t2",
    });
  });

  it("forwards no branch when the caller named none", async () => {
    // The other half of the pair: a controller that invented a token — or defaulted one — would
    // turn "move whichever branch can" into "move this one", silently, for every case running today.
    await controller.advance("u1", "c1", { action: "submit" });

    expect(advance).toHaveBeenCalledWith("u1", "c1", {
      action: "submit",
      data: undefined,
      token: undefined,
    });
  });

  it("lets the engine's 422 through untouched rather than reshaping it as a 400", async () => {
    // `ambiguous-token` and `unknown-token` are only useful to a client if the `reason` survives the
    // catch-all below them; an `HttpException` is re-thrown as-is on purpose.
    const refusal = new UnprocessableEntityException({
      message: "Cannot advance instance: ambiguous-token",
      reason: "ambiguous-token",
    });
    advance.mockRejectedValue(refusal);

    await expect(controller.advance("u1", "c1", { action: "approve" })).rejects.toBe(refusal);
  });
});
