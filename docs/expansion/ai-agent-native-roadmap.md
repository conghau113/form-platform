# AI-Agent-Native Form & Workflow Infrastructure — Chiến lược & Lộ trình

> Tài liệu định hướng production. Mục tiêu: tránh đua ở mảng đã commodity, dồn sức vào
> khe hở thị trường mà kiến trúc hiện tại (typed contract + no-eval + multi-renderer +
> workflow) phù hợp nhất. Tick `[x]` để theo dõi tiến độ.

Cập nhật lần đầu: 2026-06-22. Người ra quyết định: owner.

---

## 1. Thị trường đã kiểm chứng (2026)

- Form-builder software: ~**$4.06B (2024) → $9.48B (2032)** — mảng đang lớn.
- **Đã commodity (ĐỪNG coi là moat):** "prompt → form". SurveyJS Creator, Fillout, FormHug,
  Formester đều đã có. SurveyJS còn có AI-generated choices + AI translation + grammar-fix.
- **Đã có incumbent ở mảng embeddable:** SurveyJS Creator (license + renderer MIT),
  Form.io (enterprise self-host: REST API tự sinh + submission storage + workflow + revisions),
  Formily (enterprise nặng), rjsf/JSONForms (thư viện OSS).
- **Xu hướng được xác nhận đúng & còn trống:** MCP là chuẩn de-facto — ~2M (11/2024) →
  **97M tải/tháng (3/2026)**, tăng 4.750%/16 tháng; MCP Apps render UI/form ngay trong chat agent.
  Incumbent form (survey-centric / enterprise-nặng) **chưa chiếm** chỗ này.

## 2. Định vị (corrected)

KHÔNG phải "một AI form builder nữa". LÀ: **hạ tầng form + workflow agent-native** —
- typed contract làm **compile target** cho người *và* agent,
- output **bảo đảm hợp lệ** (Zod) & **an toàn chạy** (no-eval),
- **nhúng được / tự host được**, own-data (BYOK),
- phân phối qua **MCP registry + npm** (không phụ thuộc ad spend).

AI-generation (prompt/ảnh → form) = tính năng **bắt buộc xây** (table-stakes), nằm ở P1 —
nó là cửa ngõ tiện lợi giúp người dùng tạo form base không cần kéo-thả từ đầu. Nhưng nó
KHÔNG phải *moat* (đối thủ đều có) và KHÔNG phải lý do tồn tại. "Không đua làm moat" =
làm nó đạt mức ngang bằng rồi dồn sức còn lại vào khe hở (workflow + agent-native + safety),
KHÔNG có nghĩa là loại bỏ tính năng.

## 3. Khác biệt vs incumbent

| Tiêu chí | SurveyJS / Form.io | Hệ này nhắm tới |
|---|---|---|
| Schema-driven, embeddable, own-data | ✅ (đã mạnh) | ✅ ngang bằng — table-stakes |
| AI prompt→form | ✅ đã có | ⚪ có, nhưng KHÔNG đua làm moat |
| **Form + Workflow hợp nhất** | ⚠️ yếu/nặng | ✅ **khe hở chính** |
| **Agent-native / MCP-first** | ❌ chưa | ✅ **khe hở chính** |
| **Output bảo đảm hợp lệ cho máy sinh (Zod+repair, no-eval)** | ⚠️ | ✅ **khe hở chính** |

## 4. Lộ trình theo phase

### P0 — Nền compile-target + MCP (khe hở, làm TRƯỚC)  ✅ (trừ publish URL)
- [x] `packages/form-schema/json-schema.ts`: export JSON Schema (draft-07) từ Zod **form**
  (`buildFormJsonSchema()`/`FORM_JSON_SCHEMA` + `FORM_SCHEMA_ID`, qua `zod-to-json-schema`).
- [x] `packages/form-schema/capabilities.ts`: field catalog máy-đọc (`FIELD_CAPABILITIES`/
  `formCapabilities()`), drift-test suy ra type set thẳng từ Zod union.
- [x] `packages/workflow-schema/{json-schema,capabilities}.ts`: mirror cho workflow
  (`WORKFLOW_JSON_SCHEMA`/`WORKFLOW_SCHEMA_ID` + `WORKFLOW_PRIMITIVES`/`workflowCapabilities()`),
  để ở workflow-schema tránh form→workflow dep.
- [ ] Publish JSON Schema tại URL ổn định (đổi `*_URI_BASE` urn → HTTP khi host — ops, để sau)
- [x] MCP server tối thiểu (`apps/mcp`, stdio): tools `list_capabilities` / `get_form_schema` /
  `get_workflow_schema` / `create_form` / `create_workflow`. `create_*` = migrate+Zod parse →
  contract hợp lệ hoặc `{ok:false,errors}` (KHÔNG gọi LLM — đó là P1). Pure `tools.ts` +
  integration test qua MCP protocol thật (InMemoryTransport).
