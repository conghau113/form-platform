# Form Submission Runtime + Lifecycle (Track FS/FB)

> Mục tiêu: đưa form-builder từ **"author schema tốt"** lên **"vận hành dữ liệu submit thật"**.
> Nguồn gốc: production roadmap review (`workflow-production-roadmap-review.md`, codex) xếp
> submission storage + server-side validation + form versioning là **Must-have** production blocker,
> và **hợp-lệ cho CẢ HAI nhánh** của ngã ba chiến lược (infra AI-native embeddable & app vận hành SME)
> → làm được mà KHÔNG ép chốt ngã ba. Owner (2026-06-29) chốt track này theo khuyến nghị.
> Đây là **nguồn sự thật** của track; tick `[x]` theo tiến độ, cập nhật sau MỖI phase.

Branch: tiếp tục trên `feat/workflow-editor-v2` (hoặc nhánh mới nếu owner muốn tách). Track
workflow-editor-v2 đã XONG 100% (WE1→WE5b + 7 UX demo) — track này đứng SAU nó.

## Nguyên tắc (bất di bất dịch — khớp golden rules repo)
- **Schema là contract.** Submission/version là dữ liệu MỚI, không phá `FormSchema`. Field mới =
  additive ⇒ KHÔNG bump `CURRENT_FORM_VERSION` (form contract bất biến); chỉ thêm schema/model RIÊNG.
- **Server không tin client.** Submit phải re-validate server-side bằng `@org/form-core`
  (`migrate` → `buildZodSchema` → parse) — đây là moat, không chỉ lưu payload.
- **Một renderer, nhiều chỗ dùng.** Submission detail/review tái dùng `FormRenderer` (`readPretty`)
  — KHÔNG viết renderer thứ hai.
- **Pin để an toàn.** Mỗi submission tự giữ snapshot schema nó được submit (formVersion + body
  snapshot/hash) ⇒ sửa form sau này KHÔNG làm hỏng/đọc-sai submission cũ. (Đây là correctness
  guarantee mà codex "Giai đoạn 1" đòi — đạt được ở FS1 mà chưa cần full draft/publish.)
- **Layering api chuẩn** (theo `feature-module` + `apps/api/ARCHITECTURE.md`): module
  controller/service/DTO; service dùng pure core + repo abstraction; repo abstract ở
  `persistence/repositories/`, prisma impl ở `persistence/prisma/`, wire ở `persistence.module.ts`;
  access qua `ProjectsService.requireAccess`. KHÔNG fetch ngoài `client.ts` ở builder.
- **DoD mỗi phase:** `pnpm typecheck` + test xanh + `pnpm biome check` sạch (scope file đổi) +
  changeset cho mọi package published đổi + **reviewer subagent PASS** + **live smoke** (MCP/browser).

## Bản đồ file hiện tại (đã đọc — đọc lại trước khi sửa)
- Form contract: `packages/form-schema/src/schema.ts` (`CURRENT_FORM_VERSION=3`), `migrate.ts`
  (`migrate()` validate+normalize), `index.ts` (barrel).
- Server-side validation sẵn có: `packages/form-core/src/validation.ts` →
  `buildZodSchema()` (L396) + `collectWarnings()` (L462); barrel `form-core/src/index.ts`.
- Forms api (mẫu để mở rộng): `apps/api/src/modules/forms/{forms.controller,forms.service}.ts`
  — hiện chỉ CRUD definition (`save` = `migrate` rồi `forms.upsert`); KHÔNG version/submission.
- Runtime mẫu (server-authoritative + pure core + repo): `apps/api/src/modules/workflows/
  workflow-instances.{service,controller}.ts` + DTOs — COPY pattern này cho submissions.
- Repo abstraction mẫu: `persistence/repositories/form.repo.ts` (abstract `FormRepo` +
  `FormSummary`) + `persistence/prisma/prisma-form.repo.ts`; wire `persistence.module.ts`.
- Prisma: `apps/api/prisma/schema.prisma` (`FormRecord` body đơn; chưa có Submission/Version).
- Renderer: `packages/form-renderer-web/src/FormRenderer.tsx` (`readPretty`/`designMode`/`access`
  /`initialValues`/`onSubmit` — đủ để render submission detail read-only).
