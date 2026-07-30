# Product Roadmap — form-platform → sản phẩm production, multi-tenant, RBAC

> **Trạng thái:** DRAFT để owner duyệt (2026-07-01). Đây là bản đồ TỔNG QUÁT (owner chọn "hướng 2:
> roadmap trước, ship từng phase"). Mỗi phase vẫn commit + verify riêng rồi cập nhật tracker.
> Roadmap này KHÔNG thay thế tracker hạ tầng
> `production-hardening.md` — nó tiếp nối sau Phase 2 (auth) và mở rộng thành tầm nhìn sản phẩm.

## 1. Bối cảnh & mục tiêu (có căn cứ — không phán đoán)

**Hiện trạng form-platform (đã xác minh trong repo):**
- Monorepo contract-first: `form-schema` (Zod, `formVersion` + migrations) LÀ hợp đồng; `form-core`
  (JSONLogic conditions, **datasource**, **reactions**, RBAC field-level), renderer web (antd).
- `apps/api` NestJS + **Prisma + Postgres**; `apps/builder` React + antd + dnd-kit + xyflow.
- Workflow engine (`workflow-core`/`workflow-schema`) + Run-view; Form submission runtime (FS/FB).
- **Auth 2A/2B DONE:** self-managed email/password JWT trong **HttpOnly cookie + same-origin proxy**;
  `User` model (id/email/passwordHash/displayName); project-member roles (editor/viewer, Track W) —
  **chưa có system-role/RBAC chức năng-dữ liệu**.

**Mục tiêu owner (2026-07-01):** đưa form-platform thành sản phẩm **production, multi-tenant, để client
khác cài đặt và dùng được**, với **RBAC phân quyền chức năng + dữ liệu**, **1 user nhiều role**, admin
panel quản lý form/workflow/user/version, bộ auth đầy đủ (password-reset, Google OAuth, refresh, email
verify), và luồng **ticket/work-order** sinh từ form + workflow ("ai sẽ / đã / đang làm gì").

### 1.1. Mô hình vendor ↔ client (định hướng CỐT LÕI — owner chốt 2026-07-01)
- **form-platform = sản phẩm của BÊN VENDOR (bên thứ 3 — tôi).** Nó là **nền tảng cấu hình được**, KHÔNG
  phải hệ thống nghiệp vụ của một khách cụ thể.
- **EVN = một CLIENT mẫu.** EVN hợp tác để tôi cung cấp sản phẩm; hệ `core-service`/`web-admin` của EVN
  cho thấy **một client cần gì** (RBAC chức năng+dữ liệu, org/phòng ban, form, workflow, ticket/work-order).
- ⇒ **Nguyên tắc bất di bất dịch:** platform cung cấp **primitive tổng quát, cấu hình bằng DỮ LIỆU**; client
  (EVN-like) **tự cấu hình** miền nghiệp vụ của họ. **TUYỆT ĐỐI KHÔNG hardcode nghiệp vụ EVN** (thiết bị,
  công tác điện, phòng ban cụ thể…) vào platform — đó là **cấu hình của client**, không phải code của vendor.
  Đây chính là định hướng "moat = hạ tầng B2B nhúng được, đảm-bảo-hợp-lệ" (định hướng sản phẩm nội bộ).
- **Hai tầng quản trị:** (a) **vendor-admin** (tôi) quản lý các **tenant/installation**; (b) **client-admin**
  (EVN) quản lý **trong tenant của họ**: org/phòng ban, role, chức năng, user, form, workflow.
- **Bằng chứng data-driven (đã đọc entities EVN):** `functions` là **bản ghi DB** (code/name/`parent_code`
  phân cấp) — client tự khai danh mục chức năng; `role_groups` do client tạo, map tới functions
  (`role_group_map_functions`) và tới users M-N (`role_group_map_users`); phân quyền dữ liệu qua
  `permission_data_groups`↔`permission_departments`↔`permission_users`; **mọi bảng gắn
  `organization_code`/`department_code`** ⇒ org/phòng ban là trục scope. ⇒ Platform của ta phải hiện thực
  RBAC **data-driven + org/department-scoped**, KHÔNG phải vài role hardcode.

**Reference (SOURCE THẬT owner cung cấp — phỏng theo, KHÔNG copy):**
- `E:\web\evn\core-service` — NestJS **TypeORM** (khác: ta dùng Prisma). RBAC:
  `role-group` → `role-group-map-function` → `functions`/`function-group` (**phân quyền chức năng**);
  `permission-data-group` + `permission-department` + `permission-user` (**phân quyền dữ liệu** theo
  phòng ban/tổ chức); `role-group-map-user` (**user↔role many-to-many**); `permission-approver` (quyền
  duyệt). Auth: JWT + local-strategy + `rsa.service`.
- `E:\web\web-admin` — React + Vite + **antd + reactFlow** (giống ta), feature-folders:
  `userManager`, `accountManager`, `workflowTicket`, `workOrder`, `config`, `category`, `dashboard`.
- `E:\web\estd\apps\{web,api}` — bộ auth đầy đủ: login/register/**oauth-google**/**reset-password**/
  **set-password**/**forgot-password**/**refresh** (jwt.strategy + google.strategy).

**Nguyên tắc dẫn đường:**
1. **Additive** với hợp đồng form-schema — không phá JSON đã lưu; bump `formVersion` + migration khi cần.
2. **Tái dùng engine** sẵn có (form-core datasource/reactions/conditions, workflow-core, renderer).
   RBAC/admin/multi-tenant là **tầng mới**, không viết lại lõi.
3. **Self-host trước** (Docker-Compose) + **installable**; phụ thuộc ngoài (SMTP, Google OAuth) là
   **tùy chọn, cấu hình được** — không bắt buộc để chạy bản tối thiểu.
4. **Prisma, không TypeORM** — phỏng theo mô hình EVN, hiện thực bằng Prisma additive migrations.
5. Ship **từng phase + verify thật** (typecheck/test/biome/live-smoke) trước khi gọi done.

---

## 2. Bản đồ phase (sắp theo phụ thuộc)

Ký hiệu: 🔒 = phụ thuộc ngoài (owner phải cung cấp) · ⭐ = nền tảng chặn phase sau · Δ = thay đổi hợp đồng.

> **⚠️ TRẠNG THÁI SOURCE (đọc kỹ — phân biệt "đã có" vs "planned"):** chỉ những gì đánh dấu **[đã có]** là
> hiện hữu trong repo hôm nay (2026-07-01). **Mọi model/bảng/guard/route từ Phase A trở đi là 📋 PLANNED**
> — `Tenant`,`Membership`,`UserRole`,`DataScope`,`Function`,`Role`,`RoleFunction`,
> `@RequireFunction`,`FunctionGuard`,`VITE_BASE_PATH`/router-basename/nginx-base — **CHƯA tồn tại**, là thiết
> kế phỏng từ reference ngoài (EVN/web-admin/estd). Xem **§7 Evidence ledger** để biết cái gì đọc-từ-source
> vs suy-luận. Repo hiện có: `/api` proxy (2B), `User`(id/email/passwordHash/displayName), **`RefreshToken`
> (A1 ✅ rotating + revocable)**, **`Tenant`+`Membership`+`Project.tenantId` (B1 ✅ personal-tenant/user)**,
> **`OrgUnit` cây org/department per-tenant + `Membership.orgUnitId?` (B2 ✅)**,
> **`Function`+`Role`+`RoleFunction`+`UserRole`+`@RequireFunction`+`FunctionGuard` (C1+C2+C4 ✅ — RBAC
> function/role/enforcement; `*` superadmin auto-provision cho tenant owner; guard **any-of** từ D1)**,
> **`AuditLog` + admin UI `/admin` + add-member + nav gate `useAuth().functions` (D1 ✅)**,
> project-member role (editor/viewer), form-core datasource/reactions/conditions,
> workflow engine, cookie-auth (access **15m** + refresh **30d** — A1). Vẫn 📋 PLANNED: `DataScope` (C3
> data-scope org/department), client-custom `Function` (`tenantId?`), tenantId trên bảng khác (B3).

### Phase 0 — Nền tảng môi trường & cấu hình (LÀM NGAY — owner yêu cầu) ⭐ ✅ DONE (2026-07-01)
Mục tiêu: 3 môi trường **dev / test / production** cho cả `api` (NestJS) và `builder` (Vite), base-path
env-driven, secret CHỈ ở `.env` phía API.

> **✅ ĐÃ LÀM (2026-07-01):**
> - **API env-file theo NODE_ENV:** `app.module.ts` `ConfigModule.forRoot({ envFilePath: [`.env.${NODE_ENV}`, ".env"] })`
>   → `.env.test`/`.env.production` đè `.env`. Docker vẫn lấy env từ compose (không đọc file).
> - **Base-path env-driven:** `vite.config.ts` `loadEnv` đọc `VITE_BASE_PATH` → Vite `base` (default `/`);
>   `main.tsx` router `basename = BASE_URL` (bỏ dấu `/` cuối); `vite-env.d.ts` khai `VITE_BASE_PATH`/`VITE_APP_ENV`.
> - **env.example** (api+builder) tài liệu 3 môi trường + base-path; **6 file `.env*` thật** đã tạo (gitignored):
>   dev API trỏ Postgres `localhost:5435` (compose service `postgres`), JWT_SECRET sinh ngẫu nhiên, bootstrap
>   admin `admin@local.dev`. `.env.production` có secret mạnh sinh sẵn + placeholder DB (deploy set qua compose).
> - **Settings:** gỡ deny Read `.env*` (owner cho phép), giữ deny `*.pem`/`secrets/**`.
> - **Verify ALL PASS:** typecheck api+builder · build 3 mode (base `/` + `/form-platform` + `--mode test`,
>   asset URL inject đúng) · api 144 test · builder 366 test · biome sạch · **live boot dev `.env`** (Postgres
>   compose + migrate deploy): `/health` `db:up`, bootstrap login `id="local"`, sai-pw/no-token 401.
> - **⚠️ Known-gap:** nginx phục vụ dưới sub-path CHƯA làm (default `/` chạy tốt; full sub-path serving cần
>   template nginx — để refinement sau). AppShell/left-rail để bước kế (giữ Phase 0 gọn = env + base-path).
- **API (`apps/api`):** `.env`, `.env.test`, `.env.production` (đều gitignored). `ConfigModule` chọn
  `envFilePath` theo `NODE_ENV`. Chứa **secret**: `DATABASE_URL`, `JWT_SECRET`, `AUTH_COOKIE_SECURE`,
  `AUTH_BOOTSTRAP_*`, (sau) SMTP_*, GOOGLE_OAUTH_*. `env.example` cập nhật.
- **Builder (`apps/builder`, Vite):** `.env`, `.env.test`, `.env.production` — **CHỈ `VITE_*` non-secret**
  (⚠️ Vite bundle `VITE_*` LỘ ra browser → TUYỆT ĐỐI không để secret ở đây). Biến:
  `VITE_API_BASE`, **`VITE_BASE_PATH`** (= `/form-platform-dev|-test|/form-platform`), `VITE_APP_ENV`.
- **Base-path env-driven (📋 CHƯA có trong source — thêm mới):** `vite.config` đọc `VITE_BASE_PATH` → Vite
  `base`; `main.tsx` `createBrowserRouter(..., { basename: import.meta.env.VITE_BASE_PATH })`; nginx `location`
  theo base. (Hiện source chỉ có `/api` proxy; router CHƯA có `basename`; `vite.config` CHƯA đọc biến này.)
- **Demo/bootstrap admin** cho dev điền sẵn (owner cung cấp email/mật khẩu — xem §3).
- Verify: build 3 mode (`vite build --mode test|production`), boot api với từng NODE_ENV (fail-fast env),
  live-smoke login trên base-path dev.
- ⚠️ Không đọc lại được `.env` (deny Read) → verify gián tiếp qua boot/build + không echo secret.

### Phase A — Kiện toàn bộ Auth (tiếp nối 2B) — A1 ✅ DONE (2026-07-02); A2 ✅ DONE (2026-07-29); A3 📋 PLANNED
- **A1 — Refresh token** ⭐ ✅ DONE (2026-07-02): access-token ngắn (`JWT_ACCESS_EXPIRES_IN`, mặc định
  **15m**) + refresh-token dài (`JWT_REFRESH_EXPIRES_IN`, mặc định **30d**) trong cookie HttpOnly RIÊNG
  (`refresh_token`, xoay vòng + revoke được). `POST /auth/refresh`, `/auth/logout` thu hồi, thêm
  `POST /auth/logout-all` ("đăng xuất mọi thiết bị"). Nền cho hết-hạn-phiên mượt.
  > **✅ ĐÃ LÀM (2026-07-02):**
  > - **Backend (`apps/api`, additive):** model Prisma `RefreshToken` (chỉ lưu **SHA-256 hash** — rò DB
  >   không mint được phiên; `tokenHash @unique`, `revokedAt`, `onDelete:Cascade`) + migration
  >   `20260702025806_add_refresh_token`; `RefreshTokenRepo` interface + `PrismaRefreshTokenRepo` wire
  >   vào `persistence.module`. `auth.service`: refresh token **opaque** (`randomBytes(32)`); `issue`
  >   phát access+refresh; `refresh()` **rotate** (revoke cũ→cấp mới); **reuse-detection** (replay token
  >   đã-revoked → `revokeAllForUser` = coi như bị đánh cắp); `logout()`/`logoutAll()`. Controller set/clear
  >   2 cookie (`authCookieOptions` dùng chung, path `/`), `/auth/refresh` là `@Public` (access có thể đã
  >   hết hạn). Env: `JWT_ACCESS_EXPIRES_IN`/`JWT_REFRESH_EXPIRES_IN` thay `JWT_EXPIRES_IN` (env.example +
  >   `.env`/`.env.production` + docker-compose).
  > - **Frontend (`apps/builder`):** `src/lib/apiFetch.ts` — wrapper cùng chữ ký `fetch`: gặp 401 (endpoint
  >   không phải auth) → **dedup 1** `POST /auth/refresh` (tránh rotation-race → false reuse-alarm) rồi
  >   retry 1 lần; refresh fail → trả 401 gốc + gọi `setSessionExpiredHandler`. 9 client.ts (+`fetchMe`)
  >   route qua apiFetch (login/register/logout giữ raw `fetch`). `useAuth` đăng ký session-expired → set
  >   cache `me`=null → RequireAuth về login. Phiên nay **sống qua reload** quá hạn access.
  > - **Verify ALL PASS:** typecheck api+builder · api 150 test (auth service +6 refresh) · builder 371 test
  >   (apiFetch +5) · biome sạch (24 file) · reviewer **PASS** (no required fix) · **live-smoke HTTP thật**
  >   (built dist + `node dist`, access 3s): **18/18** — login set 2 cookie → me 200 → access hết hạn 401 →
  >   refresh rotate (token đổi) → me 200 → reuse token cũ 401 + family revoked → logout revoke → logout-all
  >   revoke cả 2 phiên. KHÔNG changeset (chỉ app private, theo lệ 2A/2B).
  > - **⚠️ Known-gap (advisory reviewer, để hardening sau):** rotation `findByHash→revoke→create` **chưa
  >   atomic** — 2 refresh THẬT-song-song cùng 1 token còn-hạn (khác tab, mỗi tab 1 `refreshInFlight`) có thể
  >   cùng qua check → nhân đôi token sống (fail-safe: KHÔNG báo trộm nhầm; replay sau vẫn bắt qua `revokedAt`).
  >   Nếu siết: compare-and-revoke atomic (`updateMany where revokedAt:null` + xét count) trong transaction.
- **A2 — Quên/đặt lại mật khẩu + Xác minh email** ✅ DONE (2026-07-29): `forgot-password`/`reset-password`/
  `verify-email` + đổi mật khẩu khi đã đăng nhập; token 1-lần hết-hạn (bảng `VerificationToken`);
  `modules/mail` (Nodemailer). SMTP **tùy chọn** (dev: Mailpit; prod: relay thật).
  > **✅ ĐÃ LÀM (2026-07-29) — owner chốt 4 fork (đều theo khuyến nghị):** phạm vi ĐẦY ĐỦ (reset + verify) ·
  > **verify MỀM** (không chặn đăng nhập) · SMTP chưa cấu hình → **fallback log ra logger** ·
  > có `POST /auth/change-password`.
  > - **Schema (`20260729000000_add_verification_token`, additive, KHÔNG backfill):** `User.emailVerifiedAt?`
  >   + model `VerificationToken`(`userId`/`purpose`/`tokenHash @unique`/`expiresAt`/`consumedAt?`, FK Cascade,
  >   `@@index([userId,purpose])`). **⚠️ DEVIATION có chủ đích:** **MỘT bảng + cột `purpose`**
  >   (`email_verify`|`password_reset`) thay vì 2 bảng `VerificationToken`/`PasswordResetToken` như phác ở
  >   §Phase A — vòng đời hệt nhau (single-use, hash SHA-256, hết hạn) nên 2 bảng = 2 repo + 2 impl trùng lặp.
  > - **Token:** opaque `randomBytes(32).hex`, **DB chỉ lưu SHA-256** (mirror `RefreshToken` A1) → rò DB không
  >   xác minh hộ ai, không đặt lại mật khẩu hộ ai. Cấp token mới **vô hiệu hoá** token cũ cùng purpose;
  >   redeem sai purpose / đã dùng / hết hạn / không tồn tại đều trả **400 giống nhau**.
  > - **`modules/mail`:** `MailService` (nodemailer, transport dựng lười) — **không có `SMTP_HOST` ⇒ log-mode**
  >   (ghi nội dung + link ra Nest Logger, giữ nguyên tắc §2.3 "phụ thuộc ngoài là tùy chọn"); gửi lỗi được
  >   nuốt + log (SMTP hỏng KHÔNG làm hỏng đăng ký / quên-mật-khẩu). `mail-templates.ts` = **hàm thuần** VI
  >   (escape HTML cho displayName). Env mới: `SMTP_HOST/PORT/USER/PASSWORD/SECURE`, `MAIL_FROM`,
  >   `APP_PUBLIC_URL` (gốc link), `AUTH_VERIFY_TOKEN_EXPIRES_IN`(24h)/`AUTH_RESET_TOKEN_EXPIRES_IN`(1h).
  >   docker-compose thêm service **`mailpit`** (1025 smtp / 8025 UI — bản kế nhiệm được bảo trì của MailHog).
  > - **Endpoint:** `POST /auth/forgot-password` (@Public, **luôn `{ok:true}`** = không lộ email nào có tài khoản,
  >   throttle 5/phút) · `reset-password` · `verify-email` (@Public) · `resend-verification` (authed, throttle) ·
  >   `change-password` (authed, yêu cầu mật khẩu cũ). Reset **và** change đều `revokeAllForUser` (đá mọi phiên
  >   khác); change **cấp lại cookie** cho chính caller. `register` gửi mail xác minh (best-effort).
  > - **Builder:** 3 route công khai `/forgot-password`·`/reset-password?token=`·`/verify-email?token=` +
  >   link "Quên mật khẩu?" ở LoginPage · SettingsPage: trạng thái xác minh + "Gửi lại" + form Đổi mật khẩu ·
  >   AppShell: banner nhắc xác minh (đóng được). `UserProfile.emailVerifiedAt` lộ qua `/auth/me`.
  > - **Verify ALL PASS:** typecheck api+builder · **api 225 test** (+9: verify/reset/change + mail-templates) ·
  >   **builder 388 test** (+4 client) · biome sạch file đổi · **live-smoke HTTP thật 26/26** (`node dist`
  >   PORT=3011 + Postgres + Mailpit: đăng ký→đọc mail→verify→replay 400→forgot email-lạ vẫn 200→reset→refresh
  >   token cũ 401→login mật khẩu mới→change-password sai-cũ 401/đúng 200 + phiên khác chết) · **log-mode
  >   verify riêng** (`SMTP_HOST=` rỗng → log `[mail:log-mode]`) · **UI smoke MCP** (đăng ký→banner→Cài đặt
  >   "Chưa xác minh"→Gửi lại→mở link→"Đã xác minh"→đổi mật khẩu→quên mật khẩu→đặt lại→đăng nhập lại;
  >   console sạch). KHÔNG changeset (apps private).
  > - **⚠️ Known-gap (advisory):** (1) **access-token 15m không bị thu hồi** khi reset/change (JWT stateless —
  >   chỉ refresh token bị revoke) ⇒ phiên cũ trong cùng trình duyệt còn sống tối đa 15 phút; siết sau bằng
  >   token-version/denylist nếu cần. (2) verify **mềm** — chưa nơi nào chặn theo `emailVerifiedAt` (đúng
  >   chủ đích; muốn siết thì gate ở guard + backfill user cũ). (3) `AUTH_BOOTSTRAP_*` admin không được
  >   verify tự động. (4) Chưa có UI đổi email.
- **A3 — Google OAuth** 🔒 Google app (tùy chọn): `/auth/oauth/google` + callback, liên kết account
  theo email đã verify. Cần **Google client-id/secret** (redirect suy ra từ `APP_PUBLIC_URL`).
- Δ nhỏ: `User` thêm `emailVerifiedAt?`; `passwordHash` thành **nullable**. Additive.

> **✅ ĐÃ LÀM A3 (2026-07-30) — đăng nhập bằng Google, env-driven.** Plan
> `~/.claude/plans/distributed-weaving-rocket.md` đã qua **`plan-reviewer`** (5 finding `required`
> sửa hết trước khi code). **⚠️ Lệch có chủ đích so với 2 dòng mô tả ở trên (đã sửa lại cho khớp):
> KHÔNG dùng `passport-google-oauth20` và KHÔNG thêm cột `authProvider`.**
>
> - **Không thêm một dependency nào.** Toàn bộ auth của repo vốn tự viết (`JwtAuthGuard`,
>   `cookie.ts` tự parse, không `cookie-parser`, không passport); luồng này chỉ là 2 lệnh gọi —
>   dựng URL authorize + POST đổi `code` lấy `id_token`. Thêm `@nestjs/passport` + 3 gói nữa cho
>   đúng 1 provider là lệch nhà.
> - **Tính năng TẮT khi chưa cấu hình** (nguyên tắc §3): thiếu `GOOGLE_CLIENT_ID`/`SECRET` ⇒
>   `googleConfig()` trả `null` ⇒ `/auth/oauth/google` **404** và builder **ẩn nút**. `GET
>   /auth/providers` là endpoint công khai để trang đăng nhập biết mà ẩn/hiện — khác A2 (mail
>   suy biến ngầm, UI không cần biết) vì một cái nút bấm-vào-404 là lỗi nhìn thấy được.
> - **`decodeIdToken` cố ý KHÔNG verify chữ ký** — token lấy thẳng từ token-endpoint của Google
>   qua TLS server-to-server đổi bằng `client_secret` (URL là hằng số module, không lấy từ env),
>   đúng khuyến cáo của Google ⇒ không cần JWKS. Vẫn kiểm `aud` cho chắc. Doc-comment cấm dùng
>   hàm này cho token do client gửi lên.
> - **CSRF (repo trước đây KHÔNG có gì cho luồng này):** nonce ngẫu nhiên đi tới Google trong
>   `state` (JWT 10 phút) **và** nằm trong cookie ngắn hạn; callback chỉ chạy tiếp khi hai bên khớp.
>   **Cookie `oauth_state` phải `SameSite=Lax`, KHÔNG `Strict`**: cookie Strict bị giữ lại trên
>   đúng cái điều hướng top-level quay về từ `accounts.google.com` ⇒ mọi lần đăng nhập sẽ fail.
>   Có test pin lại điều này (`cookie.test.ts`).
> - **🔒 Lỗ hổng thứ hai — `reviewer` bắt được sau khi code (plan-reviewer đã bỏ sót):** `state` là
>   JWT **phơi công khai** trong URL/history/log của Google. Bản đầu ký nó bằng chính `JWT_SECRET`
>   ⇒ `JwtAuthGuard` (chỉ verify **chữ ký**, không verify mục đích) **chấp nhận nó như access-token**;
>   phần lớn route sống sót nhờ `CurrentOwner` đòi `sub`, nhưng `ai.controller.ts` có 5 route
>   protected **không đọc `sub`** ⇒ state token là thẻ vào thật trong 10 phút. Sửa **3 lớp**:
>   (1) `state` ký bằng **khoá dẫn xuất riêng** `HMAC(JWT_SECRET, "oauth-state")` ⇒ về mặt cấu trúc
>   không thể verify như access-token; (2) claim `typ:"oauth_state"` callback bắt buộc kiểm;
>   (3) **`JwtAuthGuard` từ chối token không có `sub`** — chữ ký đúng không đủ để là access-token
>   (có test riêng trong `jwt-auth.guard.test.ts`).
> - **Token KHÔNG bao giờ vào URL** — callback set cookie HttpOnly rồi mới redirect. (Source tham
>   chiếu `estd` nhét `accessToken`/`refreshToken` vào query-string; **không copy**.)
> - **🔒 Lỗ hổng plan-reviewer bắt được, owner chốt cách xử lý — "trục xuất":** `POST /auth/register`
>   là công khai và A2 xác minh chỉ "mềm", nên hôm nay **ai cũng đăng ký trước bằng email người khác
>   được rồi nằm sẵn trong tài khoản đó**. Khi Google chứng minh quyền sở hữu một email mà tài khoản
>   nội bộ **chưa từng xác minh**: thu hồi toàn bộ phiên + **xoá mật khẩu** + đánh dấu đã xác minh.
>   Không ai bị khoá ngoài (vẫn vào bằng Google; muốn có mật khẩu thì đặt qua Quên-mật-khẩu).
> - **Verify:** api **313 test** (+21: 10 `google-oauth`, 11 `auth.controller` mới) · builder **417**
>   (+3) · typecheck 22/22 · biome sạch file đã đổi · **live smoke `node dist`**: chưa cấu hình ⇒
>   `providers {google:false}` + route 404 + nút ẩn; có cấu hình ⇒ nút hiện, bấm → 302 sang
>   `accounts.google.com` đủ tham số + `Set-Cookie: oauth_state … HttpOnly; SameSite=Lax`,
>   `state` rác **và** nonce lệch đều ⇒ 302 `/login?error=oauth` mà **không set cookie auth nào**,
>   đăng nhập mật khẩu cũ vẫn 200, console sạch. **Migration đã `migrate deploy`** (`psql \d "User"`
>   xác nhận `passwordHash` nullable) và 53 user hiện có không hề hấn gì.
> - **✅ ĐÃ CHẠY TRỌN VÒNG THẬT QUA GOOGLE (owner tự bấm, cùng ngày):** OAuth client thật →
>   màn hình chọn tài khoản của Google → callback → vào thẳng `/projects`. Kiểm chứng sau đó:
>   `/auth/me` trả đúng danh tính, `displayName` lấy từ hồ sơ Google, `emailVerifiedAt` **tự
>   đánh dấu**, `passwordHash` **NULL**, personal tenant + role `Admin` (`*`) auto-provision đúng,
>   `document.cookie` **không đọc được** `access_token` (HttpOnly thật sự), console sạch.
>   ⇒ kết luận về `SameSite=Lax` ở trên **không còn là suy luận**: cookie state đã sống sót qua
>   đúng cái điều hướng top-level quay về từ `accounts.google.com`.
> - ⚠️ **GOTCHA môi trường (mất thời gian nhất khi bật):** `pnpm dev` của owner proxy `/api` sang
>   `:3001` = **container image CŨ** (404 mọi route A3). Tệ hơn: chạy song song 2 Vite cùng cổng
>   5173 thì trên Windows `localhost` phân giải `::1` **trước** ⇒ trình duyệt trúng Vite kia còn
>   `127.0.0.1:5173` trúng cái đúng, hai hostname cho kết quả khác nhau. Muốn dùng lại stack
>   compose thì phải **build lại image api**, và credential khi đó phải nằm ở **`.env` thư mục
>   GỐC** (compose đọc root, không đọc `apps/api/.env`).
> - **⚠️ Known-gap (CỐ Ý):** liên kết theo **email đã xác minh**, không lưu `googleId` ⇒ đổi email
>   chính của tài khoản Google thì lần sau vào sẽ tạo tài khoản mới · **chưa có UI liên kết/gỡ**,
>   chưa hiện "tài khoản này đăng nhập bằng Google" · tài khoản chỉ-Google không đăng nhập bằng
>   mật khẩu được cho tới khi tự đặt qua Quên-mật-khẩu, mà đường đó **cần SMTP** (không SMTP ⇒ link
>   chỉ nằm trong log API) · người dùng THẬT chưa xác minh email mà đăng nhập Google sẽ **mất mật
>   khẩu đang dùng** (cái giá đã cân nhắc của việc trục xuất) · `state` không one-time-use ⇒ replay
>   trong 10 phút chỉ khả thi nếu kẻ tấn công có **cả URL lẫn cookie HttpOnly của đúng trình duyệt
>   đó** · redirect sau đăng nhập ghép thẳng `APP_PUBLIC_URL + "/projects"`, **bỏ qua
>   `VITE_BASE_PATH`** (cùng giả định sẵn có của `authLink`) · `GOOGLE_REDIRECT_URI` cho phép override
>   khi API ở domain khác SPA, nhưng **đó chưa phải đường đi được hỗ trợ**: cookie auth là
>   `SameSite=Strict` nên API khác origin sẽ hỏng phiên của SPA, độc lập với OAuth · vẫn dính
>   known-gap A2: access-token 15m không thu hồi được.

### Phase B — Nền tảng Tenant + Org/Department (để client cài & tự cấu hình) ⭐⭐ [B1–B4 ✅ DONE 2026-07-03 — PHASE B XONG] [làm TRƯỚC RBAC]
Theo framing vendor↔client: **1 tenant = 1 client/installation** (EVN là 1 tenant). RBAC/form/workflow
đều **scope theo tenant + org/phòng ban** nên hạ tầng này phải có TRƯỚC.
- **B1 — Tenant model:** `Tenant`(installation của 1 client) + `Membership`(user thuộc tenant, có thể nhiều
  tenant). Tổng quát hóa `ownerId` hiện tại → `tenantId` (giữ tương thích: tenant mặc định cho data cũ).
  > **✅ ĐÃ LÀM (2026-07-02) — owner chốt: chỉ B1 · personal-tenant mỗi user · tenantId chỉ trên Project:**
  > - **Schema (additive):** model `Tenant`(id/name/slug@unique/kind `personal|team|enterprise` = seam
  >   edition §6.7) + `Membership`(user↔tenant, `@@unique([userId,tenantId])`, FK→User+Tenant Cascade) +
  >   `Project.tenantId`(+index+FK) — **GIỮ NGUYÊN** `ownerId` và `@@unique([ownerId,slug])` (B4 dời việc
  >   đổi unique sang tenantId). RBAC/role trong tenant để Phase C (Membership chưa có role).
  > - **Migration `20260702063854_add_tenant` + backfill:** tạo bảng → thêm `tenantId` nullable → backfill
  >   **1 personal tenant / mỗi ownerId ∪ mỗi User** (id tất định `tnt_<owner>`, slug `personal-<owner>`) +
  >   membership/user → `UPDATE Project.tenantId` → NOT NULL + FK. **Giữ nguyên cô lập dữ liệu hiện tại**.
  > - **`TenantRepo`** (mirror refresh-token repo): `ensureTenantForOwner(ownerId)` upsert tenant theo slug
  >   **KHÔNG tạo membership** (an toàn cho owner không phải User — import script/legacy); `ensurePersonalTenant(userId)`
  >   = ensureTenantForOwner + membership upsert (đường auth, user thật). `auth.service.issue()` gọi
  >   `ensurePersonalTenant` → auto-provision khi register/login/refresh. `prisma-project.repo` create+ensureUnfiled
  >   dập tenantId qua `ensureTenantForOwner` (KHÔNG đổi chữ ký; `ProjectRecord` read-model chưa lộ tenantId).
  > - **Zero behavior change:** đọc/scope vẫn theo `ownerId` (B1 chỉ *ghi* tenantId). Enforcement theo tenant = B3/C.
  > - **Verify ALL PASS:** api typecheck · **151 test** (auth +1: auto-provision + idempotent) · biome sạch 7 file ·
  >   **KHÔNG changeset** (app private) · reviewer **PASS** (no required fix) · **live-smoke Postgres thật** (built
  >   `node dist`): backfill `tnt_local`/`mem_local` OK; admin tạo project→`tnt_local`; user mới register→tenant
  >   RIÊNG (`personal-<uid>`), project trỏ đúng; user mới **KHÔNG thấy** project của admin (isolation); membership
  >   = 1/user dù login 2 lần (idempotency). Dọn data smoke + temp script.
  > - ⚠️ **Root-cause fix trong lúc làm:** ban đầu project-write gọi `ensurePersonalTenant` → FK
  >   `Membership.userId→User` vỡ khi owner không có User row (import script/legacy) → tách 2 method
  >   (`ensureTenantForOwner` không-membership cho đường ghi-project; `ensurePersonalTenant` có-membership cho auth).
  > - ⚠️ **Known-gap (non-blocking):** `ensurePersonalTenant` upsert tenant+membership chưa atomic (idempotent
  >   self-heal); `issue()` chạy mỗi login+refresh (rẻ, idempotent); tenant `name` set-once (update:{}) — cosmetic.
  > - **Seam Phase C/B3:** `tenantId` sẵn trên Project + membership/user; B3 gắn tenantId mọi bảng + scope-guard.
- **B2 — Org/Department hierarchy** (phỏng EVN `Organization`+`Department`, `parent` phân cấp): client tự
  khai cây đơn vị/phòng ban của họ (DATA, không hardcode). User gắn org/department.
  > **✅ ĐÃ LÀM (2026-07-02) — cây `OrgUnit` HỢP NHẤT (không copy 2-entity EVN):** đã đọc source EVN
  > (`core-service` `Organization` `code/name/parent_code` + `Department` `code/name/parent_code/organization_code/level`
  > = **2 entity**). **Quyết định (§1.1 primitive tổng quát, KHÔNG hardcode EVN):** làm **1 cây `OrgUnit`
  > tự-tham-chiếu, scope theo tenant** + nhãn tùy chọn `kind` ("organization"/"department"/client đặt) — client
  > dựng độ sâu tùy ý; KHÔNG nhét mô hình 2-tầng EVN vào code vendor. Mirror pattern `Folder` sẵn có.
  > - **Schema (additive):** model `OrgUnit`(id/tenantId/parentId?/name/kind?/order, cây `OrgUnitTree` Cascade,
  >   `@@index([tenantId,parentId])`) + `Membership.orgUnitId?`(FK SetNull = **seam đặt user**, writer ở Phase D)
  >   + `Tenant.orgUnits`. Migration `20260702070520_add_org_unit` thuần additive (bảng mới + cột nullable, **không backfill**).
  > - **Repo/feature:** `OrgUnitRepo`+`PrismaOrgUnitRepo` (mirror FolderRepo) wire persistence.module; thêm
  >   `TenantRepo.findTenantIdForUser` (đọc Membership → resolve tenant caller). Module `modules/org-units/`
  >   (service/controller/dto mirror `folders/`): **scope theo tenant MỌI op** — create trong tenant caller,
  >   update/delete load-by-id + assert `tenantId` khớp → **404** (no existence leak); move cycle **TÁI DÙNG
  >   `wouldCreateCycle`** (folders); non-empty delete → 409 trừ `?cascade=true`. Route `GET/POST/PATCH/DELETE /org-units`.
  > - **★ Enforcement cross-tenant THẬT đầu tiên** (nhưng chỉ trên resource mới; query owner-scoped cũ chưa đụng = B3).
  > - **Verify ALL PASS:** api typecheck · **156 test** (org-units +5: tenant-scope/cross-tenant-404/cycle-409/
  >   non-empty-delete) · biome · **KHÔNG changeset** (app private) · reviewer **PASS** (no fix; advisory:
  >   `findFirst` chưa order — ok personal-tenant; đã fix normalize `kind` trong update) · **live-smoke Postgres**
  >   (tạo cây 3 node→list→move→cycle 409→non-empty 409→cascade 204→empty; user mới list rỗng + PATCH/DELETE
  >   unit tenant khác → 404). Dọn data + orphan tenant + temp script.
  > - **Chưa làm (Phase D/C):** UI admin org, endpoint gán user↔orgUnit (writer của `orgUnitId`), data-scope RBAC.
- **B3 — Tenant-scoping:** mọi bảng dữ liệu (project/form/workflow/submission/preset…) gắn `tenantId`;
  repository lọc theo tenant tập trung (guard/interceptor) — **chống rò dữ liệu chéo tenant** (rủi ro chính).
  > **✅ ĐÃ LÀM (2026-07-02) — tenant-scoping READS qua chokepoint duy nhất; owner chốt 3 fork: map theo
  > RBAC functions · union mọi tenant trong list · B3 chỉ reads (B4 tách riêng).** Không migration DB —
  > schema đã đủ từ B1/C (mọi resource con treo dưới `projectId`, Project đã có `tenantId`).
  > - **Kiến trúc:** MỌI module con (folders/forms/workflows/instances/submissions/versions/presets/
  >   status-catalog/themes/members) đều access-check qua `ProjectsService.requireAccess`/`resolveRole` →
  >   thêm "đường thứ 3" đúng 1 chỗ là tenant-scoping lan ra toàn bộ reads (không cần gắn tenantId từng bảng
  >   — `projectId → Project.tenantId` là đủ).
  > - **Map quyền (data-driven §1.1, `modules/projects/tenant-role.ts` thuần):** functions hiệu dụng của user
  >   trong tenant của project (`RbacRepo.resolveFunctions`) → project role: `*`→owner (client-admin quản trọn) ·
  >   any-of `form.manage|workflow.manage|submission.manage|version.publish`→editor · any-of
  >   `form.read|workflow.read|submission.read|workflow.run`→viewer · không role→**404** (member mới chưa gán
  >   role không thấy gì — admin kiểm soát bằng role). Union semantics: role cuối = max(W5 grant, tenant role)
  >   — grant thấp không demote tenant-admin.
  > - **List:** `/projects` = owned ∪ shared (W5) ∪ project của mọi tenant user giữ role ≥viewer
  >   (`TenantRepo.listTenantIdsForUser` + `ProjectRepo.listByTenants`); dedupe, sort updatedAt.
  > - **Repo Δ:** `ProjectRecord.tenantId` lộ ra + `listByTenants` · `TenantRepo.listTenantIdsForUser`
  >   (oldest-first, cùng ordering `findTenantIdForUser`). FE builder KHÔNG đổi (list tự hiện qua API).
  > - **Test:** +11 (tenant-role 4 thuần + workspace B3 7: admin-`*` owner-level · manage→editor ·
  >   read→viewer · no-role 404 · cross-tenant 404 (§8 leak) · list union dedupe · union-not-demote).
  >   Fake dùng chung `src/testing/fake-tenant-rbac.ts` (8 file test service tái dùng).
  > - **Verify:** typecheck · 189/189 test · biome · reviewer PASS (0 fix) · **live-smoke Postgres 29/29**
  >   (member-chưa-role 404 → gán form.read thấy list+tree nhưng ghi 403 → +form.manage ghi 201 →
  >   role Admin `*` rename 200 → outsider 404 cả GET/tree/PATCH) · **UI smoke MCP** (member login thấy
  >   project tenant badge Shared, mở editor load form THẬT, console sạch trừ warning antd pre-existing).
  > - **⚠️ Known-gap (chuyển B4/C3):** granularity thô — 1 function read cấp viewer CẢ project (per-resource
  >   data-scope = C3); member tạo project mới vẫn vào tenant CÁ NHÂN (writes + unique-index = B4);
  >   active-tenant selection chưa có (`/rbac`,`/org-units` vẫn resolve personal-first).
- **Hai tầng admin:** vendor-admin (quản tenant) vs client-admin (quản trong tenant). Onboarding tenant.
- Khuyến nghị **shared-DB + `tenantId` + scope-guard** (đủ cho self-host + SaaS; tránh schema-per-tenant nặng).
- **B4 — Chiến lược di trú `ownerId`→`tenantId` (codex):** tạo **tenant mặc định** cho data hiện có →
  **backfill** `tenantId` cho project/form/workflow/submission/preset → đổi unique index (`ownerId+slug`
  → `tenantId+slug`, tương tự các unique khác) → **test dữ liệu cũ vẫn truy cập được** (bootstrap admin
  id="local" ∈ tenant mặc định). Migration additive, không phá JSON đã lưu.
  > **✅ ĐÃ LÀM (2026-07-03) — tenant WRITES; owner chốt 3 fork: picker per-create (không active-tenant
  > switcher) · editor+ được tạo · ⚠️ DEVIATION: BỎ "gắn tenantId mọi bảng + backfill"** — B3 chứng minh
  > chokepoint `projectId→Project.tenantId` đủ enforcement; tenantId per-table là denormalize thừa (chỉ
  > cần nếu sau này query trực-tiếp-theo-tenant không qua project). B4 thực tế = unique index + create-path:
  > - **Migration `20260703000000_change_project_unique_tenant_slug`:** `@@unique([ownerId,slug])` →
  >   `@@unique([tenantId,slug])`; index `[tenantId]` → `[ownerId]` (unique mới cover prefix tenantId;
  >   `list(ownerId)` vẫn cần index). An toàn: data hiện có tenant 1:1 owner → không thể đụng unique
  >   (CREATE fail loudly nếu giả định sai). `ensureUnfiled` upsert theo `tenantId_slug`.
  > - **Create-path:** `POST /projects` +`tenantId?` — target ≠ personal → cần role ≥ editor qua
  >   `projectRoleFromFunctions(resolveFunctions)` (REUSE B3): non-member 404 · viewer 403; slug taken-set
  >   từ `listByTenants([target])` → **slug unique per-tenant xuyên creator** (`hr`→`hr-2`). Creator giữ
  >   `ownerId` (owner role Track-W).
  > - **`GET /tenants` mới (`modules/tenants/`):** memberships oldest-first → `{id,name,kind,personal,
  >   projectRole}` (personal = slug `personal-<userId>`); FE lọc editor+ cho picker.
  > - **Builder:** modal New-project + antd `Select` workspace (chỉ hiện khi >1 tenant đủ quyền, default
  >   Personal, chỉ gửi tenantId khi chọn team); `useMyTenants` + `qk.myTenants` + client `listMyTenants`.
  > - **Verify:** api typecheck·**195 test**(+6) · builder typecheck·**381 test**(+2) · biome · reviewer
  >   PASS (1 nit comment đã sửa) · **live-smoke Postgres 16/16** (GET /tenants shape/role · editor tạo
  >   vào team 201 + admin thấy · slug -2 xuyên owner · viewer 403 · outsider 404 · default personal) ·
  >   **UI smoke MCP** (member login → New project → Select "Personal workspace"/"Administrator" → tạo vào
  >   team → psql xác nhận `tnt_local`+ownerId member → admin thấy; console sạch). KHÔNG changeset.
  > - **⚠️ Known-gap:** tenant `name` xấu (= ownerId/backfill) — rename tenant UI thuộc admin phase sau;
  >   active-tenant selection vẫn chưa có (`/rbac`,`/org-units` personal-first); member rời tenant chưa có UI.

### Phase C — RBAC data-driven (phân quyền chức năng + dữ liệu, cấu hình được) ⭐⭐ Δ [C1+C2+C4 ✅ 2026-07-02; C3 ✅ 2026-07-28; C5-custom 📋 PLANNED] [crux]
Phỏng mô hình EVN nhưng bằng Prisma; **KHÔNG hardcode role** — client tự cấu hình:
- **C1 — Function catalog:** `Function`(bản ghi DB: `code`/`name`/`parentCode` phân cấp — vd `form.manage`,
  `workflow.manage`, `user.admin`, `version.publish`) do **platform khai bộ gốc** + **client mở rộng**.
  Đây là "phân quyền chức năng" data-driven (không phải enum cứng).
- **C2 — Role (tenant/org-scoped) + mappings:** `Role`(client tạo) · `RoleFunction`(role→function =
  chức năng) · `UserRole`(user↔role **M-N — 1 user nhiều role**). Permission hiệu dụng = union functions
  của các role user giữ.

> **✅ ĐÃ LÀM (2026-07-02) — lát cắt C1+C2+C4 (owner chốt: function/role/enforcement, HOÃN C3 data-scope):**
> - **Schema (additive, migration `20260702074515_add_rbac`):** `Function`(`code @id`/`name`/`parentCode?`/
>   `system` — catalog toàn cục platform-seeded, **read-only** slice này; client-custom = hoãn, thêm `tenantId?`
>   sau) + `Role`(`id`/`tenantId`/`name`/`description?`/`system`, `@@unique([tenantId,name])`, scope-tenant) +
>   `RoleFunction`(join `roleId↔functionCode`) + `UserRole`(**M-N** `userId↔roleId`) + back-relations
>   `User.roles`/`Tenant.roles`. Thuần additive (4 bảng mới + cột relation-only), KHÔNG đụng bảng cũ → không
>   backfill (provisioning lười lúc login). **KHÔNG changeset** (app private).
> - **Enforcement (C4):** `@RequireFunction('role.admin')` (`auth/require-function.decorator.ts`) +
>   `FunctionGuard` (APP_GUARD trong `RbacModule`, bind SAU `JwtAuthGuard` của AuthModule): no-metadata→allow;
>   resolve tenant (`findTenantIdForUser`)+functions của caller; **sentinel `*`→allow-all** (thay hardcode EVN
>   `code==='ADMIN'` §6.6); thiếu→**403**, no-principal→401, no-tenant→403. Gate **chỉ endpoint /rbac mới**
>   (KHÔNG rip `CurrentOwner` route cũ — giảm rủi ro, thay dần sau).
> - **Base catalog (C5 mã ổn định, seed idempotent lúc boot `RbacService.onModuleInit`):** `form.read/manage`,
>   `version.publish`(parent `form.manage`), `workflow.read/manage/run`, `submission.read/manage`, `org.admin`,
>   `role.admin`, `user.admin`. `*` (superadmin) seed riêng trong `ensureTenantAdmin` để thỏa FK RoleFunction,
>   **ẩn khỏi `listFunctions`** + `assertKnownFunctions` từ chối → client KHÔNG grant được `*` qua API (governance).
> - **Provisioning:** `auth.issue()` sau `ensurePersonalTenant` → `RbacRepo.ensureTenantAdmin(user,tenant)`
>   (idempotent: role `Admin` giữ `*` + UserRole) ⇒ mọi user hiện tại giữ full-access trong tenant của họ, giờ
>   biểu diễn qua RBAC data-driven. Auth service +dep `RbacRepo` (global, không tạo cycle module).
> - **Endpoints `modules/rbac/`:** `GET /rbac/me/functions` (open-authed, **seam nav §6.7**) · `GET /rbac/functions`
>   · CRUD `/rbac/roles` + `PUT /rbac/roles/:id/functions` (gate `role.admin`) · `GET/PUT /rbac/users/:id/roles`
>   (gate `user.admin`, **scope-tenant** cả delete). Mirror pattern org-units (repo-interface+prisma-impl+DTO;
>   requireEditableRole = tenant 404 + system-role 400).
> - **Verify ALL PASS:** api typecheck · **171 test** (+15: rbac.service 8, function.guard 6, auth +1 — union
>   permission/`*` wildcard/cross-tenant 404/system-role 400/unknown-code 400/guard allow-deny-no-metadata,
>   §8 test-plan) · biome sạch · **KHÔNG changeset** · reviewer **PASS** (1 required fix ĐÃ sửa: `setUserRoles`
>   deleteMany unscoped → thread `tenantId` scope delete, chống mất data chéo tenant khi multi-tenant) ·
>   **live-smoke Postgres 10/10** (built `node dist`): anon 401 · admin `*`+catalog 200+role CRUD+set-functions ·
>   unknown-code 400 · fresh-user `*` · strip-own-wildcard→`['form.manage']`→non-admin 403 (chứng minh guard
>   ordering: 403 chứ không 401). Dọn data smoke + temp script.
> - **⚠️ Known-gap / hoãn (advisory reviewer, non-blocking):** (1) `setUserRoles`/`getUserRoles` chưa assert
>   target user CÓ Membership trong tenant (chỉ cấp quyền trong tenant admin nên không leak — Phase D user-mgmt);
>   (2) `findTenantIdForUser` trả 1 tenant — mơ hồ khi user đa-tenant (cần active-tenant selection sau); (3)
>   `parentCode` chưa dùng trong resolve (union phẳng, `version.publish` KHÔNG kéo theo `form.manage` — cosmetic).
- **C3 — Phân quyền dữ liệu:** `DataScope`/`DataPermissionGroup` gắn theo **org/department** (phỏng EVN
  `permission_data_group`↔`permission_department`↔`permission_user`) → giới hạn user chỉ thấy dữ liệu của
  đơn vị được cấp.

> **✅ ĐÃ LÀM (2026-07-28) — C3 data-scope (owner chốt: mô hình role-scoped + backend + UI tối thiểu):**
> - **Mô hình chốt: role-scoped** (`DataScope(roleId↔orgUnitId)`). Role KHÔNG có DataScope = **tenant-wide**
>   (tương thích ngược — role hiện tại giữ nguyên hành vi); role có DataScope → functions chỉ áp cho project
>   đặt trong **subtree** (ancestor-or-self) của đơn vị scoped; project chưa gắn org chỉ role-tenant-wide với
>   tới; `*` (admin, 0 DataScope) vẫn tenant-wide → thấy hết. **Membership.orgUnitId writer: DEFER** (không cần
>   cho role-scoped).
> - **Schema (additive, migration `20260728000000_add_data_scope`, hand-written):** model `DataScope`(`roleId`/
>   `orgUnitId`, `@@unique`, FK Cascade) + `Project.orgUnitId?`(FK SetNull, `@@index`). KHÔNG backfill (role
>   hiện có 0 DataScope). **KHÔNG changeset** (app private).
> - **RbacRepo:** `resolveScopedGrants(userId,tenantId)` (role → functions + scopeOrgUnitIds) + `set/
>   listRoleDataScopes`. GIỮ `resolveFunctions` (FunctionGuard/nav vẫn tenant-wide — **không đụng**, blast-radius nhỏ).
> - **Chokepoint (`ProjectsService`):** pure `projectRoleFromScopedGrants`+`collectAncestors`+`hasScopedGrant`
>   (`tenant-role.ts`, KHÔNG eval); `resolveRoleForProject`+`listTenantProjects` siết per-project theo org unit
>   (org tree chỉ load khi project đã-đặt & có grant scoped — tránh N+1 personal-tenant). Union W5-grant giữ nguyên.
> - **Writers:** `PUT /rbac/roles/:id/data-scopes` (gate `role.admin`, audit `role.set-data-scopes`, validate
>   org-unit-in-tenant→400) · project placement qua create/update `orgUnitId` (owner-gated, validate→400, `null`=gỡ).
> - **Builder (UI tối thiểu):** feature `src/org-units/` (client+useOrgUnits+`OrgUnitsPanel` Tree + pure `buildOrgTree`)
>   → tab **"Đơn vị"** trong AdminPage gate `org.admin` (thêm vào nav) · **DataScope editor** (TreeSelect) trong
>   RolesPanel + cột "Phạm vi dữ liệu" · **picker project↔org-unit** trong New-project modal + context "Đặt đơn vị".
> - **Verify ALL PASS:** typecheck api+builder · **api 216 test** (+20: tenant-role scoped/ancestor 10, workspace
>   §8 cross-scope 6 — scoped-thấy-in-subtree/out-scope-404/unplaced/`*`-tenant-wide/placement-400, rbac data-scope 3) ·
>   **builder 384 test** (+orgTree 3; PropertyPanel flake không tái diễn) · biome sạch 35 file · reviewer **PASS
>   0 required fix** (xác nhận chokepoint duy nhất, cross-tenant/cross-scope isolation, không bypass) · **live-smoke
>   Postgres 18/18** (`node dist` :3011): scope set/echo · unknown-unit 400 · placement 400 · **member scoped `eng`
>   thấy ĐÚNG project eng, KHÔNG thấy sales, out-scope→404 no-leak** · admin `*` thấy cả hai. Dọn data+member.
> - **⚠️ Known-gap (advisory, đã ghi):** Membership.orgUnitId writer defer (user-scoped model = phase sau nếu cần) ·
>   granularity vẫn theo project (chưa per-form) · active-tenant selection vẫn chưa có · enforcement thuần
>   application-layer (comment schema đã ghi "never via SQL alone" — mọi read direct-SQL tương lai phải re-apply scope).
- **C4 — Enforcement:** `@RequireFunction('form.manage')` + `FunctionGuard` (đọc union permission) +
  **data-scope filter** ở repository. Thay dần `CurrentOwner`-only; **đóng gap FS2/2C** (`?roles` hiện
  owner-declared → role thật server-side). Di trú project-member (editor/viewer Track W) vào role; bootstrap
  admin (id="local") nhận role admin của tenant mặc định.
- **C5 — Governance function-catalog (codex):** quy ước **mã quyền ổn định** (`form.read`,`form.manage`,
  `workflow.run`,`workflow.manage`,`user.admin`,`role.admin`,`version.publish`…); **platform seed bộ gốc
  bất biến** (client KHÔNG được override/xóa mã gốc, CHỈ được thêm mã mới của họ) → tránh vỡ khi platform
  nâng cấp. Versioning catalog khi thêm quyền mới.
- ⚠️ Phase LỚN nhất, dễ sai — làm additive, test kỹ, chốt **bộ function tối thiểu** trước, không mạ vàng.

### Phase D — Admin panels (builder web) [phần owner nêu: quản lý form/user/workflow/version] [D1 ✅ DONE 2026-07-02]
Feature-folders mới trong `apps/builder` (theo convention `feature-module`), gated bởi function (C4).
**Client-admin** cấu hình tenant của họ; **vendor-admin** quản tenant/installation:
- **D1 — User & Role management:** liệt kê user, gán nhiều role, tạo/sửa role + gán permission chức năng,
  cấu hình data-scope (phòng ban/tổ chức). (phỏng `web-admin/userManager`)
  > **✅ ĐÃ LÀM (2026-07-02) — owner chốt 3 quyết định (đánh giá lại theo suggestions.txt codex):**
  > gộp **add-member-by-email** vào D1 (không có nó user-list luôn =1, không demo được gán role) ·
  > gộp **audit-log write-side** (§8 — lẽ ra bật cùng C/D) · **phase kế = B3** (tenant-scoping reads).
  > - **Backend (`apps/api`, additive):** `GET /rbac/users` (member + roleIds theo tenant, 1 query nested
  >   include no-N+1) · `POST /rbac/users {email}` add-member (reuse `UserRepo.findByEmail`, email không
  >   có → 404; idempotent qua `TenantRepo.addMember` upsert) · đóng known-gap C#1: `get/setUserRoles`
  >   assert target CÓ Membership (`TenantRepo.isMember`) → 404 · `@RequireFunction` chuyển **any-of**
  >   (`every`→`some`, mirror web-admin `hasPermissionForAccessPage`; route đa-code duy nhất:
  >   `GET /rbac/roles` = `role.admin|user.admin` để user-admin đọc tên role) ·
  >   **`findTenantIdForUser` tất định** (`orderBy createdAt asc` = membership cũ nhất = personal tenant
  >   → bị thêm vào tenant khác KHÔNG đổi context) · **AuditLog** (model+migration `add_audit_log`,
  >   string-ref không FK để log sống lâu hơn actor/target; `AuditRepo`+Prisma impl) ghi
  >   `role.create/update/delete`, `role.set-functions`, `user.set-roles`, `member.add`.
  > - **Builder (`apps/builder`):** seam §6.7 **`useAuth().functions`** (query `qk.myFunctions` trên
  >   `GET /rbac/me/functions` + `functionsLoading`); `auth/functions.ts` thuần `hasFunction`/`hasAnyFunction`
  >   (wildcard `*` MỘT chỗ); `nav.ts` `NavSection.anyFunction` — section `admin` bật, gate
  >   `user.admin|role.admin`; feature-folder **`src/admin/`** (client/useAdmin react-query/AdminPage tabs
  >   Người-dùng+Vai-trò gate theo function, deep-link không quyền → Result 403/UsersPanel thêm-member+gán-role/
  >   RolesPanel CRUD+Checkbox-catalog, role `system` khóa); route `/admin`; mutation nào cũng invalidate
  >   `qk.myFunctions` → nav gate tự cập nhật.
  > - **Verify ALL PASS:** api typecheck · **178 test** (+9: rbac 14, guard any-of 7; 2 import-script test
  >   hết skip vì Postgres bật) · builder typecheck · **379 test** (nav 5 + hasFunction 3; 1 flaky timeout
  >   pass khi rerun) · biome 32 file · reviewer **PASS** (0 required fix) · **live-smoke UI MCP** (built
  >   `node dist` + Vite): admin login → rail Quản trị → add-member user2 → tạo role "Biên tập" + grant
  >   `form.manage,version.publish` (catalog 11 code, `*` ẩn ✓) → gán user2 → tag hiện; **AuditLog 4 action
  >   đúng tenant/actor (psql)** ✓; negative: user2 login (thấy Quản trị của tenant CÁ NHÂN — đúng thiết kế
  >   mọi user là admin tenant mình; user-list chỉ có mình = scope ✓) → tự bỏ role Admin → **rail mất
  >   Quản trị NGAY + /admin Result 403 + API 403/403 (không phải 401 = guard ordering ✓)**, `me/functions`
  >   `[]`; console sạch (chỉ log 403 chủ đích). Dọn data smoke. KHÔNG changeset (apps private).
  > - **⚠️ Known-gap (advisory, không chặn):** (1) add-member không cần consent của target + 404 lộ
  >   email-đã-đăng-ký (chỉ lộ cho user.admin — chấp nhận; invite thật = A2/SMTP); (2) audit `detail` chứa
  >   PII (email) — D5 read/retention phải tôn trọng; (3) **active-tenant selection chưa có** — user
  >   đa-tenant luôn resolve tenant cá nhân (tất định nhưng chưa switch được; làm cùng/sau B3); (4) member
  >   được thêm chưa thấy project tenant (reads còn ownerId-scoped) — **đúng là việc của B3**.
- **D2 — Form management:** danh sách form toàn tenant (không chỉ của mình), trạng thái publish/version,
  chuyển owner, khóa/xóa. (phỏng `form-management` mock)
- **D3 — Workflow management:** danh sách workflow + instance đang chạy, ai đang xử lý bước nào.
- **D4 — Version management:** lịch sử version form/workflow, so sánh, rollback (đã có nền FB1 —
  publish/version/diff → nâng lên trang admin).
- **D5 — Dashboard/audit** (tùy chọn): thống kê + nhật ký thao tác.

### Active-tenant selection (đóng nợ xuyên B/C/D — chèn trước Phase E)
> **✅ ĐÃ LÀM (2026-07-29).** Nợ này lặp trong known-gap của B3/B4/C/C3/D1/D2–D4: `findTenantIdForUser`
> luôn trả **membership cũ nhất = tenant cá nhân**, nên với user đa-tenant thì quyền (FunctionGuard/nav),
> RBAC admin, org-unit và catalog D2–D4 đều chạy trên tenant cá nhân thay vì tenant team họ đang làm.
> Cả 9 call-site đi qua **1 repo method** ⇒ đóng trước Phase E rẻ hơn nhiều so với sau (E cũng tenant-scoped).
>
> - **Nguồn sự thật duy nhất:** `TenantRepo.resolveTenantForUser(userId, requestedTenantId?)` — method
>   **concrete** trên lớp abstract (mọi impl + test-fake thừa kế, 0 churn), chỉ chấp nhận tenant được yêu
>   cầu khi `isMember`; không thì rơi về `findTenantIdForUser`. Header giả/cũ **không bao giờ nới quyền**.
> - **Transport = header `X-Tenant-Id`** (không cookie, không claim JWT): `apiFetch` là chokepoint FE duy
>   nhất nên chỉ gắn 1 chỗ; stateless, không phải cấp lại token khi đổi workspace; **vắng header ⇒ hành vi
>   y hệt trước** (tương thích ngược tuyệt đối). Đọc qua `@ActiveTenant()` (param decorator) và
>   `activeTenantFromRequest()` (cho guard).
> - **Áp dụng:** `FunctionGuard` · `rbac` (11 method) · `org-units` (4) · `admin-catalog` (4) ·
>   `projects.list/create`. Tham số service để **optional** — bắt buộc sẽ ép sửa ~70 call-site test
>   đơn-tenant mà giá trị đúng là `undefined`; đổi lại có test đa-tenant riêng + live-smoke + reviewer.
> - **`/projects` (owner chốt: lọc theo workspace đang chọn):** owned + tenant-project narrow về workspace
>   đã chọn; **không chọn ⇒ GIỮ union B3** (nếu lọc luôn thì member team chưa kịp biết switcher sẽ thấy
>   danh sách rỗng — 2 test B3/C3 bắt được đúng điều này); **W5 share trực tiếp KHÔNG bao giờ lọc** (có thể
>   nằm ở tenant mình không phải member ⇒ lọc là khoá vĩnh viễn). `create` mặc định vào workspace đang chọn,
>   check editor+ cho target ≠ personal giữ nguyên.
> - **UI:** `shell/TenantSwitcher` (Dropdown đầu NavRail, **ẩn khi ≤1 tenant** ⇒ user hiện tại không thấy gì
>   đổi) → lưu `localStorage` + `invalidateQueries()` toàn bộ (mọi cache đều tenant-scoped) → về `/projects`.
>   Logout xoá lựa chọn. Picker New-project default = workspace đang xem và **luôn gửi `tenantId` tường minh**.
> - **Verify:** api **245 test** · builder **394 test** · typecheck 2 app · biome sạch · **live-smoke HTTP
>   30/30** (`node dist` :3011 + Postgres thật: quyền/guard/org-unit/project/create đều đổi theo header;
>   tenant lạ → fallback không nới quyền; outsider mượn header → 404 no-leak) · **UI smoke playwright**
>   (member 2 workspace: 4 dự án → đổi sang team còn 2 · `/admin` từ **7 tab (`*` cá nhân) → 3 tab**
>   (form.admin+org.admin của team) · thấy "Team HQ" của tenant admin · reload giữ lựa chọn · logout xoá ·
>   admin 1 workspace **không** thấy switcher · console sạch).
> - **⚠️ Known-gap còn lại:** lựa chọn workspace là **per-browser** (localStorage), chưa lưu server ⇒ máy
>   khác phải chọn lại · chưa có "Tất cả workspace" tường minh trong switcher (trạng thái union chỉ tồn tại
>   khi CHƯA chọn lần nào) · `resolveTenantForUser` tốn thêm 1 truy vấn `isMember`/request khi có header
>   (index unique `userId+tenantId`, chấp nhận được).

### Phase E — Ticket / Work-order (form + workflow → runtime công việc)
- Từ 1 form + workflow đã cấu hình → **tạo ticket** (instance) chạy qua các bước; theo dõi "ai sẽ / đã /
  đang làm" (đã có Run-view + engine + case-label). Nâng thành trang **Work-order manager** (tạo/gán/lọc
  theo người xử lý/trạng thái). (phỏng `web-admin/workOrder` + `workflowTicket`)
