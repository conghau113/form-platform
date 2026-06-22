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

### P1 — AI core (BYOK, guaranteed-valid)  ⏳ (slice 1 done; endpoint + eval còn lại)
- [x] `@org/form-ai`: `AiProvider` interface (OpenAI-compatible shape, vision) — package mới,
  deps chỉ `@org/form-schema` + `zod` (KHÔNG react/antd, chạy server+browser).
- [x] `providers/openai-compatible.ts` (phủ 9router + OpenAI + Azure) + `providers/anthropic.ts` —
  fetch-wrapper mỏng, `fetchImpl` inject (default global fetch), test offline.
- [x] pipeline `generateForm` = `generate → extractJsonObject → normalize (migrate+Zod) →
  repair (≤N vòng, feed Zod errors lại) → postprocess` + `dedupeFieldNames` (dedupe name).
- [x] ingest: prompt + image(vision qua AiImageInput); test với provider mock (CI không tốn token).
- [ ] API headless `POST /ai/forms:generate` với header BYOK; allowlist URL trong output **(slice 2)**
- [x] changeset cho form-ai (`form-ai-core-p1.md`).
- **Nghiệm thu:** parse-rate ≥95% trên golden set; output luôn render được; không có fetch hardcode.
  (slice 1: pipeline + dedupe + 2 provider có test 18/18; golden-set eval + endpoint ở slice 2.)

### P2 — Builder thành bề mặt human-in-the-loop  ⏳
- [ ] Nút "Tạo bằng AI" cạnh palette (prompt / kéo ảnh)
- [ ] Diff AI-đề-xuất vào canvas trước khi nhận (tái dùng patch/history + useBlocker)
- [ ] "Apply skill/pattern": AI sinh preset library → apply nhiều form (dùng preset + W4 + i18n)
- **Nghiệm thu:** sửa-rồi-nhận mượt; demo "1 câu lệnh đồng bộ field chuẩn khắp project".

### P3 — AI sinh Workflow (khe hở Form+Workflow)  ⏳
- [ ] ingest mô tả tiếng Việt → `WorkflowDefinition` (tận dụng WF editor đã có)
- [ ] MCP tool `create_workflow` hoàn chỉnh + diff vào xyflow canvas
- [ ] validate graph well-formed (reachable / không deadlock / edge hợp lệ) trước khi nhận
- **Nghiệm thu:** "tạo quy trình duyệt nghỉ phép 3 cấp" → graph hợp lệ render được.

### P4 — Lớp service production (chỉ khi host hộ khách)  ⏳
- [ ] DB thật (Postgres), auth/tenant, submission storage, file storage, audit, rate-limit
- [ ] Embed SDK + docs công khai (`<FormRenderer>` + headless API + JSON Schema public)
- **Nghiệm thu:** một khách pilot nhúng & chạy end-to-end trên hạ tầng của họ.

### Eval & chất lượng (xuyên suốt P1–P3)  ⏳
- [ ] Golden set (input → kỳ vọng) + đo parse-rate / render-rate / field-coverage / logic-correctness
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