- Builder Run view (đã có, khác track): `apps/builder/src/workflow/WorkflowRunRoute.tsx` lưu case
  data vào `WorkflowInstance.data` (WF3). **Submission của FS là khái niệm RIÊNG** (form submit
  độc lập, không bắt buộc qua workflow); FS5 mới nối hai cái.

---

## Phases (mỗi phase = 1 session, /clear giữa các phase)

### ★ FS1 — Submission MVP (core value, rủi ro thấp nhất)  ✅ DONE (reviewer PASS + live smoke PASS)
Form publish/submit/lưu/xem-lại end-to-end, server-side validated, pinned snapshot. KHÔNG đụng
`FormSchema` contract; KHÔNG cần full draft/publish (đến FB1).
- [ ] **Contract submission** (mới, decoupled — không vào form contract): `submissionSchema` Zod
  `{ id, formId, formVersion, schemaSnapshot (migrated body), data, submittedBy, submittedAt }`.
  Đặt ở `packages/form-schema/src/submission.ts` (cạnh `preset.ts` — cùng kiểu "ngoài form contract")
  hoặc gói riêng nếu owner muốn. +test. **+changeset** (`@org/form-schema` minor, additive).
- [ ] **API submissions module** (mirror `workflow-instances`): `Submission` prisma model
  (`id`/`formId`/`projectId` denorm/`formVersion`/`schemaSnapshot Json`/`data Json`/`submittedBy`/
  `submittedAt`/`@@index`) + migration; `SubmissionRepo` abstract + prisma impl + wire; module
  `modules/submissions/` (controller/service/DTO). Endpoints:
  - `POST /forms/:id/submissions` — load form, `migrate`, `buildZodSchema().parse(data)`
    server-side (422 on invalid, KHÔNG tin client), strip theo RBAC ở FS2, snapshot body+version,
    lưu. Gate `viewer`+ (ai submit được → quyết ở FS2; MVP = project member).
  - `GET /forms/:id/submissions` — list summary (no full data) cho project (`viewer`).
  - `GET /submissions/:id` — detail (`viewer`).
  - service test (validate-reject / pin-snapshot / access).
- [ ] **Builder UI**: tab/Drawer "Submissions (N)" trên form (list bảng + detail). Detail tái dùng
  `FormRenderer` `readPretty` với `schemaSnapshot`+`data`. client.ts endpoints + react-query hook
  (fetch chỉ ở `client.ts`). (Submit form thật từ UI runtime: MVP có thể submit qua Preview hiện có
  hoặc nút "Test submit" → chốt scope nhỏ khi vào phase.)
- [ ] Verify: typecheck + test + biome + changeset + reviewer + live smoke (submit valid→lưu;
  submit thiếu required→422; list/detail; sửa form rồi mở submission cũ vẫn render đúng snapshot).
- Acceptance: form submit được, lưu, xem lại; server từ chối payload sai; submission cũ bất biến
  khi schema đổi.

### FS2 — Submission access control + field masking  ✅ DONE (reviewer PASS + live smoke PASS)
- [x] RBAC view submission theo role; server-side strip (submit) + mask (read) field non-viewable
  (`canView` của form-core). Submit gate giữ `viewer` (owner chốt); audit `submittedBy/submittedAt`
  của FS1 đủ cho MVP. (canEdit-gate + export masking + audit-log = follow-up.)
- [x] Builder: "Acting as" role picker (default = tất cả role) ở cả submit + detail; mask field
  không được view ở detail (server-side + renderer `access`).
- **Cách làm:** form-core thêm pure `maskData(form,data,access)` (`packages/form-core/src/mask.ts`,
  mirror `buildZodSchema` traversal: container phẳng + array per-row) + barrel + test(6) + changeset
  `@org/form-core` minor. api `SubmitDto.roles?`; `submit` truyền `access:{roles}` vào `buildZodSchema`
  (strip field submitter không xem được); `load` mask data qua `maskData` trên snapshot ĐÃ pin; helper
  `actorRoles` merge declared+project-role (mirror `workflow-instances`); controller `GET ?roles=a,b`;
  test(3). builder `submissions/form-roles.ts` (mirror `run-roles`), picker, thread roles vào
  client/hook/qk. KHÔNG migration, KHÔNG bump contract.

