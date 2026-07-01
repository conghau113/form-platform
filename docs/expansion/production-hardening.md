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
| **1D** | Security hardening hạ tầng (ConfigModule+env-validate, CORS allowlist, helmet, throttler, /health) | ✅ DONE | `bc0a758` |
| **1E** | CI/CD (GitHub Actions + CodeQL + Dependabot + SonarCloud + gitleaks + Trivy + changeset gate) | ✅ DONE | `47934a8` |
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

### ✅ 1D — Security hardening hạ tầng (KHÔNG đụng auth thật) — DONE `bc0a758`
Trong `apps/api`; deps thêm: `@nestjs/config@3.3`, `helmet@8.2`, `@nestjs/throttler@6.5`, `zod@3.25` (khớp form-schema).
- [x] **`config/env.ts`** — `envSchema` (Zod, `.passthrough()` để AI_*/biến khác đi qua) + `validateEnv` (hook `ConfigModule.forRoot({ isGlobal:true, validate })`, gộp lỗi → throw → **fail-fast** tại boot nếu thiếu `DATABASE_URL`/sai kiểu `PORT`…) + `parseCorsOrigins`. Coerce `PORT`/`THROTTLE_*` về number; default `CORS_ORIGINS="http://localhost:5173"`, `THROTTLE_TTL=60000`, `THROTTLE_LIMIT=120`. +`env.test.ts` (7 test).
- [x] **CORS allowlist** — `main.ts` `app.enableCors({ origin: origins.length ? origins : false, credentials:true })` từ `CORS_ORIGINS` (bỏ `enableCors()` allow-all; list rỗng ⇒ chặn cross-origin, KHÔNG fallback allow-all).
- [x] **`app.use(helmet())`** (CSP off — đây là JSON API; SPA do nginx phục vụ). Gỡ `X-Powered-By`.
- [x] **`@nestjs/throttler`** — `ThrottlerModule.forRootAsync` (`{ throttlers:[{ ttl, limit }] }` — shape v6, ttl tính **ms**) + global `APP_GUARD: ThrottlerGuard`. `/health` `@SkipThrottle()`.
- [x] **`GET /health`** — `modules/health/` controller tự viết (KHÔNG cần `@nestjs/terminus`): inject `PrismaService` (export thêm từ `PersistenceModule` global) → `prisma.$queryRaw\`SELECT 1\`` → `{status:"ok",db:"up"}`. DB chết ⇒ throw ⇒ non-200 (đúng tín hiệu unhealthy). `docker-compose` api healthcheck đổi raw-TCP → `GET /health`.
- [x] **Trust-boundary note** (`apps/api/ARCHITECTURE.md` mục "Security hardening 1D"): `x-owner-id` + `?roles=` là **operator-declared, KHÔNG phải security boundary** tới Phase 2.
- **Verify (ALL PASS):** api typecheck · **test 121 PASS** (114+7 env; import test chạy THẬT trên PG container ~22s) · biome sạch (file đổi; ⚠️ HealthController cần `biome-ignore useImportType` — DI value-import) · reviewer **PASS** (no blocking). **Live smoke THẬT** (temp `postgres:16-alpine` :5436 + `migrate deploy` + `node dist/main.js` standalone, `THROTTLE_LIMIT=3`): `/health`→200 `{status:ok,db:up}` + helmet headers (`X-Content-Type-Options=nosniff`/`X-Frame-Options=SAMEORIGIN`, `X-Powered-By` gỡ) · CORS allowed-origin echo `ACAO=localhost:5173` / preflight evil-origin `ACAO` rỗng (chặn) · throttle → 429 sau ngưỡng, `/health` exempt vẫn 200 · boot với `PORT="not-a-number"` → fail-fast `Invalid environment variables: PORT: Expected number` exit 1.
- **Gotcha:** (1) `@prisma/client` **tự load `apps/api/.env`** lúc import (runtime) → `.env` cũ còn `DATABASE_URL="file:../.data/workspace.db"` (sót pre-1B) sẽ poison test fail-fast (Prisma P1012 thay vì message của ta). `.env` gitignored + Docker bỏ qua (compose set env tường minh) ⇒ production OK; **owner nên cập nhật `apps/api/.env` → Postgres URL** (hoặc xóa để dùng compose). (2) `HealthController` import `PrismaService` phải là **value-import** (`emitDecoratorMetadata` cho DI) → thêm `// biome-ignore lint/style/useImportType` (theo convention controller hiện có). (3) `ConfigService.get` đọc validated-env trước ⇒ number đã coerce (PORT/THROTTLE_*) tới đúng factory/`app.listen`.
- **Known gaps (→ sau):** (a) **trust-proxy chưa set** — compose hiện browser→api:3001 trực tiếp nên `req.ip` thật, throttler đúng per-client; nếu Phase 2 đặt API sau nginx/LB phải `app.set('trust proxy', …)` nếu không throttle gộp theo IP proxy. (b) CORS_ORIGINS unset ⇒ default `localhost:5173` (tiện dev, localhost vô hại); muốn fail-closed thì đổi Zod default `""`.

