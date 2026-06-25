# Workflow Editor v2 — production-grade UX track

> Mục tiêu: nâng workflow editor từ **prototype tốt** lên **chín cho production**.
> Nguồn gốc: owner review 2026-06-24 (4 nhận xét UI/UX + mở rộng) + ảnh "4 hướng thiết kế"
> (Codex) + khảo sát best-practice react-flow. Phân tích đầy đủ trong lịch sử chat session
> mở track này. Đây là **nguồn sự thật**; tick `[x]` theo tiến độ, cập nhật sau MỖI phase.

Branch: `feat/workflow-editor-v2` (off main `001be3d`). Nhánh trước đó của workflow track:
WF0→WF2 đã merge vào main. Track này là **WF editor-UX v2** (đứng sau WF2, trước WF3 runtime).

## Nguyên tắc (bất di bất dịch)
- Tách lớp giữ nguyên: contract `@org/workflow-schema` ⟂ engine `@org/workflow-core` ⟂
  editor (xyflow). `position` là dữ liệu trình bày DUY NHẤT lọt vào contract; xyflow runtime
  fields ở lại ranh giới `apps/builder/src/workflow/workflow-model.ts` (`toFlow`/`fromFlow`).
- **Additive-only**: field mới = optional ⇒ KHÔNG bump `workflowVersion` (theo tiền lệ
  i18n/linked-field); thay vào đó viết **parse-compat test** (định nghĩa cũ vẫn load). Chỉ bump
  + migration khi đổi/ xoá shape cũ.
- **Tái dùng, không viết lại**: history primitive `apps/builder/src/engine/history.ts`
  (`History<T>` value-generic) dùng lại nguyên cho undo/redo workflow. `HistoryPanel` +
  `useEditorShortcuts` của form-builder là khuôn để soi.
- Logic thuần tách khỏi React (như `floating-edge.ts` getEdgeParams, `layout.ts` tidyLayout) →
  unit-test không cần DOM. Fetch chỉ trong `client.ts`; data qua react-query.
- DoD mỗi phase: `pnpm typecheck` + test xanh + `pnpm biome check` sạch + changeset cho mọi
  package đổi (apps private ⇒ không cần) + **reviewer subagent PASS** + **live smoke** qua MCP
  browser (before/after). Tự verify trước khi báo done.

## Bản đồ file hiện tại (đọc trước khi sửa)
- Contract: `packages/workflow-schema/src/schema.ts` (node: id/status/formId/position;
  transition: id/from/to/action/guard/role; có sẵn instance+history schema cho WF3).
- Engine: `packages/workflow-core/src/graph.ts` (`validateGraph` → GraphError có `ref`),
  `engine.ts` (advance instance).
- Editor: `apps/builder/src/workflow/WorkflowEditor.tsx` (xyflow, custom node, NodePanel/EdgePanel,
  inline form Drawer), `floating-edge.tsx` (bezier — đổi sang smoothstep), `layout.ts` (dagre LR),
  `workflow-model.ts` (toFlow/fromFlow boundary), `WorkflowRoute.tsx`, `useWorkflows.ts`,
  `newWorkflow.ts`, `client.ts`.
- Explorer/quản lý: `apps/builder/src/workspace/ExplorerRail.tsx` (tạo/rename qua Modal `ask` —
  sẽ đổi inline), `ProjectWorkspace.tsx`.
- Reuse: `apps/builder/src/engine/history.ts`, `apps/builder/src/editor/{useFormEditor,useEditorShortcuts}.ts`,
  `apps/builder/src/workbench/HistoryPanel.tsx`.

---

## Phases (mỗi phase = 1 session, /clear giữa các phase)

### ★ WE1 — Editor-UX v2 cốt lõi (KHÔNG đụng contract)  ✅ DONE (reviewer PASS + live smoke PASS)
Gộp nhận xét clutter + undo/redo + highlight path + **validation issue mapping** (kéo sớm từ WE5).
Mức ưu tiên đã chắt lọc lại theo review production (codex) + research (xem §Cơ sở research):
**undo/redo + validation mapping = must-have (authoring safety); clutter/MiniMap = nice-to-have polish.**

