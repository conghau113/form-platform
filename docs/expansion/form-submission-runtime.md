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

### FS2 — Submission access control + field masking
- [ ] RBAC view/edit/export submission theo role; server-side strip/reject field hidden/non-viewable
  (dùng `canView`/`canEdit` của form-core — đã có); submission audit entry tối thiểu (ai/lúc nào).
- [ ] Builder: mask field không được view ở detail/list/export.

### FB1 — Form draft/publish/version (governance hardening)
- [ ] `FormVersion` immutable snapshot + `publishedAt`/`publishedBy`/`activeVersion`; save = draft;
  publish tạo version; runtime/submission dùng published version. Submission FS1 đã pin snapshot ⇒
  đây là additive hardening (không phá dữ liệu cũ). Builder: version history + diff + rollback/clone.
- [ ] Endpoints: `GET /forms/:id/versions`, `/versions/:v`, `POST /forms/:id/publish`,
  `/versions/:v/clone-draft`.

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
</content>
</invoke>
