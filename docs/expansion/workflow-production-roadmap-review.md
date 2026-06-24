# Form + Workflow Production Roadmap Review

> Mục tiêu: tổng hợp lại đánh giá về `workflow-editor-v2`, định hướng mở rộng sản phẩm,
> các tính năng nên thêm, nhóm người dùng/ngành nên ưu tiên, và các điểm cần validate trước
> khi đầu tư sâu. Tài liệu này **không thay thế** `docs/expansion/workflow-editor-v2.md`;
> nó là lớp phân tích sản phẩm/production ở phía trên track editor UX và mở rộng sang
> toàn bộ source hiện tại: form-builder, renderer, API, schema/core, workflow, AI.

Cập nhật: 2026-06-24.

## 1. Kết luận điều hành

Hướng hiện tại là đúng, nhưng cần nhìn rộng hơn workflow editor. Source hiện tại đã có nền
form-builder khá mạnh: schema-driven contract, renderer web, form-core validation/conditions,
builder drag-drop, property panel, registry-driven fields, presets, i18n, reactions, remote
dataSource, AI generate/refine và workspace API. Tuy vậy, cảm giác "form-builder chưa hoàn
chỉnh" là chính xác nếu tiêu chí là production product: còn thiếu submission lifecycle,
form publish/version, audit, collaboration, runtime data management, governance và các màn
hình vận hành sau khi người dùng submit form.

`workflow-editor-v2` vẫn phù hợp để nâng workflow editor từ prototype lên mức có thể dùng
nghiêm túc hơn. Các phase WE1-WE4 đang đánh vào những vấn đề thật của source hiện tại:
graph khó đọc, thao tác undo/redo/highlight path, workflow-form relationship chưa rõ,
status/node type chưa chuẩn hóa.

Tuy nhiên, nếu mục tiêu là production cho nhiều người dùng và thị trường B2B, không nên dừng
ở editor. Editor chỉ giúp người dùng **thiết kế quy trình**. Sản phẩm production cần giúp họ
**vận hành quy trình**: task inbox, workflow instance, approve/reject, audit trail, versioning,
RBAC, SLA, notification, analytics, integration và template theo ngành/use case.

Định vị nên đi theo hướng:

**Form + Workflow + Task + Submission + Audit platform cho quy trình nội bộ của SME/mid-market,
có AI hỗ trợ dựng nhanh nhưng vẫn schema-valid, no-eval và có human review.**

Không nên định vị quá rộng là "low-code platform" ngay từ đầu. Vị trí tốt hơn là:

**Từ form đến phê duyệt đến audit trail, dành cho tổ chức đang mắc kẹt giữa Excel, email,
Zalo/Slack/Teams, Google Form và các quy trình thủ công rời rạc.**

Điểm quan trọng: không nên xem workflow là phần duy nhất chưa xong. Form-builder hiện đã
author schema tốt, nhưng một form product production cần trả lời thêm:

- Form đã publish version nào?
- Ai được sửa/publish form?
- Dữ liệu submit lưu ở đâu?
- Ai được xem/sửa/export submission?
- File upload lưu thế nào, retention ra sao?
- Field-level permission có áp dụng nhất quán giữa builder, renderer, API và export không?
- Schema sửa sau khi có submission cũ thì xử lý ra sao?
- Ai đã sửa schema, lúc nào, thay đổi gì?
- Có thể test form với sample data trước khi publish không?

### Bộ lọc "thật sự cần thiết"

Từ đây trở xuống, mọi đề xuất nên được đọc theo bộ lọc này:

- **Must-have**: nếu thiếu sẽ làm sản phẩm không vận hành được end-to-end, gây sai dữ liệu,
  làm workflow/submission cũ bị ảnh hưởng khi schema đổi, làm lộ/sai quyền truy cập, hoặc
  không có audit để truy vết.
- **Should-have**: không nhất thiết chặn pilot đầu tiên, nhưng thiếu sẽ làm vận hành khó mở rộng,
  khó support, hoặc dễ tạo lỗi cấu hình.
- **Nice-to-have**: cải thiện trải nghiệm/độ đẹp/tốc độ thao tác, nhưng không phải điều kiện để
  chạy production an toàn.

Các cải thiện thuần trực quan như MiniMap, edge style, view modes, swimlane/kanban, layout đẹp
không được coi là production blocker. Chúng chỉ nên làm khi phục vụ trực tiếp việc giảm lỗi
authoring hoặc sau khi các lớp form versioning, submission, audit, RBAC và runtime đã có nền.

### Ưu tiên đã lọc

| Mức | Hạng mục | Lý do |
|---|---|---|
| Must | Form draft/publish/version | Tránh schema mới làm hỏng submission/workflow instance cũ |
| Must | Server-side submission validation | Client validation không đủ tin cậy cho production |
| Must | Submission storage/list/detail | Form-builder không thành product nếu không lưu và vận hành dữ liệu submit |
| Must | RBAC policy + enforcement path | Tránh user xem/sửa/export sai quyền |
| Must | Audit trail tối thiểu | Cần truy vết ai làm gì, lúc nào, với dữ liệu/version nào |
| Must | Workflow instance + task inbox MVP | Workflow phải chạy được, không chỉ là diagram |
| Should | Form/workflow validation issue mapping | Giảm lỗi cấu hình trước publish |
| Should | SLA/notification cơ bản | Cần cho quy trình có hạn xử lý |
| Nice | MiniMap, edge style, view modes, visual layout polish | Cải thiện UX nhưng không quyết định production correctness |

## 2. Mức độ chắc chắn

### Chắc chắn cao

Plan `workflow-editor-v2` phù hợp với source hiện tại.

Lý do:

- Repo đã có contract workflow trong `packages/workflow-schema`.
- Repo đã có engine thuần trong `packages/workflow-core`.
- Builder đã có workflow editor dựa trên xyflow.
- Workflow definition đã có node, transition, start, guard, role, form binding.
- `workflow-model.ts` giữ boundary giữa xyflow runtime và contract.
- `validateGraph()` đã trả `GraphError.ref`, đủ nền cho validation highlight.
- `advance()` đã có guard JSONLogic và role check, đúng hướng no-eval.

### Chắc chắn trung bình-cao

Muốn production thì cần thêm runtime/governance/task/audit track.

Lý do: các sản phẩm workflow production như Camunda/formsflow.ai không chỉ có diagram editor.
Họ có engine/runtime, tasklist, versioning, auditability, RBAC, integration, analytics. Với
B2B, các câu hỏi quan trọng thường là:

- Ai đang phải xử lý việc này?
- Case này đang ở bước nào?
- Dữ liệu nào đã được gửi/sửa?
- Ai duyệt, lúc nào, với lý do gì?
- Quy trình version nào đang chạy?
- Nếu quá hạn thì ai bị nhắc/escalate?
- Auditor hoặc manager có thể xem lại toàn bộ lịch sử không?

Nếu chưa trả lời được các câu hỏi này, sản phẩm vẫn nghiêng về "workflow designer" hơn là
"workflow platform".

### Cần validate bằng người dùng thật

ICP/ngành ưu tiên có cơ sở, nhưng cần discovery.

Đề xuất hiện tại:

- SME/mid-market, khoảng 50-500 nhân sự.
- Có nhiều phòng ban, nhiều quy trình duyệt, có process owner.
- Đang dùng Excel/email/chat/form rời rạc.
- Có internal IT, admin power user, hoặc business analyst có khả năng cấu hình hệ thống.

Không nên nhắm micro-SME quá sớm vì họ thường thiếu ngân sách, thiếu kỷ luật quy trình, và
có thể giải quyết bằng Google Form + Sheet + chat. Không nên nhắm enterprise regulated lớn
ngay từ đầu vì sales cycle dài, compliance nặng, yêu cầu security/procurement/SSO/audit cao.