### FB1 — Form draft/publish/version (governance hardening)
**FB1a (backend) ✅ DONE (`1e3a720`).** **FB1b (builder UI) ✅ DONE (reviewer + live smoke PASS).**
- [x] `FormVersion` immutable snapshot + `publishedAt`/`publishedBy`/`activeVersion`; save = draft;
  publish tạo version; **submission ưu tiên active published version, fallback draft** (owner chốt —
  không strict). Submission FS1 đã pin snapshot ⇒ additive hardening (không phá dữ liệu cũ).
- [x] Endpoints: `POST /forms/:id/publish`, `GET /forms/:id/versions`, `GET /forms/:id/versions/:v`,
  `POST /forms/:id/versions/:v/clone-draft` (clone-draft = rollback: version body → draft),
  `GET /forms/:id/active-version` (FB1b: active version body, null khi chưa publish — cho badge+diff).
- [x] **FB1b (builder UI):** nút Publish + badge "draft ahead" trên header editor; route Versions
  riêng (`/forms/:id/versions`): publish + lịch sử + xem read-only + rollback + **field-level diff**
  version↔draft. **Badge content-based** (`diffForms(active.body, draft)` ≠ rỗng), KHÔNG so timestamp
  (publish tự bump `updatedAt` ⇒ timestamp false-positive). Feature folder `apps/builder/src/versions/`
  (client/diff+test/useVersions/VersionsRoute/PublishControl), mirror `submissions/`.

### FS3 — File storage
- [ ] Upload endpoint + storage adapter (local/S3-compatible) + metadata in submission + size/type
  policy + signed URL + access check/audit.

### FS4 — Submission operations
- [ ] Search/filter/pagination · export CSV/JSON · edit/correct với audit · archive/delete policy.

### FS5 — Workflow binding (nối FS ↔ WF3)
- [ ] Start workflow từ submission; task form đọc/ghi instance data; submission timeline link
  workflow instance; form version ổn định cho instance đang chạy.

---

## Quyết định ordering (KHUYẾN NGHỊ — cần owner xác nhận khi vào việc)
Codex review xếp **form versioning (Giai đoạn 1) TRƯỚC submission (Giai đoạn 2)** vì instance/submission
"cần pin vào form version". **Đề xuất của tôi: làm FS1 (submission) TRƯỚC FB1 (full versioning).** Lý do:
- FS1 tự pin **snapshot body + formVersion** vào mỗi submission ⇒ đạt **đúng correctness guarantee**
  (sửa schema không hỏng submission cũ) mà KHÔNG cần dựng cả lifecycle draft/publish/active-version.
- Surface nhỏ hơn nhiều ⇒ giá trị end-to-end nhanh, rủi ro thấp; FB1 trở thành hardening additive
  (immutable published version + UX) làm sau khi data layer đã có và đã chứng minh giá trị.
- Nếu owner muốn governance-first (regulated buyer), đảo FB1 lên trước FS1 — plan giữ nguyên, chỉ
  đổi thứ tự. Surface khi vào phase đầu.

## Quan hệ với ngã ba chiến lược
Track này **hợp-lệ cho cả hai nhánh** (infra AI-native embeddable cần submission API + guaranteed-valid;
app SME cần submission + audit để vận hành) ⇒ tiến lên KHÔNG buộc chốt ngã ba. Khi data layer có,
ngã ba (task inbox/governance nặng = nhánh app; MCP submission tool = nhánh infra) sẽ rõ hơn để chốt.

## Giao thức resume (sau MỖI phase)
1. Tick `[x]` + ghi commit hash trong file này.
2. Cập nhật memory `session-resume-form-submission-runtime.md` (trạng thái + NEXT) + 1 dòng MEMORY.md.
3. Commit (owner gate push/merge) → báo owner /clear → session mới đọc memory + file này resume.