- [x] changeset cho form-schema (`form-json-schema-capabilities-p0.md`) + workflow-schema
  (`workflow-json-schema-capabilities-p0.md`); `apps/mcp` private → no changeset.
- **Nghiệm thu:** ✅ `apps/mcp/src/server.test.ts` — agent client gọi MCP `create_form` →
  nhận `FormSchema` parse-pass Zod (formVersion=3). Demo/quay video + publish URL còn lại cho owner.

### P1 — AI core (BYOK, guaranteed-valid)  ✅ (slice 1 core + slice 2 endpoint + slice 3 eval done)
- [x] `@org/form-ai`: `AiProvider` interface (OpenAI-compatible shape, vision) — package mới,
  deps chỉ `@org/form-schema` + `zod` (KHÔNG react/antd, chạy server+browser).
- [x] `providers/openai-compatible.ts` (phủ 9router + OpenAI + Azure) + `providers/anthropic.ts` —
  fetch-wrapper mỏng, `fetchImpl` inject (default global fetch), test offline.
- [x] pipeline `generateForm` = `generate → extractJsonObject → normalize (migrate+Zod) →
  repair (≤N vòng, feed Zod errors lại) → postprocess` + `dedupeFieldNames` (dedupe name).
- [x] ingest: prompt + image(vision qua AiImageInput); test với provider mock (CI không tốn token).
- [x] API headless `POST /ai/forms/generate` với header BYOK (`x-ai-*`); allowlist URL trong output
  (`AI_URL_ALLOWLIST` + `stripDisallowedUrls`). **Dùng `/forms/generate` thay vì AIP colon
  `forms:generate`** (colon cũng khớp `/ai/formsX` dưới express path-to-regexp 0.1.13).
- [x] changeset cho form-ai (`form-ai-core-p1.md` + `form-ai-url-sanitize-p1.md`); api private → no changeset.
- [x] golden-set eval harness (slice 3): `eval/{golden,score,run}.ts` — labeled EN+VI golden set
  (input + machine-checkable `expect`: minFields/expectTypes/expectFields + `referenceDraft`),
  pure scoring (`scoreCase`/`summarizeEval`: parse-rate, pass-rate, type/field coverage),
  `runFormEval(provider)` drives the real pipeline; `fixtureProvider` = zero-token CI run,
  `providerFromEnv`/`formatEvalReport` = opt-in BYOK live run (`describe.skipIf` gated on
  `FORM_AI_EVAL_*`). changeset `form-ai-eval-harness-p1.md`.
- **Nghiệm thu:** ✅ slice 1 core + slice 2 endpoint + slice 3 eval. form-ai 39/39 (+16, 1 live test
  skipped in CI), api 54/54, không có fetch hardcode (provider seam inject). Output luôn parse-valid
  (Zod) hoặc 422. Fixture parse-rate = 100% (golden set self-achievable); live ≥95% bar = owner BYOK run.

### P2 — Builder thành bề mặt human-in-the-loop  ✅ (slice 1 + overhaul + slice 2 done)
- [x] Nút "Tạo bằng AI" cạnh palette (prompt / kéo ảnh) — `e254b34` (slice 1)
- [x] Diff AI-đề-xuất vào canvas trước khi nhận (tái dùng patch/history + useBlocker) — `e254b34`
- [x] **Overhaul Generate/Refine (slice 1.5, 2026-06-23):** Modal→**Drawer phải `mask=false`**
  (canvas vẫn thấy + tương tác khi lặp), **conversational refine** (`POST /ai/forms/refine`,
  giữ field `name` ổn định), **vision prompt + image 2-pass** (`imageStrategy`,
  `image_url.detail:"high"`), temp 0.3/maxTokens 8192, empty-canvas CTA. Live-verified vs
  9router (refine giữ tên + chỉ đổi field được yêu cầu). Commits `2f0c1c1` (form-ai+changeset)
  / `ec5fc59` (api) / `40e8f0f` (builder) / `d400d00` (eval resilience) trên
  `feat/ai-p0-json-schema` (CHƯA merge main). Reviewer PASS. Plan
  `~/.claude/plans/swirling-bubbling-bonbon.md`.
  - [ ] (owner) browser smoke Drawer (cần restart Claude Code để nạp MCP browser tools) + merge.