## 3. Đối chiếu source hiện tại

### 3.1 Contract workflow

Source: `packages/workflow-schema/src/schema.ts`.

Hiện contract đang có:

- `workflowVersion`
- `id`
- `title`
- `start`
- `nodes`
- `transitions`

Node hiện có:

- `id`
- `status`
- `formId?`
- `position?`

Transition hiện có:

- `id`
- `from`
- `to`
- `action`
- `guard?`
- `role?`

Instance hiện có trong schema:

- `id`
- `definitionId`
- `definitionVersion`
- `current`
- `data`
- `history`

Nhận xét:

- Nền contract hợp lý cho bản đầu.
- `position` là presentation data duy nhất lọt vào contract, đúng rule hiện tại.
- `WorkflowInstance` đã có mầm runtime, nhưng còn tối giản.
- `historyEntrySchema` mới lưu `from`, `to`, `action`, `at`; production cần thêm actor, reason,
  metadata, field changes, transition id, workflow version, source of action.

### 3.2 Core engine

Source: `packages/workflow-core/src/engine.ts`.

Hiện engine đã có:

- `createInstance()`
- `availableTransitions()`
- `advance()`
- role check
- guard check bằng JSONLogic
- immutable update instance

Nhận xét:

- Đây là nền tốt vì engine thuần, không phụ thuộc React/API.
- `advance()` đang phù hợp cho runtime MVP.
- Production cần thêm lớp xung quanh engine, không nhất thiết nhồi hết vào core:
  authorization, assignment, audit log, idempotency, notification, persistence, version pinning.

### 3.3 API workflow hiện tại

Source: `apps/api/src/modules/workflows/`.

Hiện API có:

- Save workflow definition.
- Load workflow definition.
- List workflow summaries.
- Move workflow.
- Delete workflow.
- Project access check qua `ProjectsService.requireAccess`.
- Server-side `migrateWorkflow()` khi save.

Nhận xét:

- API hiện là quản lý workflow definition, chưa phải runtime API.
- Chưa có endpoint để tạo instance/case.
- Chưa có endpoint task inbox.
- Chưa có endpoint execute transition trên instance.
- Chưa có audit log.
- Chưa có draft/publish/version lifecycle.

### 3.4 Builder workflow editor

Source: `apps/builder/src/workflow/WorkflowEditor.tsx`.

Working tree hiện tại đã có nhiều phần WE1:

- Auto-tidy khi definition không có `position`.
- Undo/redo snapshot `{meta,nodes,edges}`.
- Keyboard shortcuts `Ctrl+Z`, `Ctrl+Shift+Z`, `Ctrl+Y`.
- Coalesce edit/drag/delete thành history step hợp lý.
- MiniMap.
- Smooth/orthogonal edge qua `floating-edge.tsx`.
- Highlight upstream path qua `traceUpstream()`.
- Inline rename node bằng double click.
- Inline form drawer để sửa/tạo form gắn với node.
- AI workflow drawer đã có trong editor.

Nhận xét:

- WE1 thực tế đã đi khá xa so với trạng thái tài liệu.
- Cần verify bằng test/typecheck/biome/live smoke trước khi tick plan.
- `workflow-editor-v2.md` nên được cập nhật trạng thái sau khi verify.
- Điểm cần chú ý: auto-tidy có thể làm workflow cũ thiếu `position` bị dirty ngay khi mở vì
  `fromFlow()` sẽ ghi position. Cần quyết định đây là hành vi mong muốn hay cần baseline lại.

## 4. Đánh giá source-wide, đặc biệt form-builder

### 4.1 Form-builder hiện đã mạnh ở đâu

Source không phải mới ở mức prototype thô. Những phần sau là nền đáng giữ:

#### Schema contract khá giàu

Source: `packages/form-schema/src/schema.ts`.

Contract hiện có nhiều năng lực production-relevant:

- `CURRENT_FORM_VERSION` và migration path.
- Field tree với nhiều field type.
- Layout responsive qua `layout.colSpan`.
- Conditional visibility bằng JSONLogic.
- Reactions: visible, disabled, value, options, required.
- Field permissions: `viewRoles`, `editRoles`.
- i18n per field/option/message.
- Validation rules: required, len, min, max, pattern, format, cross.
- Async validator.
- Form-level settings như layout và validate trigger.
- Linked preset via `presetId` + `overrides`.

Đây là nền tốt vì contract khá declarative, không lưu function, không eval, và có hướng
multi-renderer.

#### `form-core` đã gom shared behavior đúng chỗ

Source: `packages/form-core/src/`.

Nền core đã có:

- `buildZodSchema()` compile validation sang Zod.
- `isVisible()` và `evalRule()` dùng JSONLogic.
- RBAC helpers như `canView`/`canEdit`.
- Reactions engine.
- Linked preset resolution.
- i18n localization.
- Warning vs blocking validation.

Điểm mạnh: renderer không phải tự duplicate logic. Đây là đúng kiến trúc "schema là contract,
core là shared runtime".

#### Web renderer đã gần với runtime renderer thật

Source: `packages/form-renderer-web/src/FormRenderer.tsx`.

Renderer hiện có:

- `migrate(schema)` trước khi render.
- resolve linked preset.
- localize form.
- react-hook-form + Zod resolver.
- validation rebuild theo current values để hidden/RBAC fields không block submit.
- async validator.
- reactions.
- warnings.
- value effects.
- `access` context.
- `initialValues`.
- `onSubmit` clean payload.
- `designMode`, `readPretty`, `hideSubmit`.
- injectable `fetcher`.

Đây là nền tốt để dùng cùng một renderer cho builder preview và runtime submission/task forms.

#### Builder authoring UX đã có nhiều mảnh quan trọng

Source: `apps/builder/src/App.tsx`, `editor/`, `canvas/`, `PropertyPanel/`, `field-registry/`.

Hiện builder có:

- `useFormEditor()` tách client state, history, selection, clipboard.
- `useEditorShortcuts()` cho undo/redo, select all, copy/paste, move, delete.
- `DesignCanvas` render bằng `FormRenderer` trong design mode, tức preview gần runtime.
- Drag/drop, move, copy, delete, selection shell, hover outline.
- Marquee selection, keyboard reorder, grid resize.
- Device preview: Desktop/Tablet/Mobile.
- JSON editor two-way.
- Preview mode dùng real `FormRenderer`.
- Property panel chia section, search, pin.
- Type-specific setting dựa trên registry.
- Validation editor.
- DataSource editor.
- Reactions editor.
- Permissions editor.
- Translations editor.
- Preset link.
- AI assistant drawer.

Nhận xét: builder hiện không thiếu "nhiều tính năng authoring"; cái thiếu nằm nhiều hơn ở
product lifecycle và vận hành dữ liệu.

#### API đã có form definition CRUD theo project/folder

Source: `apps/api/src/modules/forms/`.

Hiện API có:

- Save form definition.
- Load form definition.
- List form summaries.
- Move form.
- Delete form.
- Project/folder placement.
- Server-side `migrate()` khi save.
- Project access check.

Đây là đủ cho builder definition management, nhưng chưa đủ cho production form platform.

### 4.2 Form-builder chưa hoàn chỉnh ở đâu

#### Thiếu form lifecycle: draft/publish/version

Hiện save form là upsert definition trực tiếp. Với production, điều này chưa đủ.

Vấn đề:

- Người sửa form có thể ảnh hưởng ngay tới runtime nếu runtime đọc cùng definition.
- Không có khái niệm published version.
- Không pin submission vào schema version.
- Không có review/publish approval.
- Không có rollback.
- Không có migration story cho submission cũ khi schema đổi.