## Trạng thái
- 2026-06-29: track mở. workflow-editor-v2 đã xong 100%; owner chốt làm FB/FS theo khuyến nghị.
  Plan này tạo sau khi đọc nguồn (forms api/service, prisma, form-core validation surface,
  workflow-instances mẫu). NEXT = FS1 (submission MVP), ordering submission-first (xem §Quyết định).
- 2026-06-29 (đóng phase): **FS1 DONE — Submission MVP.** Owner chốt submission-first, "tiếp tục luôn".
  - **Contract:** `packages/form-schema/src/submission.ts` (`Submission` + `submissionSchema`/
    `parseSubmission`, decoupled như preset — pin `schemaSnapshot` full form, KHÔNG bump
    `CURRENT_FORM_VERSION`) + `submission.test.ts` (4) + changeset `@org/form-schema` minor.
  - **API:** prisma `SubmissionRecord` (body Json + denorm formId/projectId/submittedBy/submittedAt) +
    migration `20260629063855_form_submissions`; `SubmissionRepo` abstract + `PrismaSubmissionRepo` +
    wire `persistence.module`; module `modules/submissions/` (controller/service/dto) + wire
    `app.module`; service **re-validate SERVER-SIDE bằng `@org/form-core` `buildZodSchema`** (strip
    hidden/unknown, 422 + field paths khi sai) + pin snapshot; `submissions.service.test.ts` (6).
    Thêm dep `@org/form-core` vào api package.json. Gate `viewer` (submit+read) — FS2 sẽ siết.
  - **Builder:** feature folder `submissions/` (client.ts fetch-only + `useSubmissions` react-query +
    `SubmissionsRoute.tsx` 2 mode: submit+list / detail readPretty từ snapshot) + route
    `forms/:formId/submissions[/:submissionId]` + qk keys + `SubmissionSummary` type + ExplorerRail
    context-menu "Submissions" cho form.
  - **Verify:** form-schema build + 83 test (submission 4/4) · builder typecheck sạch · builder layout
    test 19/19 · api typecheck sạch · api 102 test (submissions 6/6, no regression) · biome sạch file
    đổi · **reviewer PASS** (8/8 golden rule; non-blocking: snapshot duplication→FB1, viewer-submit→FS2,
    payload-size→sau) · **live smoke MCP PASS** (API e2e: create 201 / invalid→422 `Email is required` /
    valid→201 strip key lạ / list 1 / detail / **sửa form thêm field → snapshot submission cũ VẪN
    1 field = pin chứng minh qua DB thật**; UI: route render 2 mode + detail readPretty CHỈ Email
    không Phone; console sạch; data test đã xoá cascade).
  - ⚠️ **Bug latent pre-existing đã sửa (1 dòng, root-cause):** `apps/builder/src/workflow/layout.test.ts:17`
    dùng sai shape guard `{ "==": ... }` → `{ rule: { "==": ... } }` (đúng contract); bị che bởi
    form-schema dist cũ, lộ ra khi rebuild form-schema. KHÔNG phải FS1.
  - ⚠️ **GOTCHA môi trường:** api `node dist/main.js` khoá prisma client DLL (EPERM) → phải dừng dev
    stack trước khi `prisma migrate dev`/regen, rồi `pnpm dev` lại. Server-side validation message
    hiện tiếng Anh (form-core enMessages mặc định; server không có locale context — i18n msg server
    là chuyện riêng, ngoài FS1). NEXT = FS2 (access-control/masking) HOẶC FB1 (versioning).