- Tái dùng: workflow-core engine + form submission runtime + field-level RBAC (maskData).

> **✅ ĐÃ LÀM E1 (2026-07-29).** Phạm vi owner chốt: *tối thiểu-nhưng-thật* — 1 người phụ trách + audit,
> **tách quyền runtime**, maskData cho case data, tạo case từ trang Vận hành, phân trang/sắp xếp
> server-side, nhãn trạng thái thật, mail báo giao việc. Plan `~/.claude/plans/sunny-skipping-coral.md`
> đã qua vòng **`plan-reviewer` độc lập trước khi code** (cơ chế mới, xem `CLAUDE.md`).
>
> - **Lỗ hổng nền phát hiện lúc lập plan (crux của phase):** `tenant-role.ts` xếp `workflow.run` vào
>   `VIEWER_FUNCTIONS`, trong khi `advance()` đòi `editor` ⇒ **operator được cấp đúng quyền vẫn 403**.
>   Fix: `canRunWorkflow` + `ProjectsService.requireRunAccess` — "chạy case" là quyền RIÊNG, không kéo
>   theo quyền sửa form/quy trình. KHÔNG đụng `EDITOR_FUNCTIONS`/`VIEWER_FUNCTIONS` (blast-radius chỉ
>   trong runtime workflow).
> - **Contract (additive, KHÔNG bump `CURRENT_WORKFLOW_VERSION`):** `historyEntry.actor?` +
>   `AdvanceContext.actor` — engine chỉ ghi khóa khi caller cung cấp ⇒ entry cũ byte-identical. 2 changeset patch.
> - **Dữ liệu:** migration `20260730000000_add_work_order` — `assigneeId` (FK→User, SetNull) ·
>   `statusLabel` · `statusKind` (denormalize từ node của definition, ghi tại mỗi upsert) · 2 index.
>   Nhờ denormalize, list/lọc/sắp xếp không phải nạp definition và cột trạng thái hiện **nhãn người đọc được**.
> - **API:** module `work-orders` (list + filter + paging + assignees + runnable workflows) gate
>   `@RequireFunction("workflow.run")` — **KHÔNG kèm `workflow.admin`** (`resolveFunctions` không nở
>   `parentCode` ⇒ người chỉ có `workflow.admin` sẽ qua guard nhưng map ra role `null` = trang rỗng) ·
>   `POST /workflow-instances/:id/assign` + audit `case.assign` + mail Mailpit · **maskData cho case data**
>   ở `load`/`start`/`advance` (che ở đường ĐỌC; bản persist vẫn chưa che, nếu che rồi ghi lại sẽ **xoá**
>   dữ liệu của trường bị ẩn) · danh sách luôn narrow về **1 workspace** (`ProjectsService.list` cố ý
>   không lọc W5-share theo tenant — đúng cho màn Thiết kế, sai cho Vận hành vì mọi lựa chọn người nhận
>   lệch tenant đều 400).
> - **Builder:** feature-folder `src/operate/` (client · hooks react-query · filters · bảng phân trang
>   **server-side** · modal Tạo việc · OperatePage) · nav `operate` bật với `anyFunction:["workflow.run"]`
>   (khớp server) · route `/operate` · Run-view thêm **Người phụ trách** + "Nhận việc" và hiện **tên người
>   thực hiện** trong lịch sử (id không khớp ⇒ để trống, không bao giờ hiện id thô). Cột "Người xử lý" là
>   Select gán tại chỗ, **khoá theo cờ `canRun` server trả về từng dòng** thay vì để người dùng ăn 403.
> - **3 lỗ hổng `plan-reviewer` bắt được trước khi code (đều đã sửa + có test):** (1) `advance` trả
>   instance **chưa che** ⇒ vô hiệu hoá mask của `load`; (2) `start` với `id` client-chọn **ghi đè case
>   project khác** (E hạ ngưỡng xuống `workflow.run` nên với tới được) ⇒ nay 409; (3) `label` denormalize
>   có thể chính là field bị gate mà lại hiện cho mọi người + search `?q=` ⇒ nay derive từ
>   `maskData(..., {roles: []})`.
> - **Verify:** api **282 test** · schema 24 · core 37 · builder **403 test** · typecheck 2 app · biome sạch ·
>   **live-smoke HTTP 31/31** (`node dist` :3011 + Postgres + Mailpit) · **UI smoke playwright** (rail hiện
>   Vận hành → 22 case: trang 2 đúng 2 dòng → gán tại chỗ → lọc "Việc của tôi" → tìm theo nhãn → Tạo việc
>   (kèm giao luôn) → mở case: Người phụ trách + lịch sử có tên + Nhận việc/Bỏ nhận → console sạch) ·
>   subagent `reviewer` (2 finding `required` đã sửa: đổi quy trình giữ lại trạng thái node cũ ⇒ list rỗng
>   vĩnh viễn; nút "Nhận việc" hiện cho người chắc chắn bị 403).
> - **⚠️ Known-gap (CỐ Ý hoãn):** ~~chưa có due-date/priority/bình luận~~ (đã đóng ở **E2** bên dưới) ·
>   **1 người phụ trách** (không phải
>   nhiều vai trò kiểu `ticket_role_values` của EVN) · gán chỉ kiểm người nhận là member tenant (không kiểm
>   họ có quyền trên project) · thông báo chỉ qua email (chưa in-app) · **field gated nằm trong row của
>   array có thể bị mất khi client echo lại cả mảng** (merge nông ở engine) · trang Vận hành luôn thuộc
>   **một** workspace (khác `/projects` vốn union khi chưa chọn) · `transition.role` vẫn là gap WF4 (caller
>   tự khai roles) — biên thật là `requireRunAccess`.

