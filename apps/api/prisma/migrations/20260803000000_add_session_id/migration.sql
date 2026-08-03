-- Phase P5 (product-roadmap A2): make the *access* token revocable via a session id.
--
-- Until now `logout` / `logout-all` / password change only revoked refresh tokens; an already-issued
-- access token stayed valid for its full 15 minutes. `sessionId` groups every token one sign-in
-- rotates through, rides in the JWT as `sid`, and lets the auth guard check "does this session still
-- have a live row?" on each request.
--
-- Backfill maps every existing row to its own single-token session (`sessionId = id`), which is
-- exactly what those rows mean today: no rotation history is grouped, so each is its own session.
-- Written as add-nullable → backfill → SET NOT NULL so no existing row is rejected mid-migration.
--
-- Access tokens minted before this migration carry no `sid` and stop being accepted. That is not a
-- logout: the browser's refresh cookie is untouched, and `apiFetch` turns the one 401 into a silent
-- refresh. Non-browser `Bearer` clients sign in once more.

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN "sessionId" TEXT;

UPDATE "RefreshToken" SET "sessionId" = "id" WHERE "sessionId" IS NULL;

ALTER TABLE "RefreshToken" ALTER COLUMN "sessionId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "RefreshToken_sessionId_idx" ON "RefreshToken"("sessionId");