- 2026-06-29 (đóng phase): **FB1a DONE — Form draft/publish/version (backend).** Owner chốt 2 fork:
  submit **ưu tiên published, fallback draft** (không strict); scope **backend trước** (UI = FB1b).
  - **Contract:** `packages/form-schema/src/form-version.ts` (`FormVersion` + `formVersionSchema`/
    `parseFormVersion`, decoupled như `Submission` — `version` 1-based publish-seq + `formVersion`
    denorm + `body` frozen `FormSchema`; KHÔNG bump `CURRENT_FORM_VERSION`) + barrel + `form-version.test.ts`
    (4) + changeset `@org/form-schema` minor.
  - **Prisma:** model `FormVersionRecord` (id cuid / formId / projectId denorm / version Int / body Json /
    publishedBy / publishedAt; `@@unique([formId,version])`) + `FormRecord.activeVersion Int?` +
    `FormRecord.publishedAt DateTime?` + relations; migration `20260629083228_form_versions`.
  - **Repo:** `persistence/repositories/form-version.repo.ts` (abstract `FormVersionRepo` +
    `PublishInput` + `FormVersionSummary`) + `prisma/prisma-form-version.repo.ts` (`publish` dùng
    `$transaction`: max(version)+1 → insert → update FormRecord active pointer, ATOMIC; `loadActive`/
    `load`/`listByForm`) + wire `persistence.module`.
  - **Module:** `modules/forms/form-versions.{service,controller}.ts` (mirror submissions access:
    read=viewer, write=editor) — `publish` (migrate draft→freeze), `listVersions`, `getVersion`,
    `cloneDraft` (rollback: version body→draft qua `forms.upsert`, giữ placement) + wire `forms.module`
    (cùng `@Controller("forms")`, route con không đụng `GET /forms/:id`).
  - **Submission nối:** `submissions.service.ts` `resolveSnapshot()` — `versions.loadActive(formId)`
    có → pin published; null → fallback draft (FS1). Inject `FormVersionRepo`.
  - **Verify:** form-schema 87 (form-version 4) + dist build · api typecheck sạch · **repo typecheck
    22/22** · api 112 test (form-versions 5, submissions 11 = +2: fallback + pin-published) · biome
    sạch 12 file · **reviewer PASS** · **live smoke HTTP thật** (create → submit-pre-publish fallback
    1-field → publish v1 → edit draft +phone → submit-post-publish PIN v1 (phone stripped) → list
    [1] → get v1 → clone-draft rollback → GET draft rolled-back → invalid 422 → delete 204 cascade).
  - ⚠️ GOTCHA: phải dừng dev stack (api khoá prisma DLL) trước `prisma migrate dev`; api no-watch
    (rebuild dist + restart); kill api PID teardown cả Vite → smoke chạy api standalone 3001 (owner
    nên `pnpm dev` lại). NEXT = **FB1b (builder UI: publish/history/diff/rollback)** HOẶC FS3 (file
    storage). Ngã ba infra-vs-app vẫn chưa chốt; FB1 hợp-lệ cả hai nhánh.
- 2026-06-29 (đóng phase): **FS2 DONE — Submission access control + field masking.** Owner chốt 2
  default (submit giữ `viewer` + server-strip; read-mask khai role default-all — mirror WF4a model A).
  - **form-core:** pure `maskData(form,data,access)` (`mask.ts`) bỏ field actor không `canView`
    (mirror `buildZodSchema` traversal: container phẳng + array per-row; `structuredClone`, không
    mutate) + barrel + `mask.test.ts` (6) + changeset `@org/form-core` minor.
  - **API:** `SubmitDto.roles?`; `submit` truyền `access:{roles}` vào `buildZodSchema` (strip field
    submitter không xem được TRƯỚC khi lưu); `load(ownerId,id,roles?)` mask `data` qua `maskData`
    trên `schemaSnapshot` ĐÃ pin (ổn định khi form đổi sau); helper `actorRoles` merge declared +
    project-role (`resolveRole`, mirror `workflow-instances`); controller `GET /submissions/:id?roles=a,b`;
    `submissions.service.test.ts` +3 (submit-strip / read-mask / role-present). KHÔNG migration, KHÔNG
    bump contract. Gate vẫn `viewer`.
  - **Builder:** `submissions/form-roles.ts` (`formRoles` gom viewRoles/editRoles, mirror `run-roles`);
    `SubmissionsRoute.tsx` "Acting as" `Select` (default tất cả role) ở submit + detail; thread roles
    vào `client.ts` (POST body + `?roles=`), `useSubmissions` (key `qk.submission(id,roles)`); pass
    `access` cho FormRenderer. Detail fetch form trước để default-all không nháy mask.
  - **Verify:** typecheck form-core/builder sạch · api `tsc --noEmit` sạch (skip prisma-generate vì
    DLL lock) · form-core 124 (mask 6) · api submissions 9 (mới 3) · builder layout 4 · biome sạch 12
    file (đã normalize CRLF `form-core/index.ts`) · **reviewer PASS** (không fix bắt buộc) · **live
    smoke**: HTTP thật (submit no-role→strip salary · submit hr→lưu · GET no-roles→mask · GET
    `?roles=hr`→hiện · invalid→422) + **UI MCP** (detail picker default-all hiện Email+Salary; bỏ `hr`
    → refetch chỉ Email; console sạch trừ RR future-flag warning pre-existing). Form smoke đã xoá.
  - ⚠️ **GOTCHA môi trường:** api dev = `tsc && node dist/main.js` (KHÔNG watch) ⇒ phải rebuild dist +
    restart để chạy code mới; **kill api PID làm turbo teardown CẢ builder Vite** → phải start lại Vite
    (`npx vite`) cho UI-smoke. Live-smoke chạy api+vite STANDALONE (port 3001/5173); owner nên
    `pnpm dev` lại sau /clear. NEXT = **FB1 (draft/publish/version)** HOẶC FS3 (file storage) — ngã ba
    infra-vs-app vẫn chưa chốt; FS2 hợp-lệ cả hai nhánh.
