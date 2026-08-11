import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { type FormSchema, migrate } from "@org/form-schema";
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
import { type CheckTransitionResult, decideTransition } from "./check-transition.js";
import type { CheckTransitionDto } from "./dto/check-transition.dto.js";
import { type EvnFormTemplate, toEvnTemplate } from "./evn-template.js";

/**
 * What `GET /external/form-template` answers with.
 *
 * `template` is EVN's own document shape — the same one `CreateFormDto` parses and the shipped
 * `templateJSON` files carry — not our form contract. It replaced a provisional `body: FormSchema`
 * in P2b; nothing should still be reading that field.
 *
 * `warnings` is not decoration. The export is lossy in ways the caller cannot see from the payload:
 * a field's role permissions, its visibility condition and its validation rules do not survive the
 * crossing, and several controls map to a near neighbour rather than an equivalent. Anything we drop
 * or bend is named here rather than left to be discovered in production.
 */
export interface ExternalFormTemplate {
  ticketTypeCode: string;
  /** The caller's own form code, echoed from the binding so they can correlate. */
  externalFormCode: string;
  /** Our form id + the resolved publish sequence number, echoed per §12 constraint 5. */
  formId: string;
  version: number;
  template: EvnFormTemplate;
  /** Human-readable, in the tenant's language. Empty when the form crosses over intact. */
  warnings: string[];
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

    // ⚠️ ORDERING IS LOAD-BEARING, twice over — do not move this block.
    //
    // It sits AFTER `assertFormBelongsToTenant` and after the version resolves, so a caller can
    // never reach a 422 for a form that is not theirs. A 422 says "this form exists and is yours but
    // cannot be exported", which on someone else's form would confirm the form exists — the exact
    // existence oracle every 404 above is shaped to deny. `external.service.test.ts` asserts the
    // cross-tenant case still answers 404 even when the body is unexportable.
    //
    // It sits BEFORE `audit.record`, so a failed export is not recorded as a read. That matches the
    // rule the audit call already follows ("only successful reads"). Arguable the other way — a 422
    // is an authenticated lookup that found the binding — but if that changes, swap the order
    // deliberately rather than letting a refactor decide it.
    const exported = toEvnTemplate(
      this.migrateSnapshot(resolved.body, map.formId, resolved.version),
      {
        formTypeCode: map.ticketTypeCode,
        formCode: map.externalFormCode,
        // `null` (never stated) becomes `undefined` (omit + warn). The exporter must not have to know
        // that a database column is how "not stated" is spelled.
        formTypeName: map.ticketTypeName ?? undefined,
      },
    );
    if (!exported.ok) {
      // The body names only OUR field names and OUR reasons — no tenant Role codes, and none of the
      // receiver's vocabulary. It is the one non-404 on this surface, and that is deliberate: an
      // opaque failure here would leave the tenant unable to tell a misconfigured binding from a
      // form they simply have to edit.
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: "Form cannot be exported",
        errors: exported.errors,
      });
    }

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
      template: exported.template,
      warnings: exported.warnings,
    };
  }

  /**
   * §12.C — the transition verdict (P4b).
   *
   * Takes no `caller` and touches no repository, unlike every other method here. The transition
   * table is EVN's own data, identical for every tenant, so there is nothing to scope and nothing to
   * read; `ApiKeyGuard` has already established the caller may ask. It is also why nothing is
   * written to the audit trail: this is called on every action a user considers, and recording each
   * one would turn an audit of "who read our form templates" into an access log.
   *
   * ⚠️ "Touches no repository" is true of this METHOD, not of the request. `ApiKeyGuard` still costs
   * a database round-trip per call (`api-key.guard.ts`), and the global throttler still counts the
   * call against 120/60s per IP. Neither belongs in the sentence we send outward about C being
   * cheap — see the operating note in `docs/expansion/evn-integration-questions.md` §8.
   *
   * ⚠️ `undefined`, not `[]`, when the request omits `ticketRoles`. The two mean different things
   * downstream — `[]` is "we asked, the ticket carries no roles" and resolves a tie-break, while
   * `undefined` is "we were not told" and refuses to — so collapsing them here would turn a
   * deliberate non-answer into a silent guess.
   */
  checkTransition(dto: CheckTransitionDto): CheckTransitionResult {
    return decideTransition({
      ticketTypeCode: dto.ticketTypeCode,
      currentStatusCode: dto.currentStatusCode,
      actionCode: dto.actionCode,
      executorUserCode: dto.executorUserCode,
      ticketRoles: dto.ticketRoles,
    });
  }

  /**
   * Bring a frozen snapshot up to `CURRENT_FORM_VERSION` before we read it as a form.
   *
   * Every other consumer of a frozen body already does this (`form-versions.service.ts`,
   * `submissions.service.ts`, `workflow-instances.service.ts`). This path was the one raw reader,
   * which was harmless while it handed the body straight back for the caller to migrate — from P2b
   * *we* are the consumer, so reading raw would mean exporting a pre-migration shape. Concretely:
   * a v2 snapshot spells "hidden" as `show: false`, and only the 2->3 migration turns that into the
   * `visibleWhen` that `toEvnTemplate` knows to warn about — so a field the author deliberately hid
   * would cross over visible, with `warnings` completely silent about it.
   *
   * It is also what makes `toEvnTemplate`'s `FormSchema` parameter true rather than aspirational:
   * `migrate()` ends in `formSchema.parse`, so a container without `children` or a `type` outside
   * the union is rejected here instead of becoming a `TypeError` deep in the walk.
   *
   * Failure is deliberately NOT 422. Publishing already migrates before freezing, so a stored body
   * that will not parse is not something the tenant can cause or fix by editing their form — it
   * means this node is older than the document (a rolling deploy) or the row is damaged. Telling
   * them to fix a form that is fine would send them chasing the wrong thing.
   */
  private migrateSnapshot(body: unknown, formId: string, version: number): FormSchema {
    try {
      return migrate(body);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Frozen snapshot for form ${formId}@${version} does not migrate to the current form ` +
          // Truncated on purpose. `fieldNodeSchema` is a 33-member recursive `z.union`, not a
          // discriminated one, so a ZodError carries every branch's complaint: ~27 KB for the
          // smallest failing form (measured, and flat in form size — the union blows up, not the
          // tree). This is a machine-to-machine surface an integrator can poll, and the condition
          // that reaches here is a persistent one, so the untruncated line would bury the rest of
          // the log at exactly the moment someone is reading it. The head names the first issue,
          // which is the part worth having.
          `version: ${detail.length > 600 ? `${detail.slice(0, 600)}… (${detail.length} chars)` : detail}`,
      );
      throw new InternalServerErrorException("Form template is temporarily unavailable");
    }
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
