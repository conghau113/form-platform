import { type ArgumentMetadata, BadRequestException, ValidationPipe } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { CheckTransitionDto } from "./external/dto/check-transition.dto.js";
import { FormTemplateQueryDto } from "./external/dto/form-template.query.js";
import { CreateFolderDto } from "./folders/dto/create-folder.dto.js";
import { UpdateFolderDto } from "./folders/dto/update-folder.dto.js";
import { CreateProjectDto } from "./projects/dto/create-project.dto.js";
import { GrantMemberDto } from "./projects/dto/grant-member.dto.js";
import { SubmitDto } from "./submissions/dto/submit.dto.js";
import { ListWorkOrdersDto } from "./work-orders/dto/list-work-orders.dto.js";
import { AddParticipantDto } from "./workflows/dto/add-participant.dto.js";
import { AdvanceInstanceDto } from "./workflows/dto/advance-instance.dto.js";
import { AssignInstanceDto } from "./workflows/dto/assign-instance.dto.js";
import { UpdateWorkOrderDto } from "./workflows/dto/update-work-order.dto.js";

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

describe("Phase E work-order DTOs", () => {
  it("accepts an explicit assignee and an explicit null (unassign)", async () => {
    await expect(pipe.transform({ assigneeId: "usr_1" }, as(AssignInstanceDto))).resolves.toEqual({
      assigneeId: "usr_1",
    });
    await expect(pipe.transform({ assigneeId: null }, as(AssignInstanceDto))).resolves.toEqual({
      assigneeId: null,
    });
  });

  it("rejects a missing or misspelled assigneeId instead of silently doing nothing", async () => {
    // Without this, `{}` would reach the service as `undefined`: Prisma skips the column, so the
    // assignment never changes — yet an audit entry claims it did.
    await expect(pipe.transform({}, as(AssignInstanceDto))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      pipe.transform({ assigneeid: "usr_1" }, as(AssignInstanceDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("coerces work-order paging and rejects an oversized page", async () => {
    await expect(
      pipe.transform({ page: "2", pageSize: "50", sort: "createdAt" }, as(ListWorkOrdersDto)),
    ).resolves.toEqual({ page: 2, pageSize: 50, sort: "createdAt" });
    await expect(
      pipe.transform({ pageSize: "9999" }, as(ListWorkOrdersDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({ sort: "label" }, as(ListWorkOrdersDto))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("coerces the Phase E2 list filters and rejects an unknown priority", async () => {
    await expect(
      pipe.transform({ priority: "3", overdue: "true" }, as(ListWorkOrdersDto)),
    ).resolves.toEqual({ priority: 3, overdue: true });
    await expect(pipe.transform({ priority: "4" }, as(ListWorkOrdersDto))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(pipe.transform({ overdue: "yes" }, as(ListWorkOrdersDto))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("takes a partial work-order patch, including an explicit null deadline", async () => {
    await expect(pipe.transform({ priority: 1 }, as(UpdateWorkOrderDto))).resolves.toEqual({
      priority: 1,
    });
    // `null` clears the deadline; `undefined`/absent leaves it alone. Both must survive validation.
    await expect(pipe.transform({ dueAt: null }, as(UpdateWorkOrderDto))).resolves.toEqual({
      dueAt: null,
    });
    await expect(
      pipe.transform({ dueAt: "2026-08-15T09:00:00.000Z" }, as(UpdateWorkOrderDto)),
    ).resolves.toEqual({ dueAt: "2026-08-15T09:00:00.000Z" });
    await expect(
      pipe.transform({ dueAt: "tomorrow" }, as(UpdateWorkOrderDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects deadlines that are ISO-8601 but not usable instants", async () => {
    // All four pass `@IsISO8601()`, which is why this DTO does not use it. The first two are
    // unparseable by `Date` (they would reach Prisma as an Invalid Date → 500, not 400); the last
    // two carry no timezone, so `new Date()` would read them in the SERVER's local zone and store a
    // different instant depending on where the api runs.
    for (const dueAt of ["20260815", "2026-W33-1", "2026-08-15T09:00", "2026-08-15"]) {
      await expect(pipe.transform({ dueAt }, as(UpdateWorkOrderDto))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    // An offset — either form — is what makes a deadline mean one instant everywhere.
    await expect(
      pipe.transform({ dueAt: "2026-08-15T09:00:00+07:00" }, as(UpdateWorkOrderDto)),
    ).resolves.toEqual({ dueAt: "2026-08-15T09:00:00+07:00" });
  });

  it("STRIPS a `roles` claim from an advance body (Phase E3a escalation regression)", async () => {
    // The field is gone from the DTO, and `whitelist: true` means an old (or hostile) client sending
    // it gets it dropped rather than honoured. This is the pipe-level half of the fix; the service
    // half is that it no longer has a parameter to receive it.
    const out = (await pipe.transform(
      { action: "approve", roles: ["hr"] },
      as(AdvanceInstanceDto),
    )) as Record<string, unknown>;
    expect(out).toEqual({ action: "approve" });
    expect("roles" in out).toBe(false);
  });

  it("STRIPS a `roles` claim from a submit body too (Phase E3c — the other half)", async () => {
    // Same promise on the submissions side, and the same reason to pin it: `main.ts` deliberately
    // does NOT set `forbidNonWhitelisted`, so an old builder still sending `roles` keeps working
    // (silently ignored) instead of getting a 400. Turning that option on would break every stale
    // client — this test is what makes that a decision rather than an accident.
    const out = (await pipe.transform(
      { data: { email: "a@b.com" }, roles: ["hr"] },
      as(SubmitDto),
    )) as Record<string, unknown>;
    expect(out).toEqual({ data: { email: "a@b.com" } });
    expect("roles" in out).toBe(false);
  });

  it("accepts an identifier-shaped participant role code and rejects free text", async () => {
    await expect(
      pipe.transform({ roleCode: "hr_manager-2.a", userId: "u1" }, as(AddParticipantDto)),
    ).resolves.toEqual({ roleCode: "hr_manager-2.a", userId: "u1" });
    // Spaces, punctuation and emptiness are all out — the code lands in responses and audit entries.
    for (const roleCode of ["hr manager", "hr;drop", "", "  ", "quản lý", "a".repeat(65)]) {
      await expect(
        pipe.transform({ roleCode, userId: "u1" }, as(AddParticipantDto)),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(pipe.transform({ roleCode: "hr" }, as(AddParticipantDto))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("normalises ?formCode= to either a trimmed code or nothing at all", async () => {
    // P2-0. Whichever of the two it becomes decides between "serve this template" and "refuse,
    // because the ticket type has several" — and both answers are a bare 404 to the caller, so a
    // slip here is invisible from outside.
    await expect(
      pipe.transform({ ticketTypeCode: "PCT", formCode: " CPCT " }, as(FormTemplateQueryDto)),
    ).resolves.toEqual({ ticketTypeCode: "PCT", formCode: "CPCT" });

    for (const formCode of ["", "   "]) {
      const out = (await pipe.transform(
        { ticketTypeCode: "PCT", formCode },
        as(FormTemplateQueryDto),
      )) as Record<string, unknown>;
      expect(out).toEqual({ ticketTypeCode: "PCT" });
    }

    // A repeated ?formCode=a&formCode=b arrives as an array: 400, never one of them by accident.
    await expect(
      pipe.transform(
        { ticketTypeCode: "PCT", formCode: ["CPCT", "CT_PCT_PDF"] },
        as(FormTemplateQueryDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("lets check-transition's free-form payloads through the whitelist intact", async () => {
    // P4b/R12. `whitelist: true` drops any property without a decorator, and EVN's `ticketData`
    // arrives in a shape we do not model (their reader takes `ticket_items.value.data`). If it were
    // silently emptied here, every guard reading it would pass vacuously — a fail-open that looks
    // exactly like a clean run. Nested contents survive because nothing declares `@ValidateNested`
    // on these two, so the pipe does not recurse into them.
    const out = (await pipe.transform(
      {
        ticketId: 123,
        ticketTypeCode: "PCT",
        currentStatusCode: "PCT_S_HANDOVERED",
        actionCode: "PCT_A_END",
        executorUserCode: "emp001",
        ticketData: { PARTICIPANTS_WORKSITE: { data: [{ userCode: "emp002", MARKED: true }] } },
        information: { listEmployee: [{ userCode: "emp003" }] },
        // `definitionVersion` reaches the service from P4d-1 — it is what the caller pins (QĐ-6).
        definitionVersion: "sha256:deadbeef",
        // `participants` is still a field the design sketch carries and nothing decides with:
        // dropped, on purpose. It is also the probe proving the whitelist has not simply been
        // switched off — without it, "the pin arrives" and "nothing is filtered" look identical.
        participants: [{ userCode: "emp003", statusCode: "TICKET_EMPLOYEE_CHECKIN" }],
      },
      as(CheckTransitionDto),
    )) as Record<string, unknown>;

    expect(out.ticketData).toEqual({
      PARTICIPANTS_WORKSITE: { data: [{ userCode: "emp002", MARKED: true }] },
    });
    expect(out.information).toEqual({ listEmployee: [{ userCode: "emp003" }] });
    expect(out.definitionVersion).toBe("sha256:deadbeef");
    expect("participants" in out).toBe(false);
  });

  it.each([
    ["a newline, which would forge a second line in a log", "pct-1234\nSomething they did not say"],
    // The backtick is the character that actually matters: the value is interpolated INSIDE
    // backticks in the contract sentence, so it is the one that can end the quoting.
    ["a backtick, which closes the quoting in `message`", "pct-1234`"],
    ["a space", "pct-1234 and then some"],
    ["semver build metadata, which we do not emit", "1.0.0+build.1"],
    ["a non-ASCII letter", "pct-đá"],
    // `@IsOptional()` skips `null`/`undefined` only, so the empty string really is validated. The
    // partner doc says so: not pinning means omitting the field, not sending "".
    ["the empty string — omit the field instead", ""],
  ])("rejects a pinned definition version carrying %s", async (_why, definitionVersion) => {
    // The pin is echoed verbatim into contract text an integrator reads in a log. `@MaxLength(100)`
    // alone admits every one of these, so the shape is constrained even though the VALUE is
    // deliberately not checked against our own format — a caller may pin a version this build has
    // never heard of, and that must still be answerable.
    await expect(
      pipe.transform(
        {
          ticketId: 1,
          ticketTypeCode: "PCT",
          currentStatusCode: "PCT_S_MODERATION",
          actionCode: "PCT_A_WORKING",
          executorUserCode: "emp001",
          definitionVersion,
        },
        as(CheckTransitionDto),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("accepts a pin naming a version this build has never held", async () => {
    const out = (await pipe.transform(
      {
        ticketId: 1,
        ticketTypeCode: "PCT",
        currentStatusCode: "PCT_S_MODERATION",
        actionCode: "PCT_A_WORKING",
        executorUserCode: "emp001",
        definitionVersion: "pct-0000000000000000",
      },
      as(CheckTransitionDto),
    )) as Record<string, unknown>;
    expect(out.definitionVersion).toBe("pct-0000000000000000");
  });

  it("rejects a check-transition body whose scalars are the wrong shape", async () => {
    // The four code fields are what the endpoint looks its answer up by, and `ticketId` is what
    // EVN's own spec sends as a number. Each is one decorator away from accepting anything.
    const valid = {
      ticketId: 1,
      ticketTypeCode: "PCT",
      currentStatusCode: "PCT_S_WORKING",
      actionCode: "PCT_A_ALLOW",
      executorUserCode: "emp001",
    };
    const bad: Array<Record<string, unknown>> = [
      { ticketId: "123" },
      { ticketTypeCode: 42 },
      { actionCode: "x".repeat(101) },
      { executorUserCode: null },
    ];
    for (const override of bad) {
      await expect(
        pipe.transform({ ...valid, ...override }, as(CheckTransitionDto)),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it("validates ticketRoles element by element rather than waving the array through", async () => {
    await expect(
      pipe.transform(
        {
          ticketId: 1,
          ticketTypeCode: "PCT",
          currentStatusCode: "PCT_S_WORKING",
          actionCode: "PCT_A_ALLOW",
          executorUserCode: "emp001",
          ticketRoles: [{ roleCode: "PCT_R_CHO_PHEP", userCode: 42 }],
        },
        as(CheckTransitionDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