Nên thêm:

- `FormDraft`.
- `FormVersion`.
- `publishedAt`, `publishedBy`.
- `activeVersion`.
- `versionNotes`.
- `deprecatedAt`.
- Submission pin vào `formId + formVersion`.

MVP:

- Save chỉ lưu draft.
- Publish tạo immutable version snapshot.
- Runtime/submission dùng published version.
- Editor mở draft hoặc clone từ published.

Mức ưu tiên: **Tier 1 trước workflow runtime**. Workflow instance cần pin vào form version; nếu
không, một thay đổi schema sau này có thể làm instance/submission cũ render hoặc validate khác đi.

API còn thiếu:

- `GET /forms/:id/versions`.
- `GET /forms/:id/versions/:version`.
- `POST /forms/:id/publish`.
- `POST /forms/:id/versions/:version/clone-draft`.

#### Thiếu submission storage và submission management

Hiện renderer có `onSubmit`, nhưng API/source chưa có module submission production.

Cần có:

- Submit form endpoint.
- Store submission payload.
- Validate server-side bằng `form-core`.
- Link submission với project/form/version/workflow instance.
- Submission list/search/detail.
- Edit submission nếu workflow cho phép.
- Export.
- Attachment/file metadata.
- Access control theo role.

Nếu thiếu submission layer, form-builder chỉ tạo form, chưa vận hành dữ liệu.

#### Thiếu server-side runtime validation cho submissions

Renderer validate client-side tốt, nhưng production không được tin client.

Cần:

- API submit chạy `migrate(formVersionSnapshot)` và `buildZodSchema()`.
- Apply RBAC/visibility stripping server-side.
- Async validator server-side hoặc proxy policy rõ ràng.
- Reject payload chứa hidden/non-viewable fields nếu policy yêu cầu.
- Audit validation failure optional.

Điểm cần quyết:

- Server có chạy remote async validators không?
- Nếu có, chạy qua allowlist/proxy nào?
- Network failure fail-open hay fail-closed? Renderer hiện document asyncValidator network failure
  fail-open; production regulated có thể cần policy khác.

#### Thiếu file upload/storage policy

Schema có upload field trong renderer/validation, nhưng production cần file layer.

Cần có:

- Upload endpoint.
- Storage backend abstraction: local/S3/R2/MinIO.
- Virus scan hook optional.
- Max file size/type policy.
- Signed URL.
- Retention policy.
- File access check.
- Audit download/delete.
- Attachment metadata in submission.

Nếu không có, các workflow chứng từ như invoice/payment/vendor onboarding sẽ không đủ dùng.

#### Field permissions mới dừng ở author/render layer

Schema có `permissions.viewRoles/editRoles`, renderer có `access`, nhưng production cần end-to-end.

Cần đảm bảo:

- Builder preview test được bằng role.
- Runtime form render theo actor role.
- Server submit/update cũng enforce.
- Export/submission detail cũng mask field không được view.
- Audit/log không lộ dữ liệu nhạy cảm sai role.

Gap cụ thể từ source audit: `PropertyPanel` hiện cho edit field properties bình thường; nó chưa gọi
`canEdit()`/permission policy để khóa authoring theo role. Điều này không sai cho single-user builder,
nhưng production multi-user cần có:

- Ai được sửa schema/form settings.
- Ai được sửa field-level permissions.
- Ai được sửa field mà chính họ không có `editRoles`.
- Admin override có audit.

Nên thêm builder UX:

- Role preview switcher.
- Permission matrix view.
- Warning khi field nhạy cảm không có permission.
- Template role setup wizard.

#### Logic/reactions cần QA tooling

Form-builder đã có visibleWhen/reactions/cross validation, nhưng complex logic dễ sai.

Cần thêm:

- Dependency graph view.
- Detect missing/invalid field references.
- Detect reaction cycles.
- Detect hidden-required conflicts.
- Test form with sample data.
- Show "why hidden/disabled/required" debug info.

Nên có một validation/lint endpoint hoặc pure validation service dùng chung:

- Dangling field references trong visibleWhen/reactions/cross rules.
- Dangling preset links.
- Circular or conflicting reactions.
- Hidden-required conflicts.
- Option/dataSource config incomplete.
- Async validator URL/connection chưa test.

Endpoint/API gợi ý:

- `POST /forms/validate-draft` cho body draft chưa lưu.
- `GET /forms/:id/validate` cho form đã lưu.
- Kết quả trả về issue có `severity`, `path`, `code`, `message`, `ref`.

Hiện user có thể tạo logic bằng UI và JSON panel, nhưng production authoring cần tooling để
không publish form lỗi.

#### Remote dataSource cần governance

Builder có remote dataSource URL, renderer có injectable fetcher. Production cần chính sách.

Rủi ro:

- User nhập URL tùy ý có thể tạo SSRF nếu server proxy sau này.
- Credentials không nên nằm trong schema.
- CORS/auth runtime có thể lỗi.
- Data shape mismatch khó debug.

Cần:

- Connection registry ngoài schema.
- DataSource by id thay vì raw URL cho production.
- Test dataSource trong builder.
- Allowlist/domain policy.
- Auth profile/secret store.
- Preview result mapping.
- Cache/invalidation policy.

MVP có thể giữ raw URL ở builder, nhưng trước production hosted nên chuyển sang connection layer.

#### Theme/preset/library lifecycle còn thiếu governance

Source đã có theme tokens, presets, linked fields. Nhưng production cần:

- Preset versioning.
- Preset publish/update propagation policy.
- Who can edit shared preset.
- Impact analysis: preset này đang dùng ở form nào.
- Rollback preset.
- Theme version/publish nếu nhiều form dùng chung.

Preset lifecycle cần quyết định rõ trước khi dùng rộng:

- Xóa preset thì chặn nếu còn form đang link, hay tự unlink?
- Nếu unlink, field giữ frozen snapshot hiện tại hay revert về overrides?
- Nếu preset đổi type, linked fields xử lý thế nào?
- Có cần `deprecated` thay vì delete cứng không?
- Có audit entry cho preset update/delete và danh sách form bị ảnh hưởng không?

Hiện linked preset là hướng rất tốt, nhưng khi dùng thật nhiều project sẽ cần governance.

#### Collaboration chưa có

Builder hiện là single-user editor.

Production team authoring thường cần:

- Last edited by/at.
- Lock or optimistic concurrency.
- Conflict detection.
- Comments on draft.
- Review request.
- Change summary/diff.
- Audit definition changes.

Không cần real-time collaborative editing ngay. Nhưng cần ít nhất optimistic concurrency và
draft audit để tránh người này ghi đè người kia.

#### Builder UX còn thiếu onboarding/quality gates

Với business user, canvas trống + nhiều field type dễ choáng.

Nên thêm:

- Form quality checklist.
- Empty-state template chooser.
- Field name uniqueness warnings visible.
- Required field summary.
- Logic summary.
- Permissions summary.
- Publish checklist.
- Test submit mode with sample data.
- Better import validation report.

AI generate đã giúp giảm blank-canvas problem, nhưng vẫn cần quality gates.

### 4.3 API/persistence gaps rộng hơn

API hiện phù hợp development/demo hơn là production SaaS.

Cần bổ sung dần:

- Real database posture: Postgres migrations, backups, indexes.
- Tenant model rõ ràng.
- Auth thực thay vì owner header/dev owner pattern.
- Submission module.
- Audit module.
- File module.
- Version module.
- Rate limits.
- Request ids/idempotency.
- Soft delete/archive.
- Search pagination.
- Export jobs.
- Background jobs for notifications/SLA.

Không cần làm tất cả trước, nhưng roadmap nên thừa nhận đây là phần production service layer.