> **✅ ĐÃ LÀM (2026-07-30) — E2 "làm dày work-order": hạn xử lý · độ ưu tiên · bình luận.**
> Owner chốt: sửa **tại chỗ trên bảng Vận hành + run-view** (không thêm màn hình) · ưu tiên **3 mức**
> (Thấp/Bình thường/Cao) · bình luận **ĐỌC = `viewer`, VIẾT = quyền chạy case** · **KHÔNG thêm email**.
> - **Schema:** `WorkflowInstanceRecord.dueAt/priority` + bảng `WorkflowInstanceComment`
>   (migration `20260731000000_add_work_order_e2`, `priority` NOT NULL DEFAULT 2 nên hàng cũ tự có giá trị).
>   `priority` là **INT** vì bảng sort server-side theo cột này — `low|normal|high` sắp theo alphabet là vô
>   nghĩa và Prisma `orderBy` không nhận biểu thức CASE.
> - **Luật sở hữu cột (quan trọng):** hai cột mới nằm NGOÀI `WorkflowInstanceMeta`, do `setWorkOrderFields`
>   ghi riêng — y như `assigneeId`. Chạy/advance case KHÔNG bao giờ xoá hạn hay ưu tiên (có test hồi quy).
> - **Hai cái bẫy đã xử lý:** (1) lọc **quá hạn** phải viết rõ nhánh NULL — `statusKind` nullable với case
>   trước Phase E, mà `statusKind <> 'end'` trong SQL loại luôn NULL ⇒ việc quá hạn cũ sẽ mất tích;
>   (2) sort theo `dueAt` **ghim NULL xuống cuối ở CẢ hai chiều** (Postgres mặc định để NULL lên đầu khi
>   DESC ⇒ "hạn xa nhất trước" lại mở đầu bằng toàn việc không có hạn).
> - **Bình luận:** `authorName` chụp lúc ghi, `authorId` không FK — cùng lý lẽ `AuditLog` (sống lâu hơn tài
>   khoản) và `label`/`statusLabel`. Nội dung bình luận **không** vào audit trail (chỉ `commentId`).
> - **API:** `PATCH /workflow-instances/:id/work-order` (hậu tố `/work-order` cố ý: route trần dễ bị đọc là
>   "patch chính case", tức state của engine, thứ endpoint này không đụng tới) · `GET|POST
>   /workflow-instances/:id/comments` · list thêm filter `priority`/`overdue` + sort `dueAt`/`priority`.
> - **Builder:** 2 cột sửa tại chỗ trên bảng Vận hành (khoá theo `canRun` như cột Người xử lý, ngày quá hạn
>   tô đỏ **chỉ khi case còn mở**) · 2 bộ lọc mới · `operate/priority.ts` là **nơi duy nhất** biết số→nhãn/màu ·
>   `operate/CaseComments.tsx` gắn vào run-view dưới Lịch sử · thêm dep `dayjs` (API `DatePicker` của antd
>   chính là dayjs; luật peerDeps chỉ áp cho renderer, không áp cho app).
> - **2 lỗ hổng `reviewer` bắt (đã sửa + có test):** `@IsISO8601()` nhận cả `20260815`/`2026-W33-1`
>   (Date INVALID ⇒ **500** chứ không phải 400) **lẫn** dạng không có offset (`2026-08-15T09:00` bị đọc theo
>   **giờ máy chủ** ⇒ cùng một request lưu ra hai thời điểm khác nhau tuỳ nơi deploy). Nay bắt buộc ISO-8601
>   **có offset** + chốt phòng thủ khi dựng `Date`.
> - **Verify:** typecheck 22/22 · api **332** test (nền 315) · builder **427** (nền 417) · biome sạch trên
>   file đã đổi · migration `migrate deploy` + xác minh psql · **live-smoke HTTP 47/47** · **UI smoke
>   playwright** (2 cột hiện đúng, sửa ưu tiên tại chỗ ghi xuống DB, chỉ hàng quá hạn tô đỏ, lọc Quá hạn ra
>   đúng 1 việc, sort theo Hạn để NULL cuối ở cả hai chiều, mở case thấy Ưu tiên/Hạn + gửi bình luận hiện
>   đúng tên, advance xong hạn/ưu tiên/bình luận còn nguyên, console sạch).
> - **⚠️ Known-gap E2 (CỐ Ý):** bình luận **không sửa/xoá được**, không đính kèm, không @mention, không
>   thông báo · `authorName` là ảnh chụp ⇒ đổi tên hiển thị không lan vào bình luận cũ · bình luận **không
>   bị field-RBAC mask** (ai `viewer` được case thì đọc được cả luồng, kể cả tên thành viên mà màn Vận hành
>   vốn giấu sau `workflow.run`) · thread **chưa phân trang** · hạn là **một thời điểm**, không có lịch làm
>   việc/SLA/nhắc trước hạn · lọc hạn chỉ có **Quá hạn** · hạn/ưu tiên **không vào workflow contract** nên
>   không transition nào guard theo chúng được · **tô đỏ quá hạn dùng đồng hồ TRÌNH DUYỆT còn bộ lọc
>   "Quá hạn" dùng đồng hồ MÁY CHỦ** ⇒ máy lệch giờ có thể thấy hàng đỏ mà bộ lọc không trả về (và một hạn
>   trôi qua khi tab đang mở chỉ đổi màu ở lần tải lại sau) · sửa hạn/ưu tiên **làm `updatedAt` nhảy** (cột "Cập nhật" vì
>   thế phản ánh cả thao tác metadata, và hàng vừa sửa nhảy lên đầu khi đang sort mặc định) · ô sửa trong
>   run-view gate bằng `workflow.run` cấp tenant, KHÔNG phải verdict per-project ⇒ vẫn có thể ăn 403 (tính
>   chất sẵn có từ E1 với nút "Nhận việc") · xoá case song song lúc PATCH cho 500 (Prisma P2025), như `assign`.