- [x] **Undo/redo** (must-have): `History<{meta,nodes,edges}>` snapshot (gồm position) tái dùng
  `engine/history.ts` + `workflow-model.snapshot()` (chuẩn hoá, bỏ field volatile selected/dragging).
  Nút Undo/Redo trên toolbar + phím tắt Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y (suppress khi đang gõ input).
  Coalesce: drag = 1 step (commit on drag-end), edit cùng node = 1 step (tag `node:id`), cascade
  delete (node+edge) gộp 1 step qua `scheduleCommit` rAF. Khớp best-practice React Flow undo/redo
  (snapshot-based, KHÔNG tạo entry mỗi pixel drag).
- [x] **Validation issue mapping** (must-have, kéo từ WE5): `validateGraph(currentDef)` chạy LIVE →
  ring đỏ node/edge lỗi (theo `GraphError.ref`) + panel "N vấn đề" bấm-để-focus (`fitView({nodes}`).
  Nút Validate hiện số lỗi + danger. Dùng CHÍNH validation của engine (1 nguồn sự thật). Đây là
  production pattern (highlight node + errors list trước publish — HighLevel/Jitterbit/VS Designer).
- [x] **Highlight path**: click node → `traceUpstream(targetId, edges)` (pure, cycle-safe, đệ quy về
  start) → tô đậm node+edge trên đường đi, làm mờ phần còn lại; click pane/edge bỏ highlight.
- [x] **Clutter** (nice-to-have polish): `floating-edge` `getBezierPath` → `getSmoothStepPath`
  (orthogonal, đọc rõ); `layout.ts` nới spacing (nodesep 72 / ranksep 140); **auto-tidy on-load**
  CHỈ khi MỌI node thiếu position (graph mới/AI — không đè layout người dùng đã lưu); cap node
  maxWidth 220 + ellipsis label; `<MiniMap pannable zoomable/>`.
- [x] **Perf** (research): memo custom node `WorkflowNodeView` bằng `React.memo`; `nodeTypes`/
  `edgeTypes` để ngoài component (sẵn có); handler dùng `useCallback`/`useMemo` (theo React Flow
  performance docs).
- Files đã sửa: `floating-edge.tsx`, `layout.ts`, `WorkflowEditor.tsx`, `workflow-model.ts`
  (+`snapshot`/`WorkflowSnapshot`); new `path.ts` (pure trace) + `path.test.ts`.
- ✅ **Quyết định auto-tidy on-load — owner CHỐT (2026-06-24): GIỮ là hành vi MONG MUỐN.** Workflow
  thiếu position → tidy → `dirty` → Save lần đầu persist layout. Smoke xác nhận: workflow ĐÃ có
  position mở KHÔNG dirty (auto-tidy chỉ chạy khi MỌI node thiếu position). Không sửa code.
- [x] **Còn lại của phase — XONG**: reviewer subagent PASS (no golden-rule blocker) + live smoke MCP
  PASS trên wf "3-Level Leave Approval". Đã verify trên browser: render (smoothstep + MiniMap +
  spacing + cap width) · highlight-path (click node → đường upstream sáng, phần còn lại mờ) ·
  validation LIVE (valid → ring đỏ + "Validate (N)" + IssuesPanel "N vấn đề" + bấm issue→focus node) ·
  add/rename/delete state · undo/redo (gồm phím Ctrl+Shift+Z; dirty-tracking re-clear về baseline) ·
  Tidy re-layout · set-start (live re-validate) · Save persist → reload mở sạch (không dirty).
  Bỏ qua theo thoả thuận owner: AI-apply (cần LLM key). connect/move bằng kéo-thả: cơ chế commit
  giống add/delete/redo đã chứng minh; keyboard Delete không kích hoạt qua MCP synthetic-click
  (artifact: click set panel-selection nhưng KHÔNG set react-flow `selected` mà delete-key handler
  đọc) — nút "Delete state" chạy đúng; wiring deleteKeyCode/onNodesDelete/onBeforeDelete đầy đủ
  (WorkflowEditor.tsx:735-737, 491-505) ⇒ nên xác nhận tay 1 lần bằng chuột thật.
- Acceptance: graph 3-cấp approval đọc rõ; undo/redo đúng trên add/del/rename/move/connect; click
  node sáng đúng đường từ start; node/edge lỗi ring đỏ + bấm issue nhảy tới đúng chỗ.

### WE2 — Inline create/rename ở Explorer (KHÔNG đụng contract)  ✅ DONE (reviewer PASS + live smoke PASS)
- [x] Bỏ `Modal` prompt cho New form/workflow/folder + Rename; thay bằng **tạo item "Untitled"
  inline trong cây + rename tại chỗ** (Enter commit / Esc huỷ / blur commit), kiểu VS Code. Giữ
  delete = confirm modal (đúng cho hành động phá huỷ).
