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
> (A1 ✅ rotating + revocable)**, project-member role (editor/viewer), form-core datasource/reactions/conditions,
> workflow engine, cookie-auth (access **15m** + refresh **30d** — A1).

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

### Phase A — Kiện toàn bộ Auth (tiếp nối 2B) — A1 ✅ DONE (2026-07-02); A2/A3 📋 PLANNED
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
- **A2 — Quên/đặt lại mật khẩu + Xác minh email** 🔒 SMTP: `forgot-password`/`reset-password`/
  `set-password` + `verify-email`; token 1-lần hết-hạn (bảng `VerificationToken`); `modules/mail`
  (Nodemailer, cấu hình SMTP_*). Cần **SMTP** (self-host: MailHog cho dev; SMTP thật cho prod).
- **A3 — Google OAuth** 🔒 Google app (tùy chọn): `passport-google-oauth20`, `/auth/oauth/google` +
  callback, liên kết account theo email đã verify. Cần **Google client-id/secret/redirect**.
- Δ nhỏ: `User` thêm `emailVerifiedAt?`, `authProvider?`. Additive.

### Phase B — Nền tảng Tenant + Org/Department (để client cài & tự cấu hình) ⭐⭐ 📋 PLANNED [làm TRƯỚC RBAC]
Theo framing vendor↔client: **1 tenant = 1 client/installation** (EVN là 1 tenant). RBAC/form/workflow
đều **scope theo tenant + org/phòng ban** nên hạ tầng này phải có TRƯỚC.
- **B1 — Tenant model:** `Tenant`(installation của 1 client) + `Membership`(user thuộc tenant, có thể nhiều
  tenant). Tổng quát hóa `ownerId` hiện tại → `tenantId` (giữ tương thích: tenant mặc định cho data cũ).
- **B2 — Org/Department hierarchy** (phỏng EVN `Organization`+`Department`, `parent` phân cấp): client tự
  khai cây đơn vị/phòng ban của họ (DATA, không hardcode). User gắn org/department.
- **B3 — Tenant-scoping:** mọi bảng dữ liệu (project/form/workflow/submission/preset…) gắn `tenantId`;
  repository lọc theo tenant tập trung (guard/interceptor) — **chống rò dữ liệu chéo tenant** (rủi ro chính).
- **Hai tầng admin:** vendor-admin (quản tenant) vs client-admin (quản trong tenant). Onboarding tenant.
- Khuyến nghị **shared-DB + `tenantId` + scope-guard** (đủ cho self-host + SaaS; tránh schema-per-tenant nặng).
- **B4 — Chiến lược di trú `ownerId`→`tenantId` (codex):** tạo **tenant mặc định** cho data hiện có →
  **backfill** `tenantId` cho project/form/workflow/submission/preset → đổi unique index (`ownerId+slug`
  → `tenantId+slug`, tương tự các unique khác) → **test dữ liệu cũ vẫn truy cập được** (bootstrap admin
  id="local" ∈ tenant mặc định). Migration additive, không phá JSON đã lưu.

### Phase C — RBAC data-driven (phân quyền chức năng + dữ liệu, cấu hình được) ⭐⭐ Δ 📋 PLANNED [crux]
Phỏng mô hình EVN nhưng bằng Prisma; **KHÔNG hardcode role** — client tự cấu hình:
- **C1 — Function catalog:** `Function`(bản ghi DB: `code`/`name`/`parentCode` phân cấp — vd `form.manage`,
  `workflow.manage`, `user.admin`, `version.publish`) do **platform khai bộ gốc** + **client mở rộng**.
  Đây là "phân quyền chức năng" data-driven (không phải enum cứng).
- **C2 — Role (tenant/org-scoped) + mappings:** `Role`(client tạo) · `RoleFunction`(role→function =
  chức năng) · `UserRole`(user↔role **M-N — 1 user nhiều role**). Permission hiệu dụng = union functions
  của các role user giữ.
- **C3 — Phân quyền dữ liệu:** `DataScope`/`DataPermissionGroup` gắn theo **org/department** (phỏng EVN
  `permission_data_group`↔`permission_department`↔`permission_user`) → giới hạn user chỉ thấy dữ liệu của
  đơn vị được cấp.