> **🔴 SỬA BUG CÓ SẴN — id case trùng nhau (2026-07-31).** Không thuộc E1/E2, phát hiện khi viết test E2.
> `createInstance` (`packages/workflow-core/src/engine.ts`) sinh id `<workflow>-<millis>`, mà
> `WorkflowInstanceRepo.upsert` ghi **theo id** ⇒ hai case tạo trên cùng workflow trong **cùng một
> millisecond** nhận đúng một id và case sau **đè im lặng** lên case trước (mất trắng, không lỗi).
> - **Sửa:** id sinh ra nay là `<workflow>-<millis>-<random>` (`crypto.randomUUID().slice(0, 8)`, có sẵn ở
>   cả trình duyệt lẫn Node ≥ 18 nên `workflow-core` vẫn thuần, không import `node:`). Id do client tự
>   truyền **giữ nguyên**; không chỗ nào trong repo phân tích/sắp xếp theo hình dạng id ⇒ dữ liệu cũ an toàn.
> - **Test hồi quy 2 tầng** (cả hai đã được xác minh là **ĐỎ trên code cũ**): `engine.test.ts` đóng băng đồng
>   hồ rồi tạo 2 instance (2 id khác nhau, cùng mốc thời gian) · `workflow-instances.service.test.ts` tạo 2
>   case trong cùng millisecond rồi đòi `list()` trả về **2** — chính hành vi mất dữ liệu ở trên.
> - Changeset `workflow-instance-id-collision.md` (**patch** cho `@org/workflow-core`).
> - **Còn lại (cố ý, ngoài phạm vi):** `start()` vẫn ghi bằng `upsert`, nên nếu id có trùng thì vẫn là đè
>   chứ không phải lỗi; muốn kín tuyệt đối thì dùng `create` cho case mới, hoặc mở rộng chốt 409 ở
>   `workflow-instances.service.ts:100` (đang chỉ áp khi client tự truyền id) sang cả id tự sinh.