### 4.4 Renderer gaps

Renderer web đã tốt, nhưng production cần kiểm thêm:

- Accessibility audit cho generated forms.
- Mobile responsiveness smoke theo field/container.
- Large form performance.
- Async validator cancellation/debounce edge cases.
- Upload production integration.
- Date/time serialization policy.
- Read-only/review mode for workflow tasks.
- Field-level masking for sensitive data.
- Error summary on submit.
- Localization completeness.

Renderer native đang deferred; không nên kéo vào production roadmap sớm nếu web-first.

### 4.5 AI gaps

AI track hiện rất mạnh cho generate/refine form/workflow, MCP và eval harness. Nhưng production
cần thêm guardrails ở lớp product:

- Diff preview bắt buộc.
- AI output audit.
- Prompt/input retention policy.
- BYOK/secret handling.
- Model/provider quota and failure UX.
- AI-generated schema quality checklist.
- AI reviewer cho logic/permissions/security.

AI nên là accelerator cho builder, không thay thế publish governance.

### 4.6 Đánh giá tổng quan source hiện tại

Nếu chấm theo lớp:

- Contract/schema: mạnh, khoảng 75-85% cho authoring platform.
- Core/rendering: khá mạnh, khoảng 70-80% cho web runtime cơ bản.
- Builder authoring UX: nhiều tính năng, khoảng 65-75%, nhưng cần polish/QA gates.
- API definition management: đủ cơ bản, khoảng 50-60%.
- Submission/runtime: thấp, khoảng 10-20%.
- Governance/audit/versioning: thấp, khoảng 10-20%.
- Workflow runtime/task: thấp-trung bình, vì engine có mầm nhưng API/UI chưa có, khoảng 20-30%.
- Production SaaS ops/security: còn sớm, khoảng 20-30%.

Kết luận: source hiện tại không yếu ở "builder tạo form"; yếu ở "platform chạy form/workflow
trong tổ chức thật".

## 5. Đánh giá plan `workflow-editor-v2`

### WE1 - Editor UX cốt lõi

Đánh giá: nên giữ, nhưng không phải mọi mục trong WE1 đều là production blocker.

Phần thật sự cần thiết trong WE1 là các thao tác làm giảm rủi ro authoring:

- Undo/redo: **must-have cho authoring safety**, vì người dùng có thể sửa nhầm graph/schema.
- Auto-tidy cho AI-generated workflow thiếu position: **should-have**, vì nếu thiếu thì AI output
  vẫn đúng contract nhưng khó review.
- Highlight path/validation issue mapping: **should-have**, vì giảm lỗi review graph.
- Smoothstep edge, spacing, MiniMap, width cap: **nice-to-have/polish**, hữu ích cho usability
  nhưng không phải điều kiện production nếu runtime/governance chưa có.

Điểm cần bổ sung:

- Validation issue mapping nên kéo sớm hơn WE5 nếu có thời gian. Khi `validateGraph()` có `ref`,
  UI có thể đưa người dùng đến node/edge lỗi. Đây quan trọng vì ngăn publish graph sai, không
  phải vì yếu tố trực quan.
- Cần test hoặc smoke rõ các thao tác: add, delete, rename, move, connect, set start, AI apply,
  tidy, save, undo/redo.

### WE2 - Inline create/rename Explorer

Đánh giá: đúng UX, nhưng không phải production moat.

WE2 giảm friction đáng kể khi tạo nhiều form/workflow/folder. Modal prompt làm đứt flow, đặc
biệt với power user. Inline create kiểu VS Code là hợp lý.

Nên giữ scope:

- New folder/form/workflow tạo "Untitled" trong tree.
- Auto focus rename input.
- Enter commit.
- Esc cancel.
- Blur có thể commit hoặc cancel tùy UX được chốt.
- Delete vẫn dùng confirm modal vì phá hủy dữ liệu.

Điểm cần cẩn thận:

- Optimistic UI vs server-created id.
- Nếu create fail thì rollback item tạm.
- Rename item đang active phải sync route/title/cache.
- Không làm chung quá rộng với tree refactor.

### WE3 - Quản lý đa-form theo workflow

Đánh giá: rất đúng với định vị Form + Workflow.

Một workflow thực tế hiếm khi chỉ có một form. Ví dụ:

- Request form.
- Manager review form.
- Finance approval form.
- Completion/settlement form.
- Rejection/change request form.

WE3 giúp người dùng nhìn workflow như một "process app", không phải chỉ là graph.

Nên thêm:

- "Forms used in this workflow" panel.
- Warning form missing/deleted.
- Quick create form for selected node.
- Quick edit form drawer.
- Badge trong explorer cho form đang thuộc workflow.
- `usedForms(def)` pure function có test.

Điểm cần tránh:

- Không nên đưa danh sách form vào workflow contract nếu có thể suy ra từ `nodes[].formId`.
- Không nên duplicate form title vào contract ở giai đoạn này, trừ khi cần snapshot thật.

### WE4 - Status catalog

Đánh giá: đúng hướng nhưng cần quyết định scope kỹ.

Vấn đề hiện tại:

- Node đang lưu `status` string tự do.
- Màu/type/semantic chưa chuẩn hóa.
- Nhiều workflow có thể dùng status giống nhau nhưng nhập khác nhau.
- Khó làm reporting hoặc template nếu status không có code chuẩn.

Đề xuất:

- Status catalog nên project-scoped hoặc workspace-scoped, không nên global cứng.
- Node giữ optional `statusCode`, có thể giữ `status` làm label snapshot/backward compatibility.
- Optional `kind`: `start`, `normal`, `optional`, `end` hoặc enum tương tự.
- Màu nên resolve từ catalog/kind, không lưu raw color trong workflow contract.
- Field mới optional, parse-compat test, không bump `workflowVersion` nếu chỉ additive.

Rủi ro:

- Nếu catalog làm quá sớm/quá nặng, sẽ kéo theo API/master-data UI phức tạp.
- Nếu để status string tự do quá lâu, sau này analytics/template khó chuẩn hóa.

Khuyến nghị:

- Làm bản tối thiểu: `kind?`, `statusCode?`, project-scoped catalog CRUD đơn giản.
- Chưa cần workflow migration nếu additive và schema cũ vẫn parse.
- Chưa cần advanced lifecycle của catalog.

### WE5 - View modes, validation, keyboard-first

Đánh giá: chỉ một phần thật sự cần; phần view modes nên để sau.

Trong WE5, phần quan trọng nhất là:

- Validation issue mapping trước publish.
- Keyboard-first.
- Stage/swimlane chỉ làm nếu có use case cụ thể.

View modes như timeline, kanban, swimlane, tree có giá trị, nhưng nên làm sau khi đã có runtime/task.
Nếu chưa có task/case, kanban có thể chỉ là "view đẹp" chứ chưa giúp vận hành.

## 6. Khoảng trống production hiện tại

### 6.1 Workflow runtime

Hiện có schema/engine mầm, nhưng chưa có sản phẩm runtime end-to-end.

Cần có:

- Create instance/case từ workflow definition.
- Bind instance với form submission hoặc business object.
- Current state.
- Available actions theo actor.
- Execute transition API.
- Persist data và history.
- Idempotency cho action submit/approve.
- Instance list/search/filter.

MVP runtime nên trả lời:

- "Tôi tạo một request mới như thế nào?"
- "Request này đang ở bước nào?"
- "Ai có quyền approve bước tiếp theo?"
- "Approve xong state chuyển ra sao?"
- "History xem lại được không?"

### 6.2 Task inbox

Task inbox là màn hình người dùng cuối sẽ dùng nhiều hơn editor.

Cần có:

- My tasks.
- Team/unassigned tasks.
- Overdue tasks.
- Task detail.
- Approve/reject/request changes.
- Comment.
- Attachment.
- Delegate/reassign.
- Filter theo workflow, status, role, due date.

Nếu không có task inbox, workflow chỉ là định nghĩa. Người dùng business sẽ hỏi: "Vậy hằng ngày
tôi vào đâu để làm việc?"

### 6.3 Draft/publish/versioning

Production không nên chạy trực tiếp bản đang sửa.

Cần có:

- Draft workflow definition.
- Publish workflow version.
- Active version.
- Instance pin vào published version.
- Workflow draft có thể sửa mà không ảnh hưởng instance đang chạy.
- Optional: migrate in-flight instances về version mới.
- Optional: deprecate/archive version.

Đây là điểm cực quan trọng cho audit và an toàn vận hành.

### 6.4 Audit trail

Audit trail là một trong các moat B2B.

Nên log:

- Workflow definition created/updated/published.
- Form definition updated.
- Instance created.
- Task assigned/reassigned.
- Transition executed.
- Approve/reject action.
- Data changed.
- Comment/attachment added.
- Permission changed.
- Integration/webhook fired.

Mỗi audit entry nên có:

- `id`
- `tenantId/projectId`
- `entityType`
- `entityId`
- `action`
- `actorId`
- `actorRole`
- `at`
- `before?`
- `after?`
- `reason?`
- `source` (`user`, `system`, `api`, `ai`, `integration`)
- `workflowDefinitionId?`
- `workflowVersion?`
- `instanceId?`
- `requestId/idempotencyKey?`

Điểm quan trọng: audit log nên append-only ở mức application. Không nên cho user sửa/xóa audit entry
qua UI thông thường.

### 6.5 RBAC và assignment

Hiện transition có `role`, nhưng production cần rõ hơn.

Cần phân biệt:

- Project role: owner/admin/editor/viewer.
- Workflow design permission: ai được sửa/publish.
- Task permission: ai được xem/approve/reject.
- Data permission: ai được xem field nhạy cảm.
- Audit permission: ai được xem/export audit.

Assignment model cần trả lời:

- Assign cho role hay user cụ thể?
- Có group/team không?
- Có "manager of requester" không?
- Có dynamic assignee từ form data không?
- Nếu role có nhiều người thì task hiện cho tất cả hay claim một người?
- Có delegation/out-of-office không?

Không nên nhồi tất cả vào phase đầu. Nhưng contract/design nên tránh tự khóa đường.

### 6.6 SLA, notification, escalation

Đây là thứ biến workflow thành công cụ vận hành.

Cần có:

- Due date theo node/task.
- Reminder trước hạn.
- Overdue status.
- Escalation sang manager/team.
- Notification email/chat.
- SLA metrics.

MVP có thể đơn giản:

- `dueAt` trên task.
- scheduled job check overdue.
- email notification.
- badge overdue trong task inbox.

### 6.7 Analytics

Analytics nên đến sau khi runtime có dữ liệu.

Nên có:

- Số instance theo workflow.
- Average cycle time.
- Time spent per state.
- Bottleneck node.
- Approval/rejection rate.
- Overdue count.
- Workload by assignee/team.
- Template adoption.

Analytics là thứ giúp buyer thấy ROI và giúp upsell.

### 6.8 Integration

Không workflow platform nào sống cô lập lâu.

Ưu tiên integration theo thứ tự:

1. Email notification.
2. Webhook in/out.
3. REST connector.
4. Google Sheet/Excel export.
5. Slack/Teams/Zalo OA.
6. ERP/CRM/accounting theo khách hàng pilot.

Không nên xây 20 connector khi chưa có ICP. Nên làm connector framework + vài connector có nhu cầu thật.

## 7. Roadmap đề xuất

### Track FB - Form Builder Completion

Mục tiêu: form-builder không chỉ tạo schema được, mà đủ an toàn để process owner publish form
cho người dùng thật.

FB1 - Builder quality gates:

- Form checklist trước khi publish.
- Detect duplicate/empty field names rõ trên UI.
- Detect invalid logic references.
- Detect hidden-required conflicts.
- Detect reaction cycles hoặc value-effect loops nếu có thể.
- Required/permission/logic summary.
- Import validation report tốt hơn.

FB2 - Role and permission preview:

- Role switcher trong preview.
- Field visibility/editability preview theo role.
- Permission matrix view.
- Warning field nhạy cảm chưa có permission.

FB3 - Test form with sample data:

- Cho nhập/lưu sample values.
- Hiển thị visibleWhen/reaction/validation result.
- Debug "why hidden/disabled/required".
- Test async validator/dataSource với mock hoặc real fetcher.

FB4 - Draft collaboration light:

- Last edited by/at.
- Optimistic concurrency hoặc version token để tránh ghi đè.
- Change summary/diff khi save/publish.
- Comment/review request optional.

FB5 - DataSource governance:

- Connection registry ngoài schema.
- Allowlist/domain policy.
- Secret/auth profile ngoài contract.
- Test dataSource trong builder.
- Preview mapping label/value/children.

### Track FS - Form Submission Runtime

Mục tiêu: form được publish, submit, lưu dữ liệu, xem lại, export và dùng làm đầu vào workflow.

FS1 - Submission MVP:

- Publish form version snapshot.
- Submit endpoint.
- Server-side validate bằng `form-core`.
- Store submission payload.
- List/detail submissions.
- Pin submission vào `formId + formVersion`.

FS2 - Submission access control:

- View/edit/export permission.
- Field masking theo permission.
- Server-side strip/reject hidden/non-viewable fields.
- Submission audit entries.

FS3 - File storage:

- Upload endpoint.
- Storage adapter local/S3-compatible.
- File metadata in submission.
- Size/type policy.
- Signed download URL.
- Access check and audit.

FS4 - Submission operations:

- Search/filter/pagination.
- Export CSV/JSON.
- Edit/correct submission with audit.
- Archive/delete policy.

FS5 - Workflow binding:

- Start workflow from submission.
- Task forms read/write instance data.
- Submission timeline links to workflow instance.
- Form version remains stable for running instances.

### Track WE - Workflow Editor UX

Mục tiêu: business user thiết kế workflow ít lỗi. Track này hỗ trợ production, nhưng đứng sau
form versioning/submission/runtime/governance nếu xét mức cần thiết.

WE1 - Authoring safety:

- Undo/redo. (**must-have cho authoring safety**)
- Auto-tidy on empty-position workflow. (**should-have cho AI/import review**)
- Highlight path hoặc issue focus. (**should-have cho review graph**)
- Smoke test add/delete/rename/move/connect/save/undo. (**must-have trước khi tick**)

WE1b - Non-blocking UI polish:

- Smoothstep/floating edge.
- Layout spacing.
- Width cap + ellipsis.
- MiniMap.

Ghi chú: WE1b chỉ là **nice-to-have**. Không nên ưu tiên hơn form versioning, submission,
server-side validation, RBAC, audit hoặc task runtime.

WE2 - Explorer inline create/rename:

- Inline create folder/form/workflow.
- Inline rename.
- Error rollback.
- Tree tests.

WE3 - Workflow-scoped forms:

- Used forms panel.
- Missing form warning.
- Quick edit/create.
- Pure `usedForms()`.

WE4 - Status catalog:

- Optional `kind`.
- Optional `statusCode`.
- Project-scoped catalog.
- Resolve label/color from catalog.
- Parse-compat test.

WE5 - Validation and keyboard support:

- Highlight `GraphError.ref`.
- Keyboard map.
- Optional swimlane/stage/tree views. (**nice-to-have nếu chưa có runtime/task**)