- [x] Helper thuần tách vào `tree.ts`: `insertDraft` (chèn node nháp `__draft__` đúng vị trí, không
  mutate) + `allFolderKeys` (seed expanded set, đệ quy). Có test (gồm test non-mutation).
- [x] `expandedKeys` controlled (`null` = default expand-all): inline-create bên trong folder tự
  bung folder cha qua `ensureExpanded`. Esc→blur race xử lý bằng `skipBlur` ref (Esc huỷ, không
  để blur commit nhầm). Rename: input điền sẵn tên cũ + select-all on focus.
- Files đã sửa: `ExplorerRail.tsx` (inline edit state máy thay `ask`/Modal prompt; `kindIcon` tách),
  `tree.ts` (+`insertDraft`/`allFolderKeys`), `tree.test.ts` (+6 test).
- Acceptance ✅: tạo folder/form/workflow inline không bật modal nào; rename tại chỗ; Esc huỷ sạch;
  delete vẫn confirm modal. Live smoke MCP PASS: create folder (persist) · Esc-cancel · rename
  folder (persist) · create form (mở editor) · delete form + folder (confirm modal). typecheck
  22/22 · tree.test 14/14 · biome sạch (3 file). ⚠️ Lưu ý ngoài phạm vi: `App.characterization.test.tsx`
  fail 1 test (`provideSave...theme write`) — **pre-existing trên branch** (đã chứng minh fail y hệt
  khi stash thay đổi WE2); cần xử lý riêng, không phải regression WE2.

### WE3 — Quản lý đa-form theo workflow (KHÔNG đụng contract)  ✅ DONE (reviewer PASS + live smoke PASS)
- [x] Góc nhìn workflow-scoped: từ `nodes[].formId` suy ra danh sách "Form dùng trong workflow",
  hiển thị + sửa nhanh (mở Drawer builder đã có). Quan hệ node→formId đã có ⇒ thuần
  presentation/aggregation. (Bỏ qua badge cây Explorer — overview panel đủ; thêm sau nếu cần.)
- [x] Pure helper `usedForms(nodes, options)` ở `used-forms.ts` (KHÔNG import React/xyflow): nhóm
  state theo formId (thứ tự first-appearance), resolve title + cờ `missing` từ form list dự án, và
  liệt kê `unbound` (state chưa gắn form). +5 unit test.
- [x] UI: nút toolbar **"Forms (N)"** mở Drawer `UsedFormsPanel` — mỗi form: title (hoặc id +
  tag "đã xoá" nếu bị xoá khỏi dự án), tag số state, các state bấm-để-focus (`focusRef` + đóng
  drawer), nút "Sửa form" (disabled khi missing/no-project) mở Drawer builder sẵn có. Section
  "N state chưa gắn form" liệt kê các state thiếu form. Đếm cập nhật LIVE theo binding.
- Files đã sửa: `WorkflowEditor.tsx` (formsView memo + nút + Drawer + `UsedFormsPanel`); new
  `used-forms.ts` + `used-forms.test.ts`.
- Acceptance ✅: mở 1 workflow thấy ngay nó gồm form nào + state nào chưa gắn; bấm state nhảy tới
  node; "Sửa form" mở builder. Live smoke MCP PASS (xem §Trạng thái).

### WE4 — Status catalog (ĐỤNG CONTRACT, additive)  ✅ DONE (reviewer PASS + live smoke PASS)
**Thiết kế đã KHÓA** (sau phân tích sâu + tra cứu Jira status-category / workflowbuilder.io +
đối chiếu tiền lệ repo W3 preset + W4 linked-field). Build scope owner chọn = **Full** (contract +
API + builder UI).
- **Mô hình 2 tầng (chuẩn ngành — Jira: 3 category cứng + status custom vô hạn):**
  - `kind` = enum **CỐ ĐỊNH** mà ENGINE reasoning được: **START / NORMAL / END** (3 loại). Drive
    validation + màu mặc định. KHÔNG cho user tự chế kind. *(OPTIONAL bỏ — "bước tùy chọn/bỏ qua"
    là chuyện ROUTING, mô hình bằng transition-bypass + guard hôm nay; khi WF3 runtime có "skip"
    thật thì thêm `optional?: boolean` additive — không nhét vào status.)*
  - `statusCode` + catalog entry = tầng **CUSTOM không giới hạn**: user tạo bao nhiêu status tùy ý,
    mỗi cái có `label` + `color?` riêng + map về 1 `kind`.