### Phase F — Form nâng cao (mẫu EVN: trường phụ thuộc, modal-chọn→apply→autofill)
- Nhiều đã có: **conditions** (JSONLogic ẩn/hiện), **reactions** (trường phụ thuộc giá trị nhau),
  **datasource** (options remote/tree). → phase này **mở rộng**, không làm lại.
- Thêm mẫu **"modal chọn giá trị → Apply → gọi API → fill nhiều trường tương ứng từ response"**: kiểu
  field `lookup/reference` mở modal, chọn bản ghi, map response→các field (mở rộng datasource + reactions
  + renderer). Δ: field-type mới, **thuần additive ⇒ KHÔNG bump `formVersion`, không migration** — thêm
  một member vào union `LeafField` không đổi hình dạng JSON cũ (JSON cũ parse nguyên vẹn, không có gì để
  migrate) — `AGENTS.md` chỉ buộc bump khi **hình dạng JSON thay đổi**, và đây đúng tiền lệ
  `display-text`. Đổi lại: renderer CŨ ghim v3 gặp form có `lookup` sẽ **fail ở `formSchema.parse`**
  thay vì báo "mới hơn renderer này hỗ trợ" — cái giá đã biết, y hệt `display-text`.

> **✅ ĐÃ LÀM (2026-07-30) — kiểu trường `lookup`.** Plan `~/.claude/plans/expressive-toasting-wind.md`
> đã qua vòng **`plan-reviewer`** (5 finding `required` sửa hết trước khi code). 2 commit theo tiền lệ
> Phase E: (1) hợp đồng + runtime, (2) builder + doc.
>
> - **3 mảnh hạ tầng còn thiếu, nay đã có** (đây mới là phần khó, không phải cái ô nhập):
>   `reaction` chỉ có **một** `target` + `value` **tĩnh** ⇒ không biểu đạt được "ghi N trường từ dữ liệu
>   API" · `fetchDataSourceOptions` **vứt bỏ mọi cột khác** của hàng ⇒ không còn bản ghi để map · control
>   lá chỉ nhận `onChange` của **chính nó** ⇒ không control nào ghi được sang trường khác.
> - **Hợp đồng (`form-schema`, additive):** `lookupFieldSchema` (+ `lookupColumnSchema`,
>   `lookupMappingSchema`) **tái dùng nguyên `selectDataSourceSchema`** — không sinh ra khái niệm nguồn
>   dữ liệu thứ hai. `dataSource`/`columns`/`mapping` đều optional ⇒ trường vừa kéo từ palette vẫn parse.
>   Entry `capabilities` nêu rõ 2 khóa bắt buộc (AI sinh form đọc thẳng bảng này).
> - **Runtime dùng chung (`form-core`):** `fetchDataSourceRows` giữ **mọi** cột (và
>   `fetchDataSourceOptions` nay gọi lại nó — một đường fetch, không hai) · `lookup.ts` thuần:
>   `lookupColumns` (cột khai báo thắng; vắng ⇒ suy ra từ label/value key + mọi `mapping[].from`) ·
>   `lookupPatch` (**luôn gán mọi mapping, kể cả khóa vắng** ⇒ `undefined` xóa giá trị cũ: mapping làm
>   chủ trường đích, không để lại dữ liệu mồ côi của bản ghi chọn trước) · `filterLookupRows`.
> - **Renderer web:** `LookupControl` (Modal + Table, **chỉ fetch khi mở modal**, lọc client-side) và
>   **đường ghi-nhiều-trường đầu tiên** của renderer: `applyValues` = `setValue` theo `namePrefix` ⇒ lookup
>   đặt trong một hàng của `array` ghi đúng ô **cùng hàng**. Cố ý **không** `shouldValidate` (sẽ sơn đỏ
>   N trường người dùng chưa đụng và chạy trọn resolver mỗi lần Áp dụng).
> - **Builder:** entry palette "Tra cứu bản ghi" · `RemoteSourceFields` **tách ra dùng chung** với
>   `DataSourceEditor` (DOM giữ y nguyên — `DataSourceEditor.test.tsx` xanh mà không sửa dòng nào) ·
>   `LookupEditor` (nguồn + cột + ánh xạ). Danh sách trường đích lấy từ **`targetNames`**, KHÔNG phải
>   `condFields`: `condFields` chỉ là anh-em cùng container ⇒ dùng nó thì mọi trường nằm trong
>   `card`/`grid`/`tabs` sẽ không được liệt kê dù `setValue` ghi được bình thường.
> - **⚠️ Known-gap (CỐ Ý):** tìm kiếm/lọc **client-side** trên toàn danh sách (endpoint rất lớn sẽ yếu) ·
>   sau reload ô hiện **giá trị thô** (nhãn chỉ sống trong phiên) · chỉ chọn **một** bản ghi · tiêu đề cột
>   chưa i18n · renderer native chưa có `lookup` (đang defer) · **Apply KHÔNG phải biên bảo mật** — patch
>   ghi theo tên, không kiểm `canEdit` của trường đích, nên có thể điền vào trường đã gate bằng `editRoles`
>   và giá trị đó được submit (submit chỉ lọc theo `canView`; API cũng không kiểm field-edit RBAC). Đây
>   **đúng bằng** hành vi sẵn có của reaction value-effect ⇒ ghi nhận có chủ đích, siết chung một lượt ·
>   một trường vừa là đích của lookup vừa là `target` của reaction `value` sẽ bị reaction **ghi đè im lặng**
>   ở lần đổi assignment kế tiếp · danh sách đích có thể liệt kê cả tên trường `array` (chọn nhầm ⇒ ghi vô
>   hướng vào chỗ đợi mảng) · với lookup nằm **bên trong một hàng array**, danh sách đích chỉ là anh-em
>   trực tiếp của hàng (`PropertyPanel` dùng `siblingNames` khi đã drill xuống) nên trường nằm trong
>   `card` lồng trong hàng đó không được liệt kê — **giới hạn y hệt reactions đang có**.

