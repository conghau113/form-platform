# Production Hardening — CI/CD · Build/Test · Security · Deploy

> **Living progress tracker.** Cập nhật file này SAU MỖI PHASE (đánh dấu ✅, ghi commit hash,
> ghi gotcha) cùng với memory `session-resume-production-hardening.md`, rồi owner `/clear` và
> mở session mới. Đây là nguồn-sự-thật cho track; bản plan duyệt gốc nằm ở
> `~/.claude/plans/ticklish-percolating-summit.md`.

- **Branch:** `feat/production-hardening` (tạo từ `feat/workflow-editor-v2`, KHÔNG off main — để
  bọc quanh code feature mới nhất). Owner gate push (chưa push).
- **Mở:** 2026-06-30. **Owner contract:** chính xác > nhanh; mỗi phase = 1 commit; verify bằng
  chạy thật, không khẳng định suông.

## Mục tiêu
Đưa repo (monorepo Turbo+pnpm, 11 packages + 3 apps, 135 test) lên chuẩn production. Mục tiêu kép:
app **standalone deploy được** VÀ packages **nhúng được** vào project khác. Đối chiếu free-for.dev
(dữ liệu thật) + khớp toolset owner (Postgres + Docker Desktop + DataGrip; kinh nghiệm
Jenkins/SonarQube/BlackDuck/GitLab; đang dùng GitHub + Vercel).

## Quyết định đã chốt (Q&A owner)
1. **Lộ trình theo phases:** Phase 1 = hạ tầng kỹ thuật; Phase 2 = auth thật + sản phẩm.
2. **Auth thật ĐỂ SAU** — đợt này giữ seam `x-owner-id` (default `"local"`), chỉ hardening hạ tầng.
3. **Deploy = Docker Compose self-host** (dùng Postgres+Docker sẵn có; Dockerfile tái dùng nếu lên cloud).
4. **Publish packages ĐỂ SAU** — ưu tiên app deploy được trước.

---

## Bảng tiến độ

| Phase | Nội dung | Trạng thái | Commit |
|---|---|---|---|
| **1A** | Repo hygiene (engines/.nvmrc/LICENSE, gitignore .env, env.example, de-hardcode API_BASE) | ✅ DONE | `89e0c06` |
| **1B** | DB SQLite → PostgreSQL (provider + reset migrations + sửa test) | ✅ DONE | `0929697` |
| **1C** | Containerization (Dockerfile api+builder, docker-compose, .dockerignore) | ✅ DONE | `aa22288` |
| **1D** | Security hardening hạ tầng (ConfigModule+env-validate, CORS allowlist, helmet, throttler, /health) | ⬜ TODO | — |
| **1E** | CI/CD (GitHub Actions + CodeQL + Dependabot + SonarCloud + gitleaks + Trivy + changeset gate) | ⬜ TODO | — |
| **2** | Auth thật + authorization + multi-tenant (phác thảo, làm sau) | ⬜ LATER | — |

Legend: ✅ done · 🟡 đang làm · ⬜ chưa · ⏭️ later.

---

## Phase 1 — Hạ tầng kỹ thuật