### ✅ 1E — CI/CD + chất lượng mã + quét bảo mật — DONE `47934a8`
Tạo `.github/` (config-only, KHÔNG đụng app code). Tất cả action versions đã **xác minh tồn tại thật** (WebFetch tags GitHub — tránh tag chết fail pipeline).
- [x] `workflows/ci.yml` (push `main`/`feat/**` + PR→main): pnpm@9 + `actions/setup-node@v4 cache:pnpm` → **biome CHỈ file đổi** (baseline repo KHÔNG biome-clean: 326 lỗi phần lớn CRLF-local → gate repo-wide sẽ fail giả) → `turbo typecheck` → `turbo build` → `turbo test`. Job `changeset` (PR-only) chạy `changeset status --since=origin/<base>`. `fetch-depth:0` để có base cho diff + changeset. `concurrency` cancel-in-progress.
- [x] `workflows/codeql.yml` — CodeQL `javascript-typescript` + `queries:security-and-quality` (KHÔNG autobuild — JS/TS interpreted), push/PR/weekly-cron. `security-events:write`.
- [x] `dependabot.yml` — npm `/` (đọc root pnpm-lock, phủ cả workspace) + github-actions + docker×2 (`apps/api`,`apps/builder`), weekly; group dev-tooling + @types.
- [x] `workflows/sonarcloud.yml` + `sonar-project.properties` — `SonarSource/sonarqube-scan-action@v8` (v4 CŨ đã biến mất; major hiện tại v7/v8) + `SONAR_HOST_URL=https://sonarcloud.io`. **Gate qua step-output `guard` đọc `secrets.SONAR_TOKEN`** → thiếu token thì job **no-op** (không fail pipeline). `sonar-project.properties` có placeholder `REPLACE_ME_ORG`/`REPLACE_ME_PROJECT_KEY`.
- [x] `workflows/gitleaks.yml` — `gitleaks/gitleaks-action@v2`, `fetch-depth:0`. (⚠️ repo dưới **org** cần free `GITLEAKS_LICENSE`; repo cá nhân/public thì free.)
- [x] `workflows/trivy.yml` — `aquasecurity/trivy-action@0.35.0` (tag `0.28.0` KHÔNG tồn tại; dòng hiện tại `v0.36.0`). Job `fs` (vuln,misconfig,secret HIGH,CRITICAL, ignore-unfixed, PR/push) + job `image` (build api+builder Dockerfile rồi scan, chỉ push/schedule vì nặng). Cả hai `exit-code:0` **non-blocking** → upload SARIF lên Security tab (owner siết sau).
- [ ] (Later) `workflows/release.yml` — changesets publish GitHub Packages (cho embed).
- **Verify (chạy thật cục bộ, CI chỉ chạy sau khi push/PR):** cả 6 YAML parse OK (node `yaml@2.9.0`) · `changeset status --since=main` chạy thật exit 0 (liệt kê packages sẽ bump — changeset đã có) · biome chạy được trên file lẻ · action versions cross-check GitHub tags.
- **Gotcha:** (1) **biome KHÔNG gate repo-wide** — baseline 326 lỗi (CRLF-local Windows; blob commit LF) → CI Linux checkout LF nên phần lớn tan; vẫn scope changed-files để khớp convention + tránh residual. (2) **Action version pins**: `trivy-action@0.28.0` và `sonarqube-scan-action@v4` (dự tính ban đầu) **KHÔNG tồn tại** — đã sửa `0.35.0`/`v8` sau khi fetch tags thật. (3) Testcontainers DB test chạy THẬT trên ubuntu-latest (Docker pre-installed) — không cần `services:postgres`. (4) reviewer subagent gặp session-limit không trả được → **tự review inline** (YAML parse + version-verify + logic changed-files/guard). (5) `.claude/settings.json` vẫn modified — KHÔNG commit (để nguyên).
- **Owner setup thủ công (để bật SonarCloud):** ✅ project đã tạo (org `conghau113` / key `conghau113_form-platform` — đã điền `sonar-project.properties`, commit `ec341f1`); token đã lưu ở gitignored root `.env` (chỉ dùng local). ⬜ **CÒN LẠI: thêm repo secret `SONAR_TOKEN` trên GitHub UI** (Settings → Secrets and variables → Actions) — CI KHÔNG đọc `.env`, tới khi có secret thì job SonarCloud mới chạy (giờ no-op).

---

## Phase 2 — Auth thật + sản phẩm
Owner chốt (2026-07-01): **Self-managed email/password JWT** (self-host 100%, không lock-in/chi phí ngoài — hợp Docker-Compose). Phân đoạn: **2A backend** → 2B builder login UI → 2C server-side authorization (`?roles`/ProjectMember thật) → 2D (optional) refresh/hardening.

