import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { FormSchema } from "@org/form-schema";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { AuditRepo } from "../../persistence/repositories/audit.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ExternalIntegrationRepo } from "../../persistence/repositories/external-integration.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { FormRepo } from "../../persistence/repositories/form.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { FormVersionRepo } from "../../persistence/repositories/form-version.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ProjectRepo } from "../../persistence/repositories/project.repo.js";
import type { ExternalCaller } from "./api-key.guard.js";
import { redactForExternal } from "./sanitize.js";

/**
 * What `GET /external/form-template` answers with.
 *
 * ⚠️ `body` is still the **platform's own form contract**, not EVN's `items[]` shape, and this
 * envelope is therefore PROVISIONAL. The mapping to §12.B is deliberately not guessed here: it needs
 * the `type` → `typeCode` table and the `code`/`itemCode` decision that are open as Q4, and
 * inventing either would bake a wrong vocabulary into the wire format. Do not issue a production key
 * against this shape — an integrator who builds on it will be broken by D1.
 *
 * What is NOT provisional: the body is already run through {@link redactForExternal}, so tenant Role
 * codes and internal endpoint URLs never leave regardless of when the mapper lands.
 */
export interface ExternalFormTemplate {
  ticketTypeCode: string;
  /** The caller's own form code, echoed from the binding so they can correlate. */
  externalFormCode: string;
  /** Our form id + the resolved publish sequence number, echoed per §12 constraint 5. */
  formId: string;
  version: number;
  body: FormSchema;
}

/**
 * Read side of the EVN §12 integration surface (D0-a/D1).
 *
 * Every method takes the `tenantId` the {@link ApiKeyGuard} authenticated, and every failure is a
 * 404 — "wrong tenant", "no such binding" and "never published" must be one answer, or the endpoint
 * becomes an existence oracle for another tenant's configuration.
 */
@Injectable()
export class ExternalService {
  private readonly logger = new Logger(ExternalService.name);

  constructor(
    private readonly integrations: ExternalIntegrationRepo,
    private readonly forms: FormRepo,
    private readonly versions: FormVersionRepo,
    private readonly projects: ProjectRepo,
    private readonly audit: AuditRepo,
  ) {}

  async getFormTemplate(
    caller: ExternalCaller,
    ticketTypeCode: string,
    version?: number,
    externalFormCode?: string,
  ): Promise<ExternalFormTemplate> {
    const { tenantId } = caller;
    const matches = await this.integrations.findTicketTypeMaps(
      tenantId,
      ticketTypeCode,
      externalFormCode,
    );
    // Exactly one, or nothing. Two matches means the caller asked for "PCT" on a tenant that binds
    // several PCT templates and did not say which — answering with either one would make the reply
    // depend on row order, and serving the PDF variant where the create-ticket form was meant is a
    // failure the caller cannot even see. They re-ask with `?formCode=`.
    //
    // Why the *same* 404 and not a distinct "ambiguous" reply: not for secrecy. Ambiguity is a
    // same-tenant condition — the caller is authenticated to this tenant and the query is scoped to
    // it, so naming it would disclose nothing about anyone else's configuration. It is a uniformity
    // decision: one failure shape for this whole surface is cheap to keep honest as endpoints C and
    // D land, and carve-outs are what erode it. Revisit it on evidence, not on principle.
    //
    // The cost is real, so it is paid on our side rather than theirs: §12.B as EVN specified it has
    // no `?formCode=` at all, so their first PCT call will read "Unknown ticket type" while
    // pointing at a contract disagreement. Hence the warning below — nothing reaches the caller,
    // but the answer is one grep away instead of a multi-hour dead end between two teams. The
    // behaviour itself is the answer to B2 in `docs/expansion/evn-integration-questions.md`, and
    // still awaits their reply.
    if (matches.length > 1) {
      // `keyId` identifies *which* integrator is calling it wrong — the same actor the audit trail
      // records. Expect this to be noisy while §12.B has no `formCode` in it: every EVN PCT call
      // built to their spec lands here, and that volume is itself the measurement.
      this.logger.warn(
        `Ambiguous form-template request from key ${caller.keyId}: tenant ${tenantId} binds ` +
          `${matches.length} templates for ticket type "${ticketTypeCode}" and the request named ` +
          "no formCode",
      );
    }
    const map = matches.length === 1 ? matches[0] : undefined;
    if (!map) throw new NotFoundException("Unknown ticket type");

    // Second tenancy layer. The binding is already tenant-scoped, but `FormRepo`/`FormVersionRepo`
    // take no tenant argument and this path never passes through `requireAccess` — so a single
    // mis-seeded row would otherwise hand another tenant's form out. Re-derive the owner from the
    // form's own project and insist it matches.
    await this.assertFormBelongsToTenant(map.formId, tenantId);

    const resolved =
      version === undefined
        ? await this.versions.loadActive(map.formId)
        : await this.versions.load(map.formId, version);
    // Covers both "that version number does not exist" and "this form was never published":
    // an unpublished draft has no frozen snapshot, and the integration must never read a draft.
    if (!resolved) throw new NotFoundException("Unknown ticket type");

    // Awaited, not fire-and-forget — matching `RbacService`. An audit trail that can silently drop
    // entries answers "who read our form templates" with a maybe, which is worse than a failed read.
    // Only successful reads are recorded: a 404 reveals nothing and logging misses would let an
    // unauthenticated-ish caller spam the trail.
    await this.audit.record({
      tenantId,
      actorId: caller.keyId,
      action: "external.form-template.read",
      targetType: "form",
      targetId: map.formId,
      // `externalFormCode` is part of the record because the ticket type alone no longer identifies
      // what was read (P2-0) — "who read our PCT template" has six possible answers. It is the
      // caller's own vocabulary, so recording it discloses nothing they did not send.
      detail: {
        ticketTypeCode: map.ticketTypeCode,
        externalFormCode: map.externalFormCode,
        version: resolved.version,
      },
    });

    return {
      ticketTypeCode: map.ticketTypeCode,
      externalFormCode: map.externalFormCode,
      formId: map.formId,
      version: resolved.version,
      // Redaction happens here, once, on the way out — see `sanitize.ts` for what goes and why.
      body: redactForExternal(resolved.body),
    };
  }

  /** Throws 404 unless `formId` resolves to a project owned by `tenantId`. */
  private async assertFormBelongsToTenant(formId: string, tenantId: string): Promise<void> {
    const summary = await this.forms.findSummary(formId);
    if (!summary) throw new NotFoundException("Unknown ticket type");
    const project = await this.projects.findById(summary.projectId);
    if (!project || project.tenantId !== tenantId) {
      throw new NotFoundException("Unknown ticket type");
    }
  }
}