- **Lưu trữ = project-scoped master data + optional global** (y hệt W3 preset): catalog ngoài
  contract, decoupled khỏi `CURRENT_WORKFLOW_VERSION`; project entry lưu dưới project owner ⇒ shared
  cho mọi collaborator; `list(user, projectId)` = `globals ∪ project`. Có `promote` project→global.
- **Màu:** mặc định theo `kind`; catalog entry có `color?` **custom override** (lưu trong master data,
  NGOÀI contract). Renderer resolve: catalog.color → kind-default → neutral.
- **Node ref (additive vào contract, theo W4):** `workflowNodeSchema` thêm optional `statusCode`
  (ref) + optional `kind` (snapshot category để màu sống sót khi catalog bị xoá); GIỮ `status` làm
  label snapshot. Catalog là nguồn sự thật khi resolve được; node tự giữ `kind`/`status` làm frozen
  fallback. **KHÔNG bump `CURRENT_WORKFLOW_VERSION`** → parse-compat test thay migration.
- **Files (3 lớp):**
  - Contract: `workflow-schema/src/status-catalog.ts` (mới: `StatusKind`,
    `statusCatalogEntrySchema`, `parseStatusCatalogEntry`, scope global/project như preset),
    `schema.ts` (+`kind?`/`statusCode?` optional vào node), `index.ts` (export), `schema.test.ts`
    (parse-compat) + `status-catalog.test.ts`. **+changeset** (package published).
  - API: prisma model `StatusCatalogEntry` (mirror `Preset`) + migration; `persistence/repositories/
    status-catalog.repo.ts` (abstract) + `persistence/prisma/prisma-status-catalog.repo.ts`; wire
    `persistence.module.ts`; `modules/status-catalog/` (controller/service/module mirror presets) +
    wire `app.module.ts`; service test (scope/owner gating).
  - Builder: `client.ts` endpoints + react-query `useStatusCatalog` (+ mutations, fetch chỉ ở
    client.ts); **pure resolver** `resolveStatusStyle(node, catalog)` (test không DOM) → màu/label;
    NodePanel status picker (set statusCode + denorm kind/label snapshot); node tô màu theo resolve;
    catalog manager UI (CRUD drawer, kiểu UsedFormsPanel).
- Acceptance: định nghĩa cũ KHÔNG có `kind`/`statusCode` vẫn load; node tô màu theo kind/catalog;
  chọn status từ master project-shared; xoá catalog entry → node fallback snapshot (không vỡ); live
  smoke MCP. DoD: typecheck + test + biome + changeset + reviewer PASS + live smoke.
- ✅ **ĐÃ LÀM:** Contract `status-catalog.ts` (`StatusKind` start/normal/end + `statusCatalogEntrySchema`
  scope global/project như preset; decoupled khỏi version) + node `kind?`/`statusCode?` optional;
  parse-compat test (cũ vẫn load, kind lạ bị reject) + `capabilities.ts` cập nhật; changeset
  `@org/workflow-schema` minor. API: prisma `StatusCatalogEntry` (mirror Preset, code=PK) + migration
  `20260625072716_status_catalog` + repo abstract/prisma + module status-catalog (controller/service,
  owner+scope gating qua ProjectsService, 409 cross-owner, promote) + 10 service test. Builder: client
  `/status-catalog` + `useStatusCatalog` + pure `resolveStatusStyle` (màu từ kind/catalog, KHÔNG vào
  contract) + 5 test; node tô `borderLeft` theo resolve + label resolved + tag "?" khi missing;
  NodePanel picker (denorm statusCode+kind+label snapshot) + ô "Loại (màu)" cho node ad-hoc; toolbar
  "Statuses (N)" + Drawer `StatusCatalogPanel` (CRUD + scope + màu custom + promote).
  **Round-trip:** `workflow-model` toFlow/fromFlow tải/ghi kind/statusCode; **sửa luôn dirty-giả**:
  `fromFlow` phải emit key đúng thứ tự schema (id,status,formId,position,kind,statusCode) vì
  `migrateWorkflow` (Zod parse) reorder → JSON.stringify khớp lại ⇒ reload SẠCH.
  Self-verify: typecheck (schema/api/builder) sạch · workflow-schema 20 test · api 83 test (status 10) ·
  builder workflow 32 test (resolve 5) · workflow-core/ai xanh · biome sạch file đổi · reviewer PASS ·
  live smoke MCP PASS (tạo status persist + count LIVE · picker đổi label/màu node · Save→reload
  round-trip qua contract · clean-on-load sau fix · xoá entry → node giữ snapshot + tag "?").