- [x] **(slice 2 = Track B)** "Apply skill/pattern": AI sinh preset library → apply nhiều form
  (dùng preset W3 + linked-fields W4). Plan `~/.claude/plans/trackb-ai-preset-library.md`.
  - form-ai: `generatePreset`/`normalizePresetDraft` (`preset.ts`) — patch chứng minh bằng dựng
    field tổng hợp rồi parse `fieldNodeSchema`, accept patch tái suy từ node đã-parse (clean,
    leaf-only) + `preset-prompt.ts` (catalog leaf + shape validation thật: regex ở `value`) +
    `stripPresetUrls` (sanitize.ts). changeset `form-ai-preset-generation-p2.md`. form-ai 50/51.
  - api: `POST /ai/presets/generate` (BYOK) — `GeneratePresetDto` + `AiService.generatePreset` +
    `runPreset` boundary (502/422 + URL strip), KHÔNG persist. api ai.service 15/15.
  - builder: `presets/ai/` (client fetch-only + react-query mutation + `AiPresetModal` preview
    single-field qua FormRenderer + `presetFromDraft`/`previewFormFromDraft`) + nút ✨ trong
    PresetSection; `apply.ts` PURE `appendLinkedField` (W4 linked field, name unique/form) +
    `useApplyPreset` batch (load→append→save **KHÔNG placement** để giữ folder) +
    `ApplyPresetModal` (checklist forms từ project tree) + action "apply across project" trên
    chip. builder 295/295. reviewer PASS no required fixes.
- **Nghiệm thu:** sửa-rồi-nhận mượt ✅; "1 câu lệnh đồng bộ field chuẩn khắp project" = code-complete
  (generate preset → apply linked vào N form → edit preset re-propagate qua `resolveLinkedFields`).
  Owner nợ: browser smoke + live model run (cắm key 9router).

### P3 — AI sinh Workflow (khe hở Form+Workflow)  ✅ **COMPLETE (moat) — C0→C5 done**
> Plan thực thi chi tiết: `~/.claude/plans/luminous-charting-cartographer.md` (C0 tách
> `@org/ai-core` → C1 `@org/workflow-ai` generateWorkflow → C2 api → C3 builder → C4 MCP → C5 eval).
> Quyết định owner đã chốt (deferred to rec 2026-06-23): DC1=A (tách `@org/ai-core`),
> DC2=mở rộng module `ai` sẵn có, DC3=C0–C3 trước → C5 → C4.
- [x] **C0 — tách `@org/ai-core`** (provider seam + 2 provider impl + generic
  `runValidationLoop`/`extractJsonObject`; form-ai re-export back-compat). Commit `02bf933`.
- [x] **C1 — `@org/workflow-ai`** (`generateWorkflow`/`refineWorkflow`): prompt nhúng
  `workflowCapabilities()` → `runValidationLoop` (ai-core) → `normalizeWorkflowDraft` =
  stamp version → migrate → Zod → **`validateGraph`** trong CÙNG error channel ⇒ lỗi graph
  feed lại model y như lỗi Zod, no special-casing. No-eval, guards JSONLogic, additive
  (KHÔNG bump workflowVersion). Tests 12/12, reviewer PASS. Commit `987548d`. Changeset có.
- [x] **C2 — api `POST /ai/workflows/{generate,refine}`** (BYOK, mở rộng module `ai` sẵn có;
  reuse `AiProviderFactory` + `@AiCreds`; boundary 502 provider-fail / 422 unrecoverable; KHÔNG
  strip URL — workflow contract không mang URL). `GenerateWorkflowDto`/`RefineWorkflowDto` chỉ
  validate envelope, `currentWorkflow` truyền model dạng text, never eval. Additive, KHÔNG bump
  workflowVersion. api 61/61 (+4), reviewer PASS. Commit `bfdf686`. Live smoke vs 9router: owner.
- [x] **C3 — builder "Generate workflow with AI"** vào xyflow WF2 `WorkflowEditor` (mirror form
  `AiAssistantDrawer`): Drawer non-blocking `mask=false`, prompt→`POST /ai/workflows/generate`→
  preview cấu trúc + diff state→apply REPLACE cả graph (GIỮ `meta.id` persisted = upsert key, AI
  không emit position→`tidyLayout`+fitView) + refine hội thoại qua `/ai/workflows/refine`. NEW
  `apps/builder/src/workflow/ai/` (client fetch-only reuse BYOK `src/ai/creds` + react-query
  mutations + pure `diffWorkflows`+3 tests + Drawer + barrel). Builder-only additive, NO
  contract/changeset. builder 286/286, typecheck+biome clean, reviewer PASS. Commit `318da1f`.
  **Tiền đề:** merge WF0→WF2 (workflow track) vào nhánh AI trước (`0fe185a`, owner-approved
  Option A) để có WF2 editor + api workflows module. Owner owes live smoke vs 9router.