### Track WR - Workflow Runtime

Mục tiêu: workflow chạy được như business process thật.

WR1 - Instance MVP:

- Create instance.
- Load instance.
- List instances.
- Current state.
- Basic history.
- Execute transition.

WR2 - Task MVP:

- Task generated from current state/available transition.
- My tasks.
- Task detail.
- Approve/reject.
- Basic comment.

WR3 - Form submission binding:

- Start workflow from form submission.
- Store submitted data.
- Render task form/read-only context.
- Update instance data on transition.

WR4 - Assignment:

- Role-based assignment.
- Claim/unclaim.
- Reassign.
- Team queue.

WR5 - Instance search:

- Filter by workflow/status/assignee/due date.
- Sort by created/updated/due.
- Basic dashboard.

### Track WG - Governance

Mục tiêu: production-safe, audit-ready.

WG1 - Draft/publish:

- Draft definition.
- Published version.
- Active version.
- Save draft does not affect running instances.

WG2 - Version pinning:

- Instance points to definition version.
- Old instances continue on old version.
- Optional migration plan for in-flight instances.

WG3 - Audit trail:

- Append-only event log.
- Definition changes.
- Instance actions.
- Permission changes.
- Export.

WG4 - RBAC hardening:

- Workflow designer permissions.
- Task permissions.
- Audit permissions.
- Project/admin permissions.

### Track WT - Templates

Mục tiêu: giảm time-to-value, dễ demo/bán.

WT1 - Core template format:

- Template = form schemas + workflow + roles + sample data + setup checklist.
- Import template into project.

WT2 - First templates:

- Purchase request.
- Payment request.
- Expense approval.
- Leave/overtime approval.
- Vendor onboarding.

WT3 - Vertical template packs:

- Manufacturing/quality pack.
- Retail/branch operations pack.
- Finance/admin pack.
- Education/service pack.

### Track WI - Integrations

Mục tiêu: workflow kết nối hệ thống thật.

WI1 - Email + webhook:

- Email notification.
- Webhook on event.
- Webhook trigger to start workflow.

WI2 - REST connector:

- Call external API on transition.
- Store response.
- Retry/failure state.

WI3 - Business connectors:

- Google Sheets/Excel.
- Slack/Teams/Zalo OA.
- ERP/CRM/accounting theo pilot.

### Track AI - AI-assisted setup

Mục tiêu: tăng tốc authoring, không đánh đổi safety.

AI1 - Explain and validate:

- AI giải thích workflow.
- AI chỉ ra lỗi/rủi ro.
- AI đề xuất missing reject path, missing role, missing SLA.

AI2 - Generate/refine templates:

- Từ SOP/document tạo form + workflow.
- Diff preview.
- Human approve.
- Zod + graph validation.

AI3 - Optimize from data:

- AI đọc analytics.
- Gợi ý bottleneck.
- Gợi ý SLA/assignment/template improvements.

Nguyên tắc: AI không được bypass validation, permission, audit và human review.

## 8. Thứ tự ưu tiên khuyến nghị

### Giai đoạn 1 - Chốt các blocker thật sự

Mục tiêu: không publish nhầm schema/graph lỗi rõ ràng, không làm submission/workflow cũ bị ảnh
hưởng khi form đổi, không để quyền/audit bị mơ hồ.

Việc cần làm:

- Form versioning tối thiểu: draft/publish/version snapshot.
- Server-side submission validation plan: dùng `form-core`, không tin client.
- Form validation/lint tối thiểu: duplicate/empty names, dangling references, hidden-required,
  dangling preset link.
- RBAC policy rõ: ai được sửa schema, ai được sửa permission, admin override audit thế nào.
- Preset lifecycle decision: delete/deprecate/unlink/frozen snapshot.
- Verify undo/redo/save/import/AI-apply không làm hỏng form/workflow state.

Không nên:

- Làm nhiều view mode đẹp trước khi runtime có dữ liệu.
- Làm MiniMap/edge style/layout polish nếu chưa xong version/submission/audit/RBAC blockers.
- Làm WE2 inline explorer nếu đang cạnh tranh trực tiếp với form version/submission blockers.
- Làm connector rộng.
- Làm analytics phức tạp.

### Giai đoạn 2 - Form submission MVP

Mục tiêu: form không chỉ thiết kế được mà còn submit/lưu/xem lại được.

Việc cần làm:

- Draft/publish form version tối thiểu.
- Submit endpoint.
- Server-side validation bằng `form-core`.
- Store submission payload.
- Submission list/detail.
- Pin submission vào form version.
- Basic audit: submitted/updated/exported.

Use case mẫu:

- Payment request form.
- Leave request form.
- Purchase request form.

### Giai đoạn 3 - Workflow Runtime MVP

Mục tiêu: chạy được một quy trình thật end-to-end.

Use case mẫu nên chọn:

- Purchase request.
- Payment request.
- Leave approval.

MVP flow:

1. User submit form.
2. Workflow instance created.
3. Manager thấy task trong inbox.
4. Manager approve/reject.
5. Instance chuyển state.
6. History/audit xem được.

### Giai đoạn 4 - Governance tối thiểu

Mục tiêu: an toàn hơn cho production pilot.

Việc cần làm:

- Draft/publish.
- Version pinning.
- Audit trail.
- RBAC task/design.

### Giai đoạn 5 - Template + pilot

Mục tiêu: có câu chuyện bán hàng rõ.

Việc cần làm:

- 3-5 template chất lượng.
- Demo theo ngành/use case.
- Pilot với 1-3 khách hoặc team nội bộ tương tự khách thật.

### Giai đoạn 6 - Integration/analytics/AI nâng cao

Mục tiêu: mở rộng sau khi có usage.

Việc cần làm:

- Email/webhook/REST.
- Dashboard.
- AI explain/validate/optimize.
- More templates.

## 9. ICP và ngành nên ưu tiên

### ICP đề xuất

Tổ chức phù hợp nhất:

- 50-500 nhân sự.
- Có 3+ phòng ban.
- Có nhiều phê duyệt nội bộ.
- Có dữ liệu/chứng từ đi kèm quy trình.
- Đang dùng nhiều công cụ rời rạc.
- Có người chịu trách nhiệm process.
- Có budget cho SaaS/self-host nhẹ.

Người mua/người ảnh hưởng:

- Operations Manager.
- Finance Controller/Kế toán trưởng.
- Procurement Manager.
- HR/Admin Manager.
- Internal IT.
- Business Analyst.
- Chủ doanh nghiệp SME/mid-market.

Người dùng cuối:

- Requester.
- Approver.
- Reviewer.
- Admin/process owner.
- Auditor/manager.

### Ngành nên ưu tiên trước

#### Manufacturing / Trading / Logistics

Lý do:

- Nhiều quy trình mua hàng, thanh toán, QC, incident, vendor, inventory.
- Nhiều chứng từ.
- ROI dễ nói bằng giảm thời gian xử lý, giảm lỗi, giảm thất lạc chứng từ.
- Nhiều doanh nghiệp mid-market ở Việt Nam/ASEAN đang chuyển đổi số nhưng chưa muốn mua BPM enterprise.

Use case:

- Purchase request.
- Payment request.
- Vendor onboarding.
- Non-conformance/CAPA light.
- Delivery incident.
- Inventory adjustment approval.

#### Retail / Service Chains

Lý do:

- Nhiều chi nhánh.
- Nhiều request lặp lại.
- Cần chuẩn hóa vận hành.
- Cần manager duyệt nhanh.

Use case:

- Store issue report.
- Branch expense approval.
- Promotion approval.
- Asset repair request.
- New employee onboarding.

#### Finance/Admin/Procurement across industries

Lý do:

- Đây là horizontal wedge dễ bán.
- Quy trình rõ, ít phụ thuộc ngành.
- Có người chịu trách nhiệm.
- Có pain từ email/Excel/chat.

Use case:

- Expense claim.
- Payment request.
- Contract review.
- Purchase order approval.
- Budget approval.

#### Education / Training / Professional Services

Lý do:

- Nhiều form/request/onboarding.
- Không quá regulated như bank/healthcare.
- Dễ pilot.

Use case:

- Student/service request.
- Enrollment workflow.
- Client onboarding.
- Document review.
- Internal approval.

### Ngành nên để sau

#### Banking / Insurance / Fintech

Hấp dẫn vì nhiều workflow và compliance, nhưng:

- Sales cycle dài.
- Security/procurement nặng.
- Cần SSO, audit, data residency, integration, legal.
- Cạnh tranh với enterprise platforms.

Chỉ nên vào sau khi governance/runtime/audit rất mạnh hoặc có pilot cụ thể.

#### Healthcare / Pharma

Hấp dẫn vì nhiều form và audit, nhưng:

- Dữ liệu nhạy cảm.
- Compliance cao.
- Cần kiểm soát access, retention, e-signature, audit rất nghiêm.

Nên để sau.

#### Government / Public sector

Hấp dẫn nhưng:

- Procurement phức tạp.
- Yêu cầu compliance, hosting, security cao.
- Sales cycle dài.

Nên để sau hoặc qua partner.

## 10. Tính năng đề xuất theo mức cần thiết

### 10.1 Form publish checklist - Must-have

Trước khi publish form:

- Field names hợp lệ và unique.
- Required fields rõ.
- Logic references còn tồn tại.
- Hidden-required conflict được cảnh báo.
- Reactions không có cycle rõ ràng.
- Remote dataSource/asyncValidator test pass hoặc có warning.
- Permissions được review.
- Sample submit pass.

Đây là must-have vì nó ngăn publish schema lỗi. Có thể làm UI đơn giản, không cần đẹp.

### 10.2 Role preview cho form - Should-have

Builder nên có switcher:

- Preview as requester.
- Preview as manager.
- Preview as finance.
- Preview as admin.

Mục tiêu: tác giả form thấy ngay field nào bị ẩn/read-only/editable theo role. Điều này giúp
field-level permissions trở thành tính năng thật, không chỉ là JSON trong schema.

### 10.3 Submission table/detail - Must-have cho form runtime

Form-builder sẽ dễ được xem là product hoàn chỉnh hơn nếu mỗi form có:

- Submissions tab.
- Table view.
- Detail view.
- Filter/search.
- Export.
- Link sang workflow instance nếu form kích hoạt workflow.

Đây là cầu nối giữa "tạo form" và "dùng form trong vận hành".

### 10.4 Form version history - Must-have

Nên có UI xem:

- Draft hiện tại.
- Published versions.
- Ai publish.
- Publish note.
- Diff giữa versions.
- Rollback/clone version.

Không cần quá phức tạp ban đầu, nhưng phải có khái niệm immutable published snapshot.

### 10.5 Logic/debug inspector - Should-have

Cho selected field, hiển thị:

- Field này visible vì rule nào.
- Field này bị disabled vì reaction nào.
- Field này required do static flag hay reaction.
- Field này phụ thuộc field nào.
- Field nào phụ thuộc nó.

Đây là tính năng rất hữu ích khi form có conditional logic/reactions.

### 10.6 Task inbox - Must-have cho workflow runtime

Đây nên là màn hình sản phẩm chính cho người dùng cuối.

Tính năng:

- My tasks.
- Team tasks.
- Overdue tasks.
- Task detail.
- One-click approve/reject.
- Comment/reason.
- Attach files.
- View workflow context.
- View submitted form data.

Giá trị:

- Biến workflow thành công việc hằng ngày.
- Dễ demo.
- Dễ thuyết phục buyer.

### 10.7 Instance timeline - Should-have

Mỗi case nên có timeline dễ đọc:

- Submitted.
- Assigned.
- Reviewed.
- Approved/rejected.
- Escalated.
- Completed.

Timeline giúp requester, approver và manager hiểu trạng thái mà không cần nhìn graph.

### 10.8 Validation issue mapping - Must-have trước publish

Editor cần đưa user đến lỗi hoặc chỉ rõ lỗi theo `ref`:

- Missing start.
- Unreachable node.
- Dangling transition.
- Missing bound form.
- Missing role/assignee.
- No outgoing transition from non-end node.
- No reject path where required.

Tính năng này có impact cao vì giảm lỗi trước khi publish.

### 10.9 Workflow publish checklist - Must-have

Trước khi publish workflow:

- Graph valid.
- All required forms exist.
- Roles/assignees configured.
- Reject paths configured.
- Start/end nodes clear.
- SLA optional warning.
- Test run/simulation pass.

Đây là cách đơn giản để tăng trust.

### 10.10 Workflow simulation/test run - Should-have

Cho process owner chạy thử workflow bằng sample data:

- Chọn action.
- Xem guard nào pass/fail.
- Xem role nào được phép.
- Xem next state.
- Debug missing path.

Simulation rất hữu ích trước khi publish.

### 10.11 Template import wizard - Should-have

Thay vì canvas trống:

- Chọn template.
- Chọn roles.
- Chọn forms.
- Customize labels.
- Publish draft.

Đây là onboarding tốt hơn cho business users.

### 10.12 SLA and escalation - Should-have, Must-have cho approval có hạn xử lý

Tính năng:

- Due date per task.
- Reminder.
- Escalation.
- Overdue badge.
- SLA dashboard.

Nên bắt đầu đơn giản, tránh rule engine quá phức tạp sớm.

### 10.13 Comments and attachments - Should-have, thường thành Must-have ở quy trình chứng từ

Không workflow approval nào thực tế thiếu context.

Nên có:

- Comment per task/instance.
- Attachment.
- Mention optional.
- Internal note vs public note optional.

### 10.14 Audit export - Must-have cho regulated/compliance, Should-have cho SME pilot

Cho manager/auditor export:

- Instance history.
- Approval trail.
- Data changes.
- Actor/timestamp.

Format:

- CSV.
- JSON.
- PDF later.

### 10.15 AI form/workflow reviewer - Nice-to-have sau validation deterministic

AI có thể rất hữu ích nếu dùng để review:

- "Form này có field required đang bị hidden trong một số case."
- "Field này có permission editRoles nhưng không có viewRoles tương ứng."
- "Remote dataSource này chưa được test."
- "Workflow này thiếu reject path."
- "Node Finance Approval không có assignee."
- "Guard này dùng field không tồn tại trong form."
- "Có path không bao giờ tới được."
- "Status naming không nhất quán."

Đây an toàn hơn AI tự chạy production logic.

## 11. Những gì không nên làm quá sớm

### Không nên làm full BPMN ngay

BPMN mạnh nhưng phức tạp. Source hiện tại đang có state/transition model riêng, đơn giản hơn,
phù hợp với form approval workflows. Chỉ nên cân nhắc BPMN export/import sau khi có nhu cầu thật.

### Không nên làm quá nhiều connector trước ICP

Connector rộng dễ tốn công bảo trì. Nên làm webhook/REST/email trước, rồi connector theo pilot.

### Không nên làm AI autonomous execution sớm

AI nên generate/review/explain trước. Cho AI tự approve/chạy action production quá sớm sẽ tạo rủi
ro trust, audit và compliance.

### Không nên nhắm enterprise regulated lớn ngay

Nếu chưa có audit/versioning/security mạnh, vào enterprise sớm sẽ bị kéo roadmap theo checklist
compliance rất nặng.

### Không nên biến workflow editor thành design tool quá phức tạp