### ✅ 1A — Repo hygiene & chuẩn hóa cấu trúc — DONE `89e0c06`
- [x] root `package.json`: `engines{node>=20,pnpm>=9}` + `license:"UNLICENSED"`
- [x] `.nvmrc` = `20`; `LICENSE` proprietary
- [x] `.gitignore`: ignore `.env`/`.env.*` (giữ `env.example`) + `structure.txt`
- [x] `apps/api/env.example` (DATABASE_URL/PORT/CORS_ORIGINS/AI_* — tên biến từ `ai.config.ts`)
- [x] `apps/builder/env.example` (VITE_API_BASE)
- [x] `apps/builder/src/presets/config.ts`: `API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3001"`
- [x] `apps/builder/src/vite-env.d.ts`: typed `ImportMetaEnv.VITE_API_BASE` (tránh `any`)
- **Verify:** builder typecheck PASS · biome chỉ CRLF (blob commit LF) · no packages/* ⇒ no changeset.
- **Gotcha:** `.env.example` bị deny rule `**/.env.*` trong settings.json → dùng tên `env.example`. `core.autocrlf=true` → biome local báo CRLF nhưng commit LF (đã chứng minh `git show :file|grep -c CR`=0).

### ✅ 1B — DB SQLite → PostgreSQL (`apps/api`) — DONE `0929697`
- [x] `prisma/schema.prisma`: `provider` `"sqlite"` → `"postgresql"` (+ header comment). Schema portable (chỉ `Json/DateTime/String/Int/cuid()`, KHÔNG native `@db.*`) → đổi an toàn. `PrismaService` đọc `DATABASE_URL` từ env (không override).
- [x] Reset migrations: xóa 9 migration cũ sqlite-bound → squash thành 1 `20260630075905_init` (PG dialect: `TIMESTAMP(3)`, `JSONB`×7) + `migration_lock.toml` provider=`postgresql`. Tạo bằng `prisma migrate dev --name init` trên Postgres tạm (docker `postgres:16-alpine`). Chưa có PG production ⇒ không cần giữ history.
- [x] **Viết lại `import-files-to-db.test.ts`** dùng **Testcontainers** (`@testcontainers/postgresql`) thay SQLite tạm: `beforeAll` start `PostgreSqlContainer("postgres:16-alpine")` → `getConnectionUri()` → `prisma db push --skip-generate` → fixtures; `afterAll` disconnect+`container.stop()`. Guard `describe.skipIf(!hasDocker())` (probe `docker info` đồng bộ lúc collection — khớp pattern `skipIf` repo) để `pnpm test` không vỡ nơi thiếu Docker.
- [x] (Các test khác dùng FakeRepo in-memory → không đổi.)
- **Verify:** `pnpm --filter @app/api test` = **114 PASS** (gồm import test chạy THẬT trên PG container ~15s, KHÔNG skip) · api typecheck PASS · biome sạch (file đổi) · reviewer PASS.
- **Gotcha:** (1) `prisma generate` **EPERM** rename query-engine DLL khi api dev server đang giữ DLL → phải kill PID api (3001) trước generate; provider bị bake vào client nên BẮT BUỘC regenerate sau khi đổi provider. (2) Sau phase này dev stack đã bị kill → **owner nên `pnpm dev` lại** (lần đầu sẽ chạy migrate lên DB Postgres — cần Postgres listening; xem 1C docker-compose). (3) Migration generate cần Postgres đang chạy: dùng `docker run postgres:16-alpine` tạm (port tránh trùng — 5432/5433 đã bị chiếm máy owner, dùng 5434).

### ✅ 1C — Containerization (Docker Compose self-host) — DONE `aa22288`
- [x] `apps/api/Dockerfile` multi-stage (context = **repo root**): build = `pnpm install --frozen-lockfile` → `pnpm turbo run build --filter=@app/api` (build api dist + mọi workspace dep) → `pnpm prune --prod` → `prisma generate` lại (prune ghi lại node_modules). Runtime `node:20-alpine` COPY cả `/repo` (giữ symlink workspace), `apk add openssl` (prisma musl engine), entrypoint `pnpm exec prisma migrate deploy && node dist/main.js`.
- [x] `apps/builder/Dockerfile` multi-stage: build `ARG/ENV VITE_API_BASE` → `pnpm turbo run build --filter=@app/builder` → runtime `nginx:alpine` serve `apps/builder/dist` + `apps/builder/nginx.conf` (SPA fallback `try_files $uri $uri/ /index.html` + cache `/assets/`).
- [x] `docker-compose.yml` (root, KHÔNG `version:`): `postgres:16-alpine` (named volume `pgdata` + healthcheck `pg_isready`), `api` (`depends_on postgres: service_healthy`, `DATABASE_URL`→service `postgres:5432`, healthcheck **node-TCP** vì `/health` để 1D), `builder` (build-arg `VITE_API_BASE`, host `8080`→80). Cổng host tránh trùng: postgres `5435:5432` (5432/5433 bận máy owner; vẫn để DataGrip nối), api `3001:3001`, builder `8080:80` (tránh dev Vite 5173). Mọi env `${VAR:-default}` override được qua root `.env`.
- [x] `.dockerignore` (root): node_modules/dist/.turbo/.tsbuildinfo/.vite/.git/.github/.changeset/.claude/.data/.env*/docs/*.md…
- [x] `apps/api/package.json`: **`prisma` CLI devDep → dep** (runtime cần `migrate deploy`); `turbo.json` build task thêm `env:["VITE_API_BASE","NODE_ENV"]` (turbo 2 strict env-mode ẩn var không khai → Vite sẽ bake nhầm default).
- **Verify (E2E THẬT, `docker compose up --build`):** postgres Healthy → api apply migration `20260630075905_init` lên container PG → "API listening :3001" → **GET /projects 200 `[]`** → **POST /projects 201 → GET count=1 persisted** (round-trip xuyên Postgres) → **builder 200 có `#root` + SPA deep-link fallback 200**. api typecheck PASS · biome sạch (JSON đổi) · reviewer PASS. Teardown `down -v` (xóa volume test). Image: builder 95.3MB, **api 1.47GB** (full-copy + prune; ⏭️ slim sau — chỉ copy phần api cần).
- **Gotcha:** (1) `pnpm deploy` KHÔNG dùng được: api `dist/` bị `.gitignore` ignore → npm-pack-semantics của deploy loại dist ⇒ chọn full-copy+`prune --prod`. (2) `pnpm prune --prod` hỏi confirm interactive → trong Docker non-TTY tự `true` (OK). (3) prisma musl engine cần `openssl` trên alpine. (4) Dev stack `pnpm dev` (3001/5173) **đụng cổng** api 3001 nếu compose cũng chạy — chạy MỘT trong hai.
- **Known gaps (reviewer, → xử lý sau):** (a) `CORS_ORIGINS` đã có trong compose nhưng `main.ts` vẫn `enableCors()` allow-all → **enforce ở 1D** (đừng ship allow-all). (b) `migrate deploy` chạy trong `CMD` + `restart:unless-stopped` ⇒ giả định **1 API replica** (scale >1 sẽ race migrate lúc boot — tách init/job khi cần). (c) Image api 1.47GB ⏭️ slim sau (chỉ copy phần api cần thay vì cả `/repo`).

