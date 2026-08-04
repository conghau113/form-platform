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
   * Resolve one binding, scoped to the authenticated tenant. `tenantId` is part of the query rather
   * than something the caller checks afterwards: a lookup by `ticketTypeCode` alone would return
   * another tenant's row and leak its existence through the response.
   */
  abstract findTicketTypeMap(
    tenantId: string,
    ticketTypeCode: string,
  ): Promise<ExternalTicketTypeMapRecord | null>;
}