### (Sau) WE5 — View modes (4 hướng thiết kế) + keyboard-first
- ~~Validation tô đỏ node/edge lỗi~~ → **ĐÃ kéo sớm vào WE1** (validation issue mapping). Còn lại
  của WE5 nếu mở rộng `GraphError`: thêm code mới (missing-bound-form, no-outgoing-from-non-end,
  missing-role) ở `workflow-core/graph.ts` — UI WE1 tự nhặt theo `ref`, không cần sửa editor.
- Keyboard-first đầy đủ (điều hướng node bằng phím, thêm/xoá/đặt-start bằng phím).
- View modes (timeline-cột → kanban stage board → swimlane theo `transition.role` → tree; cần
  optional `stage` trên node, additive): **nice-to-have, HOÃN tới khi có runtime/task** — theo review
  production, view "đẹp" như kanban chỉ có giá trị vận hành khi đã có case/task thật để xếp, nếu
  không chỉ là trang trí. KHÔNG ưu tiên trước form-version/submission/runtime/audit.

---

## Giao thức resume (sau MỖI phase)
1. Tick `[x]` các mục đã xong trong file này + ghi commit hash.
2. Cập nhật memory `session-resume-workflow-editor-v2.md` (trạng thái + NEXT) + 1 dòng index MEMORY.md.
3. Commit (owner gate push/merge). Báo owner để `/clear` → session mới đọc memory + file này resume.

## Cơ sở research (để không quyết theo cảm tính)
Các thay đổi ưu tiên ở WE1 (kéo validation sớm; hạ clutter/MiniMap/view-modes xuống polish) dựa trên:
- **React Flow undo/redo** — snapshot-based, KHÔNG tạo history entry mỗi pixel drag, Ctrl+Z/Ctrl+Shift+Z.
  <https://reactflow.dev/examples/interaction/undo-redo>
- **React Flow performance** — memo custom node (`React.memo`), `nodeTypes`/`edgeTypes` ngoài component,
  `useCallback`/`useMemo` handler, tránh đọc cả mảng nodes ở component render nhiều, style đơn giản.
  <https://reactflow.dev/learn/advanced-use/performance>
- **Validation-before-publish pattern** (highlight node lỗi + errors panel bấm-để-focus): HighLevel
  <https://help.gohighlevel.com/support/solutions/articles/155000004872>, Jitterbit
  <https://docs.jitterbit.com/integration-studio/design/workflows/validity/>, MS Workflow Designer
  <https://learn.microsoft.com/en-us/visualstudio/workflow-designer/error-messages-in-workflow-designer>.
- **Định vị cạnh tranh** — Kissflow (no-code nhưng routing cơ bản) vs formsflow.ai/Camunda (mạnh nhưng
  developer-heavy). Wedge của ta: no-code + schema-valid + guard/role routing tốt ⇒ editor nên làm
  guard/role first-class + validated. <https://altaflow.com/kissflow-alternatives> · <https://formsflow.ai/>
- **MiniMap** chỉ là UX reference cho graph lớn, KHÔNG phải production necessity.
  <https://reactflow.dev/api-reference/components/minimap>

## Quan hệ với roadmap production rộng hơn
`docs/expansion/workflow-production-roadmap-review.md` (codex, đã review) chỉ ra: track WE này là lớp
**THIẾT KẾ** quy trình; sản phẩm production còn cần lớp **VẬN HÀNH** (form draft/publish/version,
submission storage + server-side validation, workflow runtime/instance + task inbox, audit, RBAC).
**Ngã ba chiến lược chưa chốt** (cần owner quyết, ngoài phạm vi WE): xây *infra AI-native embeddable*
(theo `ai-agent-native-roadmap.md`) HAY *app vận hành SME đứng-một-mình* (theo review codex) — hai
hướng build ra hai sản phẩm khác nhau. WE1→WE4 (authoring safety) đúng cho cả hai nên cứ làm tiếp.

## Trạng thái
- 2026-06-24: track mở, plan này tạo, branch `feat/workflow-editor-v2` off main `001be3d`.
  Owner duyệt làm cả WE1→WE4. ĐANG LÀM: WE1.