### ⬜ 1D — Security hardening hạ tầng (KHÔNG đụng auth thật)
Trong `apps/api` (`main.ts` + `app.module.ts`); thêm deps `@nestjs/config`, `helmet`, `@nestjs/throttler` (đã xác minh CHƯA có):
- [ ] `ConfigModule.forRoot({ isGlobal:true, validate })` validate env bằng Zod (fail-fast nếu thiếu DATABASE_URL/PORT/CORS_ORIGINS).
- [ ] CORS: thay `app.enableCors()` bằng allowlist từ `CORS_ORIGINS`.
- [ ] `app.use(helmet())`.
- [ ] `@nestjs/throttler` global guard (ngưỡng qua env).
- [ ] `GET /health` (controller nhẹ hoặc `@nestjs/terminus` kiểm Prisma).
- [ ] Ghi chú trust-boundary: `x-owner-id` + `?roles=` KHÔNG phải ranh giới bảo mật tới Phase 2 (`apps/api/ARCHITECTURE.md`).
- **Verify:** origin lạ bị CORS chặn · header helmet hiện diện · vượt ngưỡng → 429 · thiếu env bắt buộc → app fail-fast.

### ⬜ 1E — CI/CD + chất lượng mã + quét bảo mật
Tạo `.github/`:
- [ ] `workflows/ci.yml` (PR + push): pnpm + cache → biome (file đổi) → `turbo typecheck` → `turbo build` → `turbo test` (cấp `services: postgres`/Testcontainers cho 1 test DB; live-test tự skip).
- [ ] `workflows/codeql.yml` — CodeQL JS/TS (SAST, native free).
- [ ] `dependabot.yml` — npm(pnpm) + github-actions (SCA tự động).
- [ ] `workflows/sonarcloud.yml` + `sonar-project.properties` — SonarCloud (= SonarQube cloud).
- [ ] `workflows/gitleaks.yml` — gitleaks (secret scan, OSS).
- [ ] Trivy — scan image Docker trong pipeline.
- [ ] Changeset gate — `changeset status --since=origin/main`.
- [ ] (Later) `workflows/release.yml` — changesets publish GitHub Packages (cho embed).
- **Verify:** mở PR thử → mọi job xanh; commit secret giả → gitleaks fail.

