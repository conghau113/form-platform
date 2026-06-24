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

### ★ WE1 — Editor-UX v2 cốt lõi (KHÔNG đụng contract)  ⏳
Gộp nhận xét clutter + undo/redo + highlight path (3 thứ nặng nhất, rẻ nhất, builder-only).
- [ ] **Clutter**: đổi `floating-edge` từ `getBezierPath` → `getSmoothStepPath` (gấp khúc, đọc rõ);
  nới `layout.ts` spacing (ranksep ~120-160, nodesep ~60-80); **auto-tidy on-load** khi node thiếu
  position (không đè position người dùng đã lưu); cap bề rộng node + ellipsis label chống tràn;
  thêm `<MiniMap/>`.
- [ ] **Undo/redo**: dùng `History<{meta,nodes,edges}>` (snapshot gồm cả position) tái dùng
  `engine/history.ts`; nút Undo/Redo trên toolbar + phím tắt Ctrl+Z / Ctrl+Shift+Z (hoặc Ctrl+Y);
  coalesce drag thành 1 step; (tùy chọn) History panel kiểu form-builder.
- [ ] **Highlight path**: click node → `getIncomers` đệ quy về `start` → tô đậm node+edge thuộc
  đường đi, làm mờ phần còn lại; click pane bỏ highlight. Hàm thuần test được.
- Files: `floating-edge.tsx`, `layout.ts`, `WorkflowEditor.tsx`, + new `path.ts` (pure trace) +
  `useWorkflowHistory.ts` (nếu tách). Test: `path.test.ts`, mở rộng `layout.test.ts`.
- Acceptance: live before/after cho thấy graph 3-level approval đọc rõ; undo/redo hoạt động trên
  add/del/rename/move/connect; click node sáng đúng đường từ start.

### WE2 — Inline create/rename ở Explorer (KHÔNG đụng contract)
- [ ] Bỏ `Modal` prompt cho New form/workflow/folder + Rename; thay bằng **tạo item "Untitled"
  inline trong cây + rename tại chỗ** (Enter commit / Esc huỷ), kiểu VS Code. Giữ delete =
  confirm modal (đúng cho hành động phá huỷ).
- Files: `ExplorerRail.tsx` (+ có thể tách `useInlineRename`). Test: cập nhật tree tests.
- Acceptance: tạo 3 thứ liên tiếp không bật modal nào; rename tại chỗ; live smoke.

### WE3 — Quản lý đa-form theo workflow (KHÔNG đụng contract)
- [ ] Góc nhìn workflow-scoped: từ `nodes[].formId` suy ra danh sách "Form dùng trong workflow",
  hiển thị + sửa nhanh (mở Drawer builder đã có). Cân nhắc badge/nhóm trong cây Explorer cho form
  thuộc workflow. Quan hệ node→formId đã có ⇒ thuần presentation/aggregation.
- Files: WorkflowEditor (panel overview) hoặc ProjectWorkspace; pure `usedForms(def)`.
- Acceptance: mở 1 workflow thấy ngay nó gồm form nào; live smoke.

### WE4 — Status catalog (ĐỤNG CONTRACT, additive)  ★ cần quyết scope
- [ ] node_type (START/NORMAL/OPTIONAL/END) + status_code + label + màu, **dùng chung** dạng
  master data. Theo tiền lệ preset/W3 (project-scoped, ngoài contract) + linked-field/W4
  (node giữ snapshot + tham chiếu `statusCode`). node có optional `kind` + optional `statusCode`;
  màu/label resolve từ catalog (KHÔNG lưu màu thô trong contract). Parse-compat test thay migration.
- **QUYẾT ĐỊNH owner (đang nghiêng "dùng chung"):** catalog project-scoped (master, nhiều workflow
  xài lại) — xác nhận lại trước khi code.
- Files: `workflow-schema/src/schema.ts` (+changeset), api module status-catalog (kiểu presets),
  builder status setter + node màu theo kind. Test: schema parse-compat, api, builder.
- Acceptance: định nghĩa cũ vẫn load; node tô màu theo type; chọn status từ master; live smoke.

### (Sau) WE5 — View modes (4 hướng thiết kế) + validation trực quan + keyboard-first
- Timeline-cột (mặc định) → kanban stage board → swimlane theo role (dùng `transition.role` sẵn)
  → tree. Cần optional `stage` trên node (additive). Validation tô đỏ node/edge lỗi (dùng
  `GraphError.ref`). Shortcuts đầy đủ.

---

## Giao thức resume (sau MỖI phase)
1. Tick `[x]` các mục đã xong trong file này + ghi commit hash.
2. Cập nhật memory `session-resume-workflow-editor-v2.md` (trạng thái + NEXT) + 1 dòng index MEMORY.md.
3. Commit (owner gate push/merge). Báo owner để `/clear` → session mới đọc memory + file này resume.

## Trạng thái
- 2026-06-24: track mở, plan này tạo, branch `feat/workflow-editor-v2` off main `001be3d`.
  Owner duyệt làm cả WE1→WE4. ĐANG LÀM: WE1.