### ✅ 2A — Auth backend foundation — DONE `dd26fb5`
Self-managed JWT cho `apps/api` (chỉ api code + config; KHÔNG đụng contract/renderer, không bump formVersion).
- [x] **`User` model + migration** `20260701061049_add_user_auth` (id cuid / email unique / passwordHash / displayName? / timestamps). Additive, non-destructive.
- [x] **`modules/auth/`**: `auth.service.ts` (register/login/me + bcryptjs hash SALT_ROUNDS=10 + `@nestjs/jwt` sign; lỗi login/register generic chống account-enumeration + DUMMY_HASH so-timing) · `auth.controller.ts` (`POST /auth/register` @Public 201, `POST /auth/login` @Public 200, `GET /auth/me` protected) · DTOs (class-validator) · `auth.module.ts` (JwtModule.registerAsync secret/expiry từ env).
- [x] **`auth/jwt-auth.guard.ts`** global `APP_GUARD` (đăng ký trong AuthModule để JwtService resolvable) — secure-by-default: mọi route cần Bearer trừ `@Public`. `auth/public.decorator.ts` + `jwt-payload.ts`.
- [x] **`current-owner.decorator.ts`** đọc verified `req.user.sub` (bỏ `x-owner-id`); mọi row đã `ownerId`-scoped từ Track W ⇒ swap non-destructive. `/health` + `/auth/*` gắn `@Public`.
- [x] **`UserRepo` + `PrismaUserRepo`** đăng ký PersistenceModule (D4: service không thấy Prisma).
- [x] **env** (Zod): `JWT_SECRET` required min-16 (fail-fast), `JWT_EXPIRES_IN` default `7d`, `AUTH_BOOTSTRAP_EMAIL`/`_PASSWORD` optional. `env.example` + `docker-compose.yml` (api truyền JWT_SECRET/bootstrap) cập nhật.
- [x] **Bootstrap admin** id=`SEED_OWNER_ID` ("local") khi cả 2 biến bootstrap có + chưa tồn tại ⇒ **dữ liệu pre-2A (ownerId="local") vẫn có chủ/truy cập được**. Đọc `process.env` (KHÔNG ConfigService) — xem gotcha.
- **Verify (ALL PASS):** api typecheck · **test 133 PASS** (121→133, +12: auth.service 7 + jwt-auth.guard 4 + env 1) · biome sạch (file đổi). **Live smoke THẬT trên build compiled** (`node dist/main.js` + temp `postgres:16-alpine` :5439 + `migrate deploy`): 10/10 — `/health` public 200 · `/projects` no-token **401** · register 201 (token + KHÔNG lộ passwordHash) · duplicate **409** · `/auth/me` token 200 / bad-token 401 · `/projects` token 200 · login sai-pw 401 / đúng 200 · create project 201. **+ Bootstrap-verify riêng:** boot với `AUTH_BOOTSTRAP_*` → login admin → `user.id="local"`, `/auth/me` id=local.
- **⚠️ Gotcha (QUAN TRỌNG):** (1) **tsx KHÔNG emit `emitDecoratorMetadata`** → constructor-DI theo type (Reflector/JwtService/ConfigService) thành `undefined` (crash "getAllAndOverride of undefined"). App chạy `tsc && node dist` (script `dev`/`start`), KHÔNG tsx → **live-smoke phải `pnpm build` rồi `node dist/main.js`**, đừng `tsx src/main.ts`. (2) **biome `useImportType` tự đổi JwtService/Reflector → `import type`** làm class bị **elide** ⇒ DI undefined y hệt ⇒ **BẮT BUỘC `// biome-ignore lint/style/useImportType` + value-import** cho mọi class constructor-inject (đúng convention PrismaService/DTO/UserRepo sẵn có). (3) Bootstrap đọc `process.env` thay `ConfigService` (tránh mong manh DI + đúng tiền lệ `ai.config.ts`); env đã Zod-validate lúc boot.
- **⚠️ Known gaps → 2B/2C:** builder CHƯA gửi token (`ownerHeaders()` vẫn `x-owner-id`) ⇒ builder hiện sẽ 401 tới khi 2B; `?roles`/ProjectMember vẫn owner-declared (2C); chưa refresh-token (2D). Compose `JWT_SECRET` default là placeholder dev — deploy phải đặt secret thật.

### Phase 2 (còn lại — phác thảo)
- [ ] **2B** — Builder login UI: trang login/register, lưu token, `ownerHeaders()` → `Authorization: Bearer`, route guard, logout.
- [ ] **2C** — Authorization server-side thật cho `?roles=`/ProjectMember (hiện owner tự khai — xem FS2). Multi-tenant hóa quanh user registry thật.
- [ ] **2D (optional)** — refresh token / hardening; Error tracking: Sentry free / GlitchTip self-host.

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
- **Security deps:** ~~CHƯA có~~ → **ĐÃ thêm 1D**: `@nestjs/config@3.3`, `helmet@8.2`, `@nestjs/throttler@6.5`, `zod@3.25` (deps của `apps/api`). `@nestjs/terminus` KHÔNG dùng (health tự viết `$queryRaw`).
- **`apps/api/.env` (gitignored):** còn `DATABASE_URL="file:../.data/workspace.db"` (sót pre-1B) — `@prisma/client` tự load lúc import ⇒ poison fail-fast test cục bộ. Docker bỏ qua (compose set env). Owner nên đổi sang Postgres URL hoặc xóa.
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