---

## Phase 2 — Auth thật + sản phẩm (LATER — phác thảo)
- [ ] Thay seam `x-owner-id` bằng auth thật (JWT tự quản / OAuth provider free: Auth0 / Clerk / Supabase Auth — phân tích trade-off khi tới).
- [ ] Authorization server-side thật cho `?roles=` (hiện owner tự khai — xem track FS2).
- [ ] Multi-tenant hóa `ownerId`/`ProjectMember` quanh user registry thật.
- [ ] (Optional) Error tracking: Sentry free / GlitchTip self-host.

---

## Đối chiếu free-for.dev (đã xác minh, gồm cập nhật 2026)
> ⚠️ Free-tier thay đổi liên tục — xác nhận lại lúc đăng ký.

| Nhu cầu | Chọn (khớp kinh nghiệm owner) | Free-tier đã xác minh |
|---|---|---|
| CI/CD | **GitHub Actions** | ~2000 phút/tháng private; public unlimited. Alt: CircleCI 6000 phút/tháng |
| SAST/quality | **SonarCloud** (= SonarQube cloud) | Free cho public repo. Alt: Codacy/CodeFactor/DeepSource |
| SCA (≈ BlackDuck) | **Dependabot + CodeQL + Trivy** | Native/OSS free |
| Secret scan (≈ GitGuardian) | **gitleaks** (OSS, no account) | GitGuardian free ≤25 dev nếu muốn UI |
| Static FE (nếu lên cloud) | Vercel / Cloudflare Pages | CF Pages 500 build/tháng |
| API host (nếu lên cloud) | Render / Koyeb (container) | Render free spin-down 15'; Koyeb free 1 svc 0.1vCPU/512MB. **Fly.io/Heroku bỏ free tier user mới; Railway ~$1/tháng credit** |
| Postgres (nếu lên cloud) | Neon | Free 100 project, 0.5GB/proj, scale-to-zero |

---

## Facts đã xác minh & Gotchas (đọc trước khi sửa)
- **DB:** ~~sqlite~~ → **postgresql** (1B); `migration_lock.toml`="postgresql", baseline migration `20260630075905_init`; `PrismaService` không override datasource → đọc `DATABASE_URL` từ env.
- **Test/DB:** chỉ `import-files-to-db.test.ts` chạm DB (Testcontainers Postgres, `skipIf(!hasDocker())`); còn lại FakeRepo in-memory; `preset.live.test.ts` (form-ai) tự `skipIf`.
- **Security deps:** helmet/@nestjs/config/throttler/terminus đều CHƯA có (grep package.json = "No matches").
- **Auth hiện tại:** `auth/current-owner.decorator.ts` đọc `x-owner-id` default `"local"` — KHÔNG phải auth.
- **CRLF:** `core.autocrlf=true`, không `.gitattributes` → biome local báo CRLF nhưng commit LF (ứng viên cải thiện sau: `.gitattributes eol=lf`, nhưng renormalize cả repo → để riêng).
- **settings.json:** deny `**/.env.*` (chặn `.env.example` → dùng `env.example`); đang modified — KHÔNG commit (để nguyên).
- **Changeset:** apps (api/builder/mcp) nằm trong `.changeset/config.json` `ignore` → chỉ cần changeset khi đụng `packages/*`.

## Quy trình mỗi phase (owner contract)
1. Làm phase trên branch `feat/production-hardening`.
2. Verify bằng chạy thật (typecheck/test/biome + smoke phù hợp); reviewer subagent trước commit.
3. 1 commit/phase + changeset nếu đụng `packages/*`.
4. **Cập nhật file này** (✅ + commit hash + gotcha) **và** `session-resume-production-hardening.md`.
5. STOP → owner review → `/clear` → session mới.