---

## 3. 🔒 Owner cần cung cấp (tổng hợp — để mở khóa phase liên quan)

| Cần | Cho phase | Ghi chú |
|---|---|---|
| **Demo/bootstrap admin** email + mật khẩu (dev) | Phase 0 | Điền sẵn `.env` dev để đỡ nhập lại; là admin id="local" giữ data cũ. |
| **JWT_SECRET production** (≥32 ký tự ngẫu nhiên) | Phase 0 | Chỉ ở `.env.production` API. Tôi có thể sinh hộ 1 chuỗi ngẫu nhiên nếu owner muốn. |
| ~~**SMTP** host/port/user/pass/from~~ ✅ hết chặn | Phase A2 (DONE 2026-07-29) | Dev đã chạy bằng **Mailpit** trong docker-compose; không SMTP ⇒ log-mode. Chỉ cần SMTP thật khi deploy production. |
| **Google OAuth** client-id/secret/redirect-uri | Phase A3 | Tạo ở Google Cloud Console. Tùy chọn — bỏ qua nếu chưa cần. |
| **Chính sách tenant** (self-host 1 tenant hay SaaS nhiều tenant?) | Phase B | Quyết định độ phức tạp multi-tenancy. |
| **Danh mục quyền chức năng** (list functions/screens cần phân quyền) | Phase C | Có thể chốt dần; tôi đề xuất bộ mặc định trước. |