- 2026-06-24 (cập nhật): **WE1 code xong** (clutter + undo/redo + highlight + **validation issue
  mapping kéo sớm từ WE5** + `React.memo` perf). typecheck builder sạch, 22 test workflow xanh
  (gồm `path.test.ts` mới), biome lint sạch. CÒN: reviewer subagent + live smoke MCP → rồi commit.
  Ưu tiên đã chắt lọc lại theo review codex + research (xem §Cơ sở research).
- 2026-06-24 (đóng phase): **WE1 DONE.** Self-verify lại: `pnpm typecheck` 22/22 task xanh · 29 test
  workflow (8 file) xanh · biome chỉ còn diff CRLF (artifact working-tree, git lưu LF — bỏ qua).
  Reviewer subagent PASS (không vi phạm golden rule; `fromFlow` chỉ đọc id/position/data; editor xài
  `validateGraph` của engine). Live smoke MCP PASS (xem checklist mục WE1). Owner chốt giữ auto-tidy
  on-load. Commit WE1: `875c8f1` trên `feat/workflow-editor-v2` (owner gate push/merge).
  NEXT = WE2 (inline create/rename ở ExplorerRail) — /clear rồi vào session mới.
- 2026-06-25 (đóng phase): **WE2 DONE.** Inline create/rename kiểu VS Code thay Modal `ask` ở
  `ExplorerRail`; helper thuần `insertDraft`/`allFolderKeys` ở `tree.ts` (+test). Self-verify:
  typecheck 22/22 · tree.test 14/14 · biome sạch 3 file đổi. Reviewer subagent PASS (no golden-rule
  blocker; packages/ không đụng; delete vẫn confirm modal). Live smoke MCP PASS (create folder/form
  inline + persist, Esc-cancel, rename folder persist, create form mở editor, delete confirm modal).
  ⚠️ Full builder suite có **1 fail pre-existing** `App.characterization` (`provideSave...theme write`,
  fail y hệt khi stash WE2 ⇒ không phải regression); fail PropertyPanel.validation lần đầu là
  load-flaky (xanh khi chạy riêng). NEXT = WE3 (quản lý đa-form theo workflow) — /clear rồi session mới.
- 2026-06-25 (đóng phase): **WE3 DONE.** Pure `usedForms(nodes, options)` ở `used-forms.ts` (nhóm
  state theo formId + resolve title/missing + liệt kê unbound) + nút toolbar "Forms (N)" mở Drawer
  `UsedFormsPanel` (state bấm-để-focus, "Sửa form" mở builder Drawer). Self-verify: typecheck 22/22 ·
  27 test workflow (gồm 5 test `used-forms` mới) · biome sạch 3 file đổi (chỉ còn artifact CRLF của
  WorkflowEditor.tsx — git lưu LF). Reviewer subagent PASS (packages/ không đụng; `used-forms.ts`
  zero-import thuần; no `any`). Live smoke MCP PASS trên wf "3-Level Leave Approval": "Forms (N)"
  đếm đúng + cập nhật LIVE (1→2 khi bind form) · form bị xoá hiện tag "đã xoá" + "Sửa form" disabled ·
  section "N state chưa gắn form" (6→5) · bấm state → select+center node + đóng drawer · "Sửa form"
  form hợp lệ → mở builder Drawer ("Loaded ..."). Không lưu binding thử (transient). NEXT = WE4
  (status catalog, ĐỤNG CONTRACT additive — cần chốt scope project-shared trước khi code) — /clear.
- 2026-06-25 (đóng phase): **WE4 DONE — toàn bộ WE1→WE4 XONG.** Scope owner chốt: catalog
  project-scoped + optional global (như preset W3); kind cố định START/NORMAL/END (custom vô hạn qua
  catalog, mỗi entry map 1 kind — mô hình 2 tầng kiểu Jira); màu mặc-định-theo-kind + custom override
  (ngoài contract); node ref `statusCode`+`kind` snapshot (W4 fallback); "bước tùy chọn/bỏ qua" để cho
  routing/runtime, KHÔNG nhét vào status. Build Full xuyên 3 package (contract+API+builder) — chi tiết
  ở §WE4. Phát hiện+sửa dirty-giả-sau-reload do thứ tự key `fromFlow` lệch schema. Reviewer PASS +
  live smoke MCP PASS (create/persist/picker/round-trip/clean-on-load/missing-fallback). Commit WE4:
  `4797bd3` (owner gate push). NEXT đề xuất = WE5 (view modes + keyboard-first — nice-to-have, HOÃN tới
  khi có runtime/task) HOẶC chuyển sang track vận hành/AI-native (ngã ba chiến lược chưa chốt).