- **C4 — Enforcement:** `@RequireFunction('form.manage')` + `FunctionGuard` (đọc union permission) +
  **data-scope filter** ở repository. Thay dần `CurrentOwner`-only; **đóng gap FS2/2C** (`?roles` hiện
  owner-declared → role thật server-side). Di trú project-member (editor/viewer Track W) vào role; bootstrap
  admin (id="local") nhận role admin của tenant mặc định.
- **C5 — Governance function-catalog (codex):** quy ước **mã quyền ổn định** (`form.read`,`form.manage`,
  `workflow.run`,`workflow.manage`,`user.admin`,`role.admin`,`version.publish`…); **platform seed bộ gốc
  bất biến** (client KHÔNG được override/xóa mã gốc, CHỈ được thêm mã mới của họ) → tránh vỡ khi platform
  nâng cấp. Versioning catalog khi thêm quyền mới.
- ⚠️ Phase LỚN nhất, dễ sai — làm additive, test kỹ, chốt **bộ function tối thiểu** trước, không mạ vàng.

### Phase D — Admin panels (builder web) [phần owner nêu: quản lý form/user/workflow/version]
Feature-folders mới trong `apps/builder` (theo convention `feature-module`), gated bởi function (C4).
**Client-admin** cấu hình tenant của họ; **vendor-admin** quản tenant/installation:
- **D1 — User & Role management:** liệt kê user, gán nhiều role, tạo/sửa role + gán permission chức năng,
  cấu hình data-scope (phòng ban/tổ chức). (phỏng `web-admin/userManager`)
- **D2 — Form management:** danh sách form toàn tenant (không chỉ của mình), trạng thái publish/version,
  chuyển owner, khóa/xóa. (phỏng `form-management` mock)
- **D3 — Workflow management:** danh sách workflow + instance đang chạy, ai đang xử lý bước nào.
- **D4 — Version management:** lịch sử version form/workflow, so sánh, rollback (đã có nền FB1 —
  publish/version/diff → nâng lên trang admin).
- **D5 — Dashboard/audit** (tùy chọn): thống kê + nhật ký thao tác.

### Phase E — Ticket / Work-order (form + workflow → runtime công việc)
- Từ 1 form + workflow đã cấu hình → **tạo ticket** (instance) chạy qua các bước; theo dõi "ai sẽ / đã /
  đang làm" (đã có Run-view + engine + case-label). Nâng thành trang **Work-order manager** (tạo/gán/lọc
  theo người xử lý/trạng thái). (phỏng `web-admin/workOrder` + `workflowTicket`)
- Tái dùng: workflow-core engine + form submission runtime + field-level RBAC (maskData).

### Phase F — Form nâng cao (mẫu EVN: trường phụ thuộc, modal-chọn→apply→autofill)
- Nhiều đã có: **conditions** (JSONLogic ẩn/hiện), **reactions** (trường phụ thuộc giá trị nhau),
  **datasource** (options remote/tree). → phase này **mở rộng**, không làm lại.
- Thêm mẫu **"modal chọn giá trị → Apply → gọi API → fill nhiều trường tương ứng từ response"**: kiểu
  field `lookup/reference` mở modal, chọn bản ghi, map response→các field (mở rộng datasource + reactions
  + renderer). Δ: field-type mới → bump `formVersion` + migration + test migrate fixture cũ.

---

## 3. 🔒 Owner cần cung cấp (tổng hợp — để mở khóa phase liên quan)

| Cần | Cho phase | Ghi chú |
|---|---|---|
| **Demo/bootstrap admin** email + mật khẩu (dev) | Phase 0 | Điền sẵn `.env` dev để đỡ nhập lại; là admin id="local" giữ data cũ. |
| **JWT_SECRET production** (≥32 ký tự ngẫu nhiên) | Phase 0 | Chỉ ở `.env.production` API. Tôi có thể sinh hộ 1 chuỗi ngẫu nhiên nếu owner muốn. |
| **SMTP** host/port/user/pass/from | Phase A2 | Password-reset + email-verify. Dev có thể dùng **MailHog** (không cần tài khoản thật). |
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