---

## 4. Thứ tự đề xuất (khuyến nghị của tôi)

**Phase 0 (env) → A1 (refresh) → B (tenant + org/department) → C (RBAC data-driven) → D1 (user/role admin)
→ A2/A3 (mail/oauth) → D2–D4 (admin form/workflow/version) → E (work-order) → F (form nâng cao).**

Lý do (theo framing vendor↔client): (1) env trước để có nền cấu hình; (2) refresh-token rẻ & self-host;
(3) **tenant + org/department là nền** vì mọi thứ scope theo tenant (client cài đặt) — làm trước RBAC;
(4) **RBAC data-driven** ngay sau vì là crux của "client tự cấu hình phân quyền"; (5) user/role admin để
"thấy" RBAC chạy; (6) mail/oauth xen khi owner cấp SMTP/Google; (7) work-order & form-nâng-cao là giá trị
sản phẩm cuối, dựa trên nền đã vững. Có thể chèn A2 sớm nếu owner cấp SMTP trước.

## 5. Rủi ro & lưu ý
- **Tenant-scoping (B) + RBAC (C) là phần lớn & dễ sai** — rủi ro **rò dữ liệu chéo tenant** nếu sót 1 query
  → scope-guard tập trung + test kỹ. Function+data-perm phức tạp → additive, chốt bộ tối thiểu, không mạ vàng.
