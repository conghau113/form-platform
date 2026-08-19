-- E3b (parallel track): optimistic concurrency on the case body.
--
-- `advance` is a read-modify-write (load body → run engine → write body) with nothing guarding the
-- gap. `body` carries `history` AND `tokens`, so two overlapping advances do not lose a field — the
-- later write drops a whole state change, and with multi-token (E3a) it drops a whole BRANCH, with
-- no error anywhere. `rev` makes the write conditional on the value that was read.
--
-- Additive and safe on existing rows: the DEFAULT backfills every case to 0 inside the ALTER, so
-- there is no separate UPDATE, no constraint change and no index — the counter is only ever read
-- through the primary-key row that is already being fetched.

-- AlterTable
ALTER TABLE "WorkflowInstanceRecord" ADD COLUMN "rev" INTEGER NOT NULL DEFAULT 0;