- 2026-06-29 (đóng phase): **FB1b DONE — Form draft/publish/version (builder UI).** Owner chốt 2:
  Publish ở **header editor + panel Versions riêng**; diff **field-level**.
  - **Backend (additive):** `FormVersionsService.loadActiveVersion` + controller `GET /forms/:id/active-version`
    (`FormVersion | null`, never-published = null KHÔNG 404; reuse repo `loadActive` đã có) + 2 test
    (service 7). KHÔNG prisma/migration/changeset.
  - **Builder feature `apps/builder/src/versions/`** (mirror `submissions/`): `client.ts` (publish/list/
    getVersion/getActiveVersion/cloneDraft, empty-body→null); `diff.ts` pure `diffForms` field-level
    (flatten leaf reuse `childrenOf`/`isLayoutContainer`, container transparent + array `name[].child`,
    skip display-text) + `hasFormChanges` + `diff.test.ts` (7); `useVersions.ts` (list/version/active
    query + publish/cloneDraft mutation + invalidation); `VersionsRoute.tsx` (history + publish + Xem
    readPretty modal + Khôi phục clone-draft confirm + DiffView Thêm/Xoá/Đổi); `PublishControl.tsx`
    header widget (Publish save-then-publish + **badge content-based** `diffForms(active.body, schema)`
    ≠ rỗng → KHÔNG so timestamp vì publish bump `updatedAt`). Wiring: qk `versions/version/activeVersion`,
    type `FormVersionSummary`, route `/forms/:id/versions`, ExplorerRail menu "Versions", App.tsx render
    `<PublishControl>` khi có formId, characterization mockFetch route `/active-version`.
  - **Verify ALL PASS:** builder+api typecheck sạch · api 114 (form-versions 7) · diff 7 · App
    characterization 5 (riêng) · biome sạch 16 file · **reviewer PASS** · **live smoke**: HTTP thật
    (active-version null→v1→**pin v1 khi draft +phone**→v2→clone-draft rollback 1-field) + **UI MCP**
    (header badge "Chưa publish"→Publish→"Đã publish v1"; panel Versions: diff "trùng khớp v1", lịch sử
    v1, Xem modal readPretty; console chỉ RR future-flag pre-existing — đã sửa `destroyOnClose`→`destroyOnHidden`).
  - ⚠️ **GOTCHA (mới, quan trọng):** smoke đầu FALSE-FAIL `active-version` 404 vì **server FB1a CŨ còn
    bind 3001** (EADDRINUSE — server mới KHÔNG bind) ⇒ trước live-smoke phải KILL process nghe 3001 rồi
    start lại (Nest log Mapped route nhưng request "Cannot GET" = đang hit server cũ). Express 4 path-to-regexp
    KHỚP route hyphen (`active-version`) bình thường — KHÔNG phải lỗi route. NEXT = **FS3 (file storage)**
    HOẶC FS4 (ops) — FB1 (versioning) XONG cả backend+UI; ngã ba infra-vs-app vẫn chưa chốt.
