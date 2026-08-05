/**
 * Persistence boundary for the `/external/*` integration surface (EVN §12, D0-a; D4: services
 * depend on this interface, never on Prisma).
 *
 * Two concerns, one repo because they are only ever used together — authenticate the caller, then
 * resolve what that caller is allowed to ask about.
 */

/** An API key row as the repo layer exposes it. The digest never leaves this boundary. */
export interface ExternalApiKeyRecord {
  id: string;
  tenantId: string;
  label: string;
  revokedAt: Date | null;
}

/** A ticket-type binding: the caller's vocabulary on the left, ours on the right. */
export interface ExternalTicketTypeMapRecord {
  id: string;
  tenantId: string;
  ticketTypeCode: string;
  formId: string;
  externalFormCode: string;
  workflowId: string | null;
}

export abstract class ExternalIntegrationRepo {
  /**
   * Authenticate by digest — the caller's raw key is hashed by the guard and never reaches here.
   * Returns `null` for both "no such key" and "revoked", so the guard cannot accidentally
   * distinguish them in its response.
   */
  abstract findActiveKeyByHash(tokenHash: string): Promise<ExternalApiKeyRecord | null>;
  /**
   * Resolve the bindings for one ticket type, scoped to the authenticated tenant. `tenantId` is
   * part of the query rather than something the caller checks afterwards: a lookup by
   * `ticketTypeCode` alone would return another tenant's row and leak its existence through the
   * response.
   *
   * Returns a list, not one row, because a ticket type legitimately has several templates behind it
   * (P2-0). `externalFormCode` narrows to exactly one; omitting it asks for all of them, and it is
   * the *service* that decides an ambiguous answer is a refusal — a repo that silently picked the
   * first row would make the endpoint depend on row order.
   */
  abstract findTicketTypeMaps(
    tenantId: string,
    ticketTypeCode: string,
    externalFormCode?: string,
  ): Promise<ExternalTicketTypeMapRecord[]>;
}