- [x] **C5 — eval** (golden-set workflow harness, mirror form-ai `src/eval/`): `scoreWorkflowCase`/
  `summarizeWorkflowEval` pure (parseRate = graph-valid-rate vì pipeline chỉ `ok` sau Zod+
  `validateGraph`), `GOLDEN_WORKFLOWS` 9 EN+VI (incl moat leave-approval-3-level, mọi referenceDraft
  graph-valid self-tested), `runWorkflowEval`+`fixtureProvider`(0-token CI)+`providerFromEnv`
  (`WORKFLOW_AI_EVAL_*` opt-in live)+report. Additive tooling, changeset. workflow-ai 22/1, reviewer
  PASS. Commit `<C5>`. **★ LIVE vs 9router (gc/gemini-2.5-flash): graph-valid-rate 100% (9/9, avg
  attempts 1.00) — GATE ĐẠT ≥95%.** pass-rate 44% (expectActions ascii brittle + model drift ngôn ngữ
  → cơ hội tinh chỉnh prompt C1 ghim output language; KHÔNG phải lỗi pipeline).
- [x] **C4 — MCP generate path** (`apps/mcp`): NEW LLM tools `generate_form` + `generate_workflow`
  (prompt → `@org/{form,workflow}-ai` pipeline → guaranteed-valid doc, cùng Zod+graph repair loop
  như api/builder). No-LLM `create_*` giữ nguyên (zero-token path). Provider build từ **env** (stdio
  không có header per-request): `AI_API_KEY` + optional `AI_PROVIDER`/`AI_BASE_URL`/`AI_MODEL`; thiếu
  key → tool error (KHÔNG crash, discovery + create_* vẫn chạy). `createServer({resolveProvider})`
  injectable = test bằng scripted provider, zero network. NEW `src/provider.ts` + 2 tool + ARCHITECTURE
  cập nhật. mcp 14/14 (advertise 7 tools + generate_form/workflow valid + missing-creds error),
  typecheck+biome clean. apps private = no changeset. **★★ Track C (P3) COMPLETE.**
- **Nghiệm thu:** "tạo quy trình duyệt nghỉ phép 3 cấp" → graph hợp lệ render được trong editor. ✅

### P4 — Lớp service production (chỉ khi host hộ khách)  ⏳
- [ ] DB thật (Postgres), auth/tenant, submission storage, file storage, audit, rate-limit
- [ ] Embed SDK + docs công khai (`<FormRenderer>` + headless API + JSON Schema public)
- **Nghiệm thu:** một khách pilot nhúng & chạy end-to-end trên hạ tầng của họ.

### Eval & chất lượng (xuyên suốt P1–P3)  ⏳ (harness done; live gate pending 9router)
- [x] Golden set (10 ca EN+VI) + scoring thuần (`packages/form-ai/src/eval/`) — parse/pass-rate,
  type/field-coverage. Fixture (zero-token) = 100% self-achievable.
- [x] **Hardened (2026-06-23):** test live timeout 120s→20m (10 ca tuần tự ~9 phút), và
  `runFormEval` cô lập từng case + retry khi *throw* (1 blip 9router không còn văng cả run).
- [ ] **Chốt cổng P1 live ≥95%:** chạy `runFormEval` thật vs model — **đang chờ 9router
  (localhost:20128) bật lại** (lần đo cuối fail vì proxy DOWN/ECONNREFUSED, không phải code).
  Lệnh: `FORM_AI_EVAL_BASE_URL=http://localhost:20128/v1 FORM_AI_EVAL_API_KEY=… FORM_AI_EVAL_MODEL=ag/claude-sonnet-4-6 pnpm --filter @org/form-ai test -- run.test`
- [ ] Chạy eval mỗi lần đổi prompt/model

## 5. Rủi ro & cách giảm

| Rủi ro | Giảm thiểu |
|---|---|
| MCP Apps UI còn sớm, doanh thu timing chưa chắc | Sản phẩm gần = embeddable SDK (bán được ngay); MCP là wedge phân phối, không phải nguồn thu duy nhất |
| Incumbent mạnh (SurveyJS/Form.io) | Không đua form thuần; đánh Form+Workflow+agent-native+safety |
| AI free (9router) không đưa vào critical path | `AiProvider` injectable từ ngày 1; BYOK |
| Prompt-injection từ ảnh/URL/PDF | structured output + allowlist URL + cap size + no-eval |
| Chất lượng AI trôi nổi | Eval harness bắt buộc trước khi hứa SLA |
| Đội nhỏ, dàn trải | Làm đúng thứ tự P0→P4; P0+P1 là tối thiểu để có demo "wow" |

## 6. Chỉ số thành công (để biết có đáng tiếp không)

- P0/P1: parse-rate ≥95%, có demo agent→form chạy được.
- P2/P3: thời gian tạo 1 form+workflow giảm ≥5× so với làm tay (đo trên 5 ca thật).
- P4: ≥1 khách pilot nhúng thật.
- Tín hiệu dừng/đổi hướng: nếu sau P0+P1 không ai (dev/agent) thử cắm MCP/SDK → định vị sai, xem lại.