View mode đẹp có giá trị, nhưng business value nằm ở runtime, task, audit, template, integration.

### Không nên thêm quá nhiều field type trước lifecycle

Form-builder đã có nhiều field và container. Thêm field mới có thể tạo cảm giác tiến triển nhanh,
nhưng production value lớn hơn nằm ở publish/version, submission, permissions, audit và templates.
Chỉ thêm field khi use case/pilot thật cần.

### Không nên để hosted mode gọi remote URL tùy ý lâu dài

Raw `dataSource.url` và `asyncValidator.url` tiện cho prototype/self-host, nhưng nếu host hộ khách
thì cần allowlist/proxy/connection registry/secret store. Nếu không, rủi ro security và debugging
sẽ tăng nhanh.

### Không nên ưu tiên native renderer trước web runtime

Repo có hướng multi-renderer, nhưng web-first nên hoàn tất form submission/runtime/governance trước.
Native renderer chỉ nên kéo lên khi có khách/use case mobile thật.

## 12. Discovery cần làm để tăng độ chắc chắn

Trước khi đầu tư lớn vào runtime/governance, nên phỏng vấn 10-15 người:

- 3 finance/admin/procurement managers.
- 3 operations managers.
- 2 internal IT/business analysts.
- 2-3 owner/COO SME 50-300 nhân sự.
- 2 users thường xuyên submit/approve request.

Câu hỏi:

1. Hiện quy trình nào đang dùng Excel/email/chat/form rời rạc?
2. Quy trình đó xảy ra bao nhiêu lần mỗi tháng?
3. Ai submit, ai approve, ai theo dõi?
4. Mất bao lâu từ submit đến hoàn tất?
5. Lỗi thường gặp là gì?
6. Có cần chứng từ/audit/history không?
7. Khi cần xem lại 3 tháng trước thì mất bao lâu?
8. Nếu quá hạn thì ai nhắc?
9. Họ đang trả tiền cho tool nào?
10. Ai có quyền mua/duyệt mua giải pháp?
11. Họ có cần self-host/data residency không?
12. Họ có cần tích hợp ERP/accounting/CRM không?
13. Nếu có template sẵn cho quy trình này thì có dùng không?
14. Mức giá nào khiến họ cân nhắc?
15. Tính năng nào là deal-breaker?

Tín hiệu nên tiếp tục:

- Có quy trình lặp > 50 lần/tháng.
- Có ít nhất 2 cấp duyệt.
- Có chứng từ hoặc dữ liệu cần lưu.
- Có pain rõ vì thất lạc/chậm/lỗi.
- Có người chịu trách nhiệm process.
- Có ngân sách hoặc đã trả tiền cho tool liên quan.

Tín hiệu nên tránh:

- Quy trình rất ít xảy ra.
- Chỉ một người xử lý.
- Không cần audit/history.
- Họ hài lòng với Google Form/Sheet.
- Không có người sở hữu quy trình.
- Không có khả năng trả tiền.

## 13. Nguồn tham khảo và cách đọc

Các nguồn dưới đây được dùng để kiểm tra hướng thị trường và feature baseline. Không nên xem mọi
số forecast như sự thật tuyệt đối vì nhiều report thương mại có bias; nên dùng chúng như tín hiệu
định hướng.

- Gartner low-code forecast: low-code tăng do business technologists, hyperautomation và nhu cầu
  workflow tùy biến.
  <https://www.gartner.com/en/newsroom/press-releases/2022-12-13-gartner-forecasts-worldwide-low-code-development-technologies-market-to-grow-20-percent-in-2023>
- Salesforce ASEAN SMB Trends 2025: SMB ASEAN tăng đầu tư digital tools/AI, nhưng gặp vấn đề data
  inconsistency và integration.
  <https://www.salesforce.com/ap/blog/2025-smb-trends/>
- MPI Vietnam digital transformation: Việt Nam có chương trình hỗ trợ SME chuyển đổi số, nhấn mạnh
  digitization/digitalization.
  <https://www.mpi.gov.vn/en/Pages/2024-10-11/Digital-transformation-in-businesses-for-a-sustainegpc5n.aspx>
- Camunda platform: production workflow/orchestration nhấn mạnh BPMN/DMN, tasklist, RBAC, audit,
  versioned rollout, analytics.
  <https://camunda.com/platform/>
- Camunda docs: orchestration cho people/systems/AI, audit trail, long-running workflow.
  <https://docs.camunda.io/docs/8.8/components/concepts/concepts-overview/>
- formsflow.ai docs: form builder + identity/RBAC + workflow engine + analytics + auditability.
  <https://aot-technologies.github.io/forms-flow-ai-doc/>
- React Flow MiniMap docs: chỉ dùng làm tham khảo UX phụ cho graph lớn, **không** phải căn cứ
  cho production necessity.
  <https://reactflow.dev/api-reference/components/minimap>

## 14. Quyết định đề xuất

### Quyết định 1: Giữ `workflow-editor-v2` làm editor UX track

Không nên bỏ plan hiện tại. Nó đúng và đang gần với source. Nhưng cần cập nhật trạng thái sau
verify, vì working tree đã có nhiều phần WE1.

### Quyết định 2: Tạo thêm production roadmap track cho toàn platform

Nên tạo thêm roadmap sau:

- FB: Form Builder Completion.
- FS: Form Submission Runtime.
- WE: Workflow Editor UX.
- WR: Workflow Runtime.
- WG: Workflow Governance.
- WT: Workflow Templates.
- WI: Workflow Integrations.
- AI: AI-assisted workflow authoring/review.

Trong thứ tự ưu tiên, `FB` và `FS` nên đi trước hoặc song song rất sớm với `WR`, vì workflow
runtime cần form submissions làm dữ liệu đầu vào. Nếu chưa có form publish/submission, workflow
runtime sẽ thiếu đối tượng nghiệp vụ thật để vận hành.

### Quyết định 3: ICP đầu tiên

Ưu tiên:

- SME/mid-market 50-500 nhân sự.
- Manufacturing/trading/logistics/retail/service.
- Finance/admin/procurement use cases.

Không ưu tiên ngay:

- Enterprise banking/healthcare/government, trừ khi có pilot rất cụ thể và chấp nhận build
  compliance/security theo họ.

### Quyết định 4: AI là accelerator, không phải foundation

AI generate/refine form/workflow đã là lợi thế tốt của repo, nhưng production moat vẫn là:

- valid contract,
- no-eval,
- publish/version lifecycle,
- submission storage,
- runtime,
- task,
- audit,
- governance,
- template,
- integration.

AI nên giúp dựng nhanh, review nhanh, explain nhanh; không nên bypass quy trình kiểm soát.

## 15. Kết luận cuối

Sau khi đối chiếu source, plan hiện tại, roadmap AI-native và các nguồn thị trường, hướng đáng
theo nhất là:

**Form + Submission + Workflow + Task + Audit platform cho quy trình nội bộ nhiều phê duyệt,
nhắm SME/mid-market trước, có AI hỗ trợ dựng và review nhưng production core vẫn là
schema-valid runtime + governance.**

`workflow-editor-v2` là bước đúng, nhưng chỉ là lớp design. Form-builder cũng đang ở trạng thái
tương tự: authoring khá mạnh, nhưng production lifecycle chưa khép kín. Để ra production/thị trường,
bước tiếp theo không nên chỉ là workflow runtime; nên đi theo chuỗi:

1. Hoàn thiện form-builder quality gates.
2. Thêm form draft/publish/version + submission storage.
3. Gắn submission vào workflow instance/task inbox.
4. Thêm audit/RBAC/versioning governance.
5. Đóng gói template cho một vài use case có ROI rõ.
