-- EVN §12, step P2b: give the binding somewhere to hold the ticket type's display name.
--
-- The export has to produce `formTypeName`, and there is no honest way to derive one:
--   * EVN's `FormType.name` is NOT NULL (`form-type.entity.ts:10`, DDL generated from the entity
--     because `synchronize: true` off-production), so omitting it makes the first ingest of a
--     ticket type they do not yet have fail with a constraint violation.
--   * `saveFormType` (`forms.service.ts:57-65`) upserts by `code`, so sending a made-up name —
--     including the code itself — OVERWRITES the display name of a ticket type they already have.
--     "PCT" would replace "Công Tác" on their screens.
--
-- So the tenant states it and the platform never guesses. Nullable on purpose: a binding seeded
-- before this column existed keeps working, the export simply omits `formTypeName` and warns.
--
-- Purely additive: no backfill, no default, no constraint change. Existing rows read as NULL, which
-- is exactly the "not stated" case the exporter already handles.

-- AlterTable
ALTER TABLE "ExternalTicketTypeMap" ADD COLUMN "ticketTypeName" TEXT;