- **Không hardcode nghiệp vụ client (EVN)** vào platform — role/function/org/form/workflow đều là DATA client
  tự khai. Vendor chỉ cung cấp primitive + bộ function gốc.
- **Multi-tenant** đổi mọi query (thêm tenantId scope) → phải quét toàn bộ repository; rủi ro rò dữ liệu
  chéo tenant nếu sót 1 query → cần data-scope guard tập trung + test.
- **Δ hợp đồng** (field-type mới Phase F, các cột User) → luôn bump `formVersion` + migration + test
  migrate fixture cũ (golden rule repo).
- **Không copy EVN** (TypeORM, kiến trúc khác) — phỏng theo mô hình, hiện thực bằng Prisma + contract của ta.
- Bộ auth đầy đủ + admin + multi-tenant + work-order là **nhiều tháng công** — roadmap này là bản đồ dài
  hạn; ship từng phase, owner có thể đổi thứ tự/độ ưu tiên bất cứ lúc nào.

---

## 6. Kiến trúc giao diện & IA cho 2 profile client (proposal 2026-07-01)

**Hai profile:**
- **P1 — Enterprise (EVN-like):** tổ chức nhiều user, org/phòng ban, RBAC chức năng+dữ liệu; tách vai
  *người thiết kế* (dựng form/workflow) vs *người vận hành* (chạy ticket/work-order) vs *người duyệt*.
- **P2 — Self-serve (dùng trực tiếp):** cá nhân/nhóm nhỏ; dựng form/workflow cho nhu cầu riêng, thu
  submission. Muốn **tối giản, không gánh RBAC/org**.

### 6.1. Nguyên tắc: MỘT platform thích ứng (KHÔNG hai sản phẩm)
- **Adaptive shell + progressive disclosure.** Cùng một app; **navigation render theo `functions` của user ×
  `edition/features` của tenant**. Không build riêng cho từng profile.
- **P2 = "personal tenant"** (tenant-của-một, tạo tự động lúc signup, org mặc định ẩn). ⇒ **cùng model
  tenant** với P1; chỉ ẩn/hiện bề mặt. Không phô jargon org/role/phòng ban cho P2 tới khi họ bật "team".
- **Không cưỡng ép phức tạp:** P2 vào là dựng form ngay; RBAC/org/admin chỉ xuất hiện khi tenant bật hoặc
  user có function tương ứng.

### 6.2. App shell — các "section" cấp cao (gated theo function)
```
┌─ Form Platform ─────────────────────[tenant ▾][🔔][user ▾]─┐
│ ⌂ Home        │  (nội dung section đang chọn)               │
│ ✎ Design      │   Design = Builder hiện tại (Projects/      │
│ ▶ Operate     │           Forms/Workflows/Presets/Versions) │
│ ⚙ Admin       │   Operate = My Tasks / Tickets / Submissions│
│ ⛭ Settings    │   Admin   = Users/Roles/Org/Data-scope/Audit│
└───────────────┴─────────────────────────────────────────────┘
```
- **P2 thấy:** `⌂ Home · ✎ Design · ▶ Submissions · ⛭ Settings(Profile/Security)` — **ẩn Admin, ẩn Org/Role**.
  "Operate" thu gọn còn "Submissions".
- **P1 admin thấy đủ**; **P1 operator** chỉ thấy `⌂ Home · ▶ Operate(My Tasks) · ⛭ Settings`.
- **Vendor console TÁCH RIÊNG** (`/vendor` hoặc app riêng, chỉ platform-staff qua system-function): quản
  tenant/installation/usage — KHÔNG lẫn vào app của client.

### 6.3. Role (client tự định nghĩa) → bề mặt hiển thị (ví dụ mặc định, data-driven qua function)
| Vai (client đặt tên) | Function tiêu biểu | Bề mặt thấy |
|---|---|---|
| Tenant Admin | `user.admin`,`role.admin`,`org.admin`,`*.manage` | Tất cả |
| Designer | `form.manage`,`workflow.manage` | Design + Operate của mình |
| Operator | `ticket.operate` | Home + Operate (My Tasks) |
| Approver | `ticket.approve` | Operate (duyệt) |
| Viewer | `*.read` | chỉ đọc |

### 6.4. Onboarding khác nhau, shell giống nhau
- **P2:** signup → thẳng "Tạo form đầu tiên" (bỏ qua org/role). Nâng cấp "Mời thành viên" → tự bật team.
- **P1:** vendor cấp tenant HOẶC wizard onboarding (khai org/phòng ban → mời user → gán role).

### 6.5. Khớp code hiện tại (additive, không đập)
- Thêm **AppShell layout** (left rail) trong `apps/builder`; **`ProjectWorkspace` hiện tại trở thành section
  "Design"** (giữ route `/projects`, thêm nhóm `/operate`,`/admin`,`/settings`).
- Nav items render từ `useAuth().functions` + `tenant.features` (một nguồn — Phase C cấp `functions`, Phase B
  cấp `tenant`).
- Mỗi section = feature-folder mới (theo skill `feature-module`), gated `@RequireFunction` server-side +
  ẩn nav client-side (defense-in-depth: **ẩn UI ≠ bảo mật; server vẫn phải chặn**).

### 6.6. Căn cứ từ `web-admin` (đã đọc source, KHÔNG suy đoán)
Đề xuất §6.1–6.3 khớp đúng cách client-admin thật (`E:\web\web-admin`) hiện thực — trích cơ chế:
- **Shell one-app:** `layouts/private/` = `PrivateRoot → PrivateHeader + PrivateSider + PrivateContent`
  (antd `Layout.Sider` + `Menu`); tách `layouts/public/` cho login. `LayoutCode.Private|Public`.
- **Menu config tập trung:** `rootMenus[LayoutCode.Private]` (cây menu, có `children` phân cấp).
- **Progressive disclosure = thật:** `PrivateSider.handleConvertMenuToShow()` — nếu `userData.code==='ADMIN'`
  → hiện tất cả; ngược lại chỉ đẩy menu item khi `hasPermissionForAccessPage({ accessCodes: item.codes,
  accessCodesOfUser: functionData })` (`functionData` = function-code của user từ `useAuthStore`), đệ quy con.
- ⇒ Ta mirror: **`rootMenus` per-layout + gate mỗi item theo `functions` user** (Phase C cấp). **Tinh chỉnh:**
  thay hardcode `code==='ADMIN'` bằng **role admin data-driven giữ toàn bộ function** (đúng nguyên tắc §1.1).

### 6.7. Quyết định
1. ✅ **CHỐT (owner 2026-07-01): Adaptive shell hợp nhất** (progressive disclosure) — KHÔNG hai portal.
   Một shell, nav gate theo `functions × edition`; P2 tối giản, P1 đầy đủ; vendor console tách riêng.
2. **Edition/feature-flag trên tenant** (`personal|team|enterprise`) điều khiển hiển thị — bật từ Phase B.
3. (Khuyến nghị) Dựng **khung AppShell/left-rail sớm** (Phase 0/A, chỉ Design+Settings), nhồi section
   Operate/Admin sau — tránh refactor lớn về cuối. Ẩn nav ≠ bảo mật ⇒ server luôn `@RequireFunction`.
   **Rollout (codex):** shell bản đầu **chỉ wrap route `/projects` hiện tại** (Design) + Settings;
   **CHƯA bật Admin/Operate thật** — chúng chỉ là mục nav ẩn tới khi Phase C/D/E hiện thực.
   > **✅ DONE (2026-07-02):** feature-folder `apps/builder/src/shell/` — `nav.ts` (catalog `NAV_SECTIONS`
   > = single source: `design`✓ · `operate`/`admin` `enabled:false` = nav ẩn; `visibleSections()` +
   > `activeNavKey()` pure + test) · `NavRail.tsx` (activity-bar 64px, antd Menu inlineCollapsed + Settings
   > footer + `<UserMenu compact/>`) · `AppShell.tsx` (layout route wrap children của `RequireAuth`) ·
   > `SettingsPage.tsx` (account tối giản). `main.tsx` bọc AppShell + route `/settings`; `ProjectsPage` bỏ
   > UserMenu inline; `ProjectWorkspace` `100vh→100%`; `UserMenu` thêm prop `compact`. Additive thuần FE,
   > KHÔNG đụng DB/API, KHÔNG changeset (app private). Verify: builder typecheck · 374 test (shell nav 3) ·
   > biome · reviewer PASS · **live UI smoke MCP** (login→rail Design-active+Settings+avatar · mở project
   > editor+ExplorerRail+rail không tràn · /settings account · nav Design↔Settings · Operate/Admin ẩn ·
   > sign-out→/login · console sạch). Seam Phase C: `visibleSections` nối `functions × edition`.

---

## 7. Evidence ledger (source đã đọc — để phân biệt "đã đọc" vs "suy luận"; codex đề xuất)
| Nguồn | File/module đã đọc | Ngày | Kết luận rút ra |
|---|---|---|---|
| repo (ta) | `apps/api/prisma/schema.prisma` (`model User`) | 2026-07-01 | `User` chỉ id/email/passwordHash/displayName/timestamps — **KHÔNG có role/tenant**. |
| repo (ta) | `apps/builder/src/{datasource,reactions}`, `packages/form-core/src/{datasource,reactions,conditions}.ts` | 2026-07-01 | Trường phụ thuộc + options remote/tree **ĐÃ có** → Phase F là mở rộng. |
| repo (ta) | `apps/builder/src/main.tsx`, `vite.config.ts` | 2026-07-01 | Router **CHƯA** `basename`; vite **CHƯA** đọc `VITE_BASE_PATH`; chỉ có `/api` proxy (2B). |
| EVN `core-service` | `src/shared/entities/permission/*.entity.ts` (functions, role-group, role-group-map-{function,user}, permission-data-group/department/user) | 2026-07-01 | RBAC **data-driven** (functions=record, `parent_code`), user↔role M-N, data-scope theo org/department. |
| EVN `core-service` | `src/modules/{auth,role}` (tree + tên file) | 2026-07-01 | Auth JWT+local+RSA; role module có function/permission-data DTO/guard. |
| `web-admin` | `src/layouts/private/**`, `src/layouts/private/components/PrivateSider.tsx`, `src/routes` (tree) | 2026-07-01 | Shell one-app `Layout.Sider`+`rootMenus[LayoutCode]`; nav gate `hasPermissionForAccessPage(item.codes, functionData)`, admin=all. |
| `estd` | `apps/web/src/app/(auth)/*`, `apps/api/src/auth/*` (tree) | 2026-07-01 | Bộ auth: login/register/oauth-google/reset/set/forgot-password/refresh; jwt+google strategy. |

**Chưa đọc / còn suy luận:** chi tiết `rootMenus`/`functionCodeEnum` của web-admin (mới đọc `PrivateSider`, chưa
đọc file menu config); DB schema EVN (đọc entities, chưa đọc migration đầy đủ); estd auth service chi tiết
(mới đọc cây thư mục). → Khi hiện thực phase tương ứng sẽ đọc sâu thêm.

## 8. Cross-cutting (thêm theo codex — áp dụng xuyên các phase)
- **Audit log (nền enterprise):** ghi ai-làm-gì cho hành động nhạy cảm: đổi role, publish form/version,
  approve, chuyển ticket, cấp/thu quyền. Thêm bảng `AuditLog` (actor, action, target, tenantId, timestamp,
  diff) — bật cùng Phase C (RBAC) & D (admin), hiển thị ở D5.
- **Test-plan riêng cho tenant/RBAC (bắt buộc trước khi gọi B/C done):** (1) **cross-tenant leak** — user
  tenant A KHÔNG thấy/sửa được data tenant B qua MỌI endpoint; (2) **data-scope** theo org/department;
  (3) **union permission** khi 1 user nhiều role; (4) **defense-in-depth** — ẩn nav nhưng gọi thẳng API vẫn
  bị chặn (401/403). Ưu tiên test negative.
- **Migration an toàn:** mọi Δ (ownerId→tenantId, cột User, field-type mới) → additive + test migrate
  fixture cũ (golden rule repo: additive schema, không phá JSON đã lưu; xem `AGENTS.md`).
