-- EVN §12, step P2-0: fix a wrong constraint that D0-a already shipped.
--
-- D0-a made `(tenantId, ticketTypeCode)` unique on the belief that one ticket type resolves to one
-- form. Measuring EVN's own `public/files/templateJSON` disproved it: their PCT ticket type is
-- backed by six templates (`CPCT`, `CT_PCT`, `CT_PCT_M`, `CT_PCT_PDF`, `CT_PCT_W_ACTION`,
-- `WORKFLOW_PCT`), all carrying `formTypeCode = PCT`. Under the old key a tenant could seed only
-- one of them.
--
-- The caller's own form code becomes part of the key rather than being dropped from it: resolution
-- must still be deterministic, so `(tenant, ticketType, formCode)` identifies exactly one row and
-- `GET /external/form-template` refuses — 404, it does not guess — when `?formCode=` is missing and
-- more than one row matches.
--
-- Safe on a database with rows: every existing row was unique on two columns, so it is still unique
-- on three, and dropping a constraint cannot fail on data.
--
-- Deploy order, precisely — the migration is compatible in both directions, the *seeding* is not:
--   * an older build reading is fine while every ticket type still has one binding: it queries by
--     two columns and finds its single row. Add a second `--external-code` and that same query
--     silently returns whichever row Postgres yields first — exactly the bug this exists to kill.
--     So: migrate whenever, but do not bind a second template until every instance runs the new
--     build.
--   * an older `seed-external-key.ts` writing is NOT fine: its upsert names the two-column
--     conflict target, which no longer exists. It fails loudly (Postgres 42P10) rather than
--     corrupting anything, but script and migration belong in the same deploy.
--
-- The index is named explicitly because Prisma's default name for these three columns is
-- "ExternalTicketTypeMap_tenantId_ticketTypeCode_externalFormCode_key" = 66 characters, which
-- Postgres would silently truncate to 63.

-- DropIndex
DROP INDEX "ExternalTicketTypeMap_tenantId_ticketTypeCode_key";

-- CreateIndex
CREATE UNIQUE INDEX "ExternalTicketTypeMap_binding_key" ON "ExternalTicketTypeMap"("tenantId", "ticketTypeCode", "externalFormCode");
