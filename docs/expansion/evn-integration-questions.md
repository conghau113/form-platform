# Bộ câu hỏi tích hợp — form-platform ↔ EVN core-service (§12)

**Người gửi:** đội form-platform · **Ngày:** 2026-08-04
**Đối tượng:** đội phát triển `core-service`
**Căn cứ:** `core-service/docs/third-party-form-ticket-integration.md` §11–§14 (dưới đây gọi là *tài liệu*)
và source `core-service/src` + `core-service/public/files/templateJSON` (dưới đây gọi là *source*).

> ⚠️ **Hai lưu ý khi tra dẫn chứng:**
> 1. Repo có **hai** file cùng tên `ticket.constant.ts`. Chúng tôi luôn ghi đường dẫn đầy đủ:
>    `src/shared/common/constant/ticket.constant.ts` (chứa các bảng `ROLE_STATUS_ACTION_*`) và
>    `src/modules/ticket/ticket.constant.ts` (chứa `ACTION_CHECK_ROLE_PCT`).
> 2. Trong tài liệu, phần đánh số **lặp lại** *(sửa 2026-08-12 — mô tả trước đây của chúng tôi ở mục
>    này không chính xác)*: có **hai** tiêu đề `## 12` (dòng **1368** và **1480**), và bên dưới
>    `## 12` (1368) lại xuất hiện `### 11.1` (dòng **1370**) và `### 11.2` (dòng **1464**) — **trùng
>    số** với `### 11.1`–`### 11.7` thật của §11 (dòng 764–1345). Vì không có mục nào đánh `### 12.x`,
>    chúng tôi gọi theo **nội dung**: *"§12.B"* = phần *"Lấy form template động"*, *"§12.C"* =
>    *"Kiểm tra điều kiện chuyển bước"* (dòng 1433). **Mọi dẫn chứng đều kèm số dòng** để tra cho chắc.

---

## 0. Bối cảnh và cách đọc tài liệu này

Chúng tôi đang hiện thực ba endpoint mà §12 mô tả:

| | Endpoint | Trạng thái phía chúng tôi |
|---|---|---|
| A | `GET /external/workflow-definition` | 🔴 **QUYẾT ĐỊNH KHÔNG LÀM** — trả lời cho **Q7**, lý do + số đo ở **T23**. Đảo ngược được nếu các anh gỡ `generateWorkflowForTicket` |
| B | `GET /external/form-template` | đã chạy được bản đầu, **hợp đồng còn tạm** vì các câu B1–B4 dưới đây |
| C | `POST /external/check-transition` | **đã chạy được** (P4b), **đã chấm được `requiredFields`** (P4c, xem **T19**) và **đã có `definitionVersion`** để phát hiện trôi bảng (P4d, xem **T21**) — nhưng **B1 vẫn chặn** phần `nextStatus` của 3 action then chốt; xem **§8** |

**Trước khi hỏi, chúng tôi đã đọc source để tự trả lời.** Nhiều chỗ trong tài liệu mâu thuẫn với code
thật; chúng tôi đã tự phân giải theo source và liệt kê ở **§1** — phần đó chỉ cần phía EVN xác nhận
"đúng/sai", không cần giải thích dài. Phần thật sự cần quyết định nằm ở **§2** (4 câu chặn) và **§3**
(9 câu có mặc định).

**Mỗi câu đều có sẵn "mặc định của chúng tôi".** Nếu một câu không được trả lời, chúng tôi vẫn làm tiếp
theo mặc định đó — cột "sai thì hỏng gì" nói rõ cái giá phải trả nếu mặc định sai.

**Tổng cộng cần trả lời:** 3 câu xác nhận nhanh (X1–X3) · **4 câu chặn** (B1–B4) kèm 2 câu phụ
(B1b, B3b) · 9 câu có mặc định (Q1–Q9) · 2 câu xác nhận trong **phụ lục A** (`password` và nhóm 4) ·
1 mục xin dữ liệu · 2 mục chỉ để thông báo. Ba câu cuối nằm ở phụ lục A vì phải nhìn bảng tra mới hỏi
được. Nếu chỉ có thời gian cho một thứ, xin ưu tiên **B1**.

**Đề nghị cách trả lời:** ghi thẳng số hiệu câu + một đến hai câu trả lời. Không cần viết lại ngữ cảnh.

---

## 1. Những chỗ tài liệu lệch source — chúng tôi đã tự phân giải, xin xác nhận

Chúng tôi lấy **source làm chuẩn** trong mọi trường hợp dưới đây. Xin xác nhận cách hiểu này đúng, và
nếu tiện thì cập nhật lại tài liệu để integrator sau không vấp phải.

### 1.1. Bảng chuyển trạng thái nằm trong source, không chỉ trong DB

`ticket.action_role_status` được **xoá sạch và seed lại toàn bộ** từ hằng số trong source:

- `initActionRoleStatus()` — `src/modules/ticket/service/ticket-action.service.ts:230`:
  `actionRoleStautussRepository.clear()` rồi `save()` lần lượt từ
  `ROLE_STATUS_ACTION_{BBKSHT,DKCT,PCT,YCM,LCT,PTT}`.
- Nguồn của PCT: `ROLE_STATUS_ACTION_PCT` — `src/shared/common/constant/ticket.constant.ts:2576-2788`,
  **34 hàng đang sống** (25 action riêng biệt, 14 trạng thái, 7 vai).
- Trong đó có **đúng 1 hàng đang bị comment** (`:2638-2643`):
  `PCT_R_CREATED` + `PCT_S_WORKING` + `PCT_A_CANCEL` → `PCT_S_CANCEL`, tức **huỷ phiếu khi đang công
  tác**. Chúng tôi coi như hàng này **không tồn tại** — xin xác nhận đó là chủ đích, vì đây là loại
  chuyển tiếp dễ có người hỏi tới.
- Hàm này còn được gọi qua controller `ticket-action.controller.ts:43` và
  `common.service.ts:616,630`.

**⇒ Cách hiểu của chúng tôi:** bảng trong DB là **dẫn xuất** của hằng số trong source. Chúng tôi trích
bảng PCT thẳng từ `ticket.constant.ts` thay vì chờ export DB.

> **Xin xác nhận (X1):** đúng chứ? Và sau khi seed, bảng có bị **sửa tay trên DB** không (thêm hàng, tắt
> `active`)? Nếu có thì bản trích của chúng tôi sẽ thiếu — đó là lý do chúng tôi vẫn xin export ở **§4**.

### 1.2. Bảy chỗ tài liệu mâu thuẫn với source

| # | Tài liệu nói | Source nói | Chúng tôi theo |
|---|---|---|---|
| **D1** | §13 bước 3 (`:1524-1527`): `PCT_A_WORKING` do **`PCT_R_LANH_DAO`** thực hiện, chuyển sang **`PCT_S_ALLOWED_WAITING`**. Ví dụ §12.C (`:1444-1458`) cũng trả `nextStatus: "PCT_S_ALLOWED_WAITING"` | Bảng có **đúng một hàng** cho `PCT_A_WORKING`: `PCT_R_CHTT` + `PCT_S_MODERATION` → **`PCT_S_WORKING`** (`shared/common/constant/ticket.constant.ts:2644-2649`). Khớp với sơ đồ §11.1 (`:775`), ma trận §11.6 (`:1324`) và văn xuôi §11 bước 2 (`:848-852`) | **Source.** `PCT_A_WORKING` → `PCT_S_WORKING`, vai `PCT_R_CHTT` |
| **D2** | §11 bước 2 (`:851`): trạng thái trước là `PCT_S_MODERATION` **hoặc `PCT_S_CREATED`** | **Không có hàng nào** cho `PCT_A_WORKING` từ `PCT_S_CREATED`. Chỉ từ `PCT_S_MODERATION` | **Source.** Phiếu chưa qua điều phối **không** cấp được — xem **Q2** hỏi đây có phải chủ đích không |
| **D3** | Ví dụ §12.C (`:1444`) gửi `currentStatusCode: "PCT_S_CREATED"` + `actionCode: "PCT_A_WORKING"` và nhận `allowed: true` | Theo bảng, cặp này **không tồn tại** ⇒ phải bị từ chối | **Source.** Ví dụ trong tài liệu là ví dụ **sai** — đáng lo vì đó là thứ integrator thử đầu tiên |
| **D4** | §13 bước 7 (`:1556-1559`): `PCT_A_CHTT_START_WORK` → `statusCode = PCT_S_WORKING` | Action này **không nằm trong bảng flow**; nó ở `ROLE_STATUS_ACTION_PCT_CHTT_NOT_FLOW` (`shared/common/constant/ticket.constant.ts:2524`) = *"action không cần theo flow của CHTT"* | **Source.** Coi là action **không đổi trạng thái theo bảng** |
| **D5** | §11.7 (`:1349-1357`): SQL kiểm quyền có `ars.active = true` nhưng **không có `trv.active = true`** | SQL thật lọc **cả hai** (`ticket-action.service.ts:2586-2593`) | **Source.** Chúng tôi tôn trọng `active` ở cả hai bảng |
| **D6** | §11.6 dùng ký hiệu *"(không đổi)"* cho **4 hàng**: `PCT_A_UPDATE` (`:1323`) và ba hàng điểm danh `PCT_A_NHANVIEN_CHECKIN` / `PCT_A_CHTT_NHANVIEN_CHECKIN` / `PCT_A_NHANVIEN_CHECKOUT` (`:1329-1331`) | **Cùng một ký hiệu nhưng source làm hai kiểu khác nhau.** `PCT_A_UPDATE` **không khai** `statusCodeNext` ⇒ nhận default cột = `S_N/A` (`action-role-status.entity.ts:16-23`). Ba hàng điểm danh thì **khai rõ** `statusCodeNext: PCT_S_HANDOVERED`, tức lặp lại đúng trạng thái hiện tại | Theo source từng hàng — xem phụ lục B. **Xin thống nhất một ký hiệu**, vì hai cách này khác nhau thật: `S_N/A` là "không có trạng thái sau", còn lặp lại là "có, và bằng cái cũ" |
| **D7** | Mã vai **`R_N/A`** xuất hiện ở ba chỗ: bảng §11.6 (`:1320-1321`), ghi chú §11.6 (`:1341`), và **luật kiểm quyền §11.7** (`:1360`: *"…HOẶC `ars.role_code = 'R_N/A'`"*) | Enum là **`R_NA`**, **không có dấu gạch chéo** (`src/shared/common/enum/ticket.enum.ts:203` — `rNa = 'R_NA'`). Chuỗi `R_N/A` **không xuất hiện ở đâu trong `src/`**. Dễ nhầm vì mã trạng thái thì **đúng là** có gạch chéo: `sNa = 'S_N/A'` (`:20`) | **Source: `R_NA`.** ⚠️ Câu SQL ở `:1349-1357` **không** dính lỗi này (nó không nhắc tới `R_N/A`); chỗ sai là **luật ở `:1360`** — ai cài đúng theo câu đó thì phép kiểm sentinel sẽ **không bao giờ khớp** |

> **Xin xác nhận (X2):** bảy dòng trên, chúng tôi hiểu đúng chứ? Đặc biệt **D1** và **D3** — vì nếu bảng
> mới là đúng thì hai ví dụ trong tài liệu cần sửa. **D7** thì nên sửa sớm: §11.7 là chỗ integrator
> đọc để cài phép kiểm quyền.

### 1.3. `PCT_S_MODERATION` không đến từ bảng chuyển trạng thái

Chúng tôi thấy trạng thái này được **ghi thẳng** bằng `tickets.update` trong luồng điều phối
(`ticket.service.ts:14409-14412`, `:14740-14743`, `:14790-14793`), **không** qua `action_role_status`.

> **Xin xác nhận (X3):** đúng chứ? Và **còn trạng thái nào khác** cũng được ghi thẳng kiểu này không?
> Chúng tôi cần biết để endpoint C **không** trả `allowed: false` oan cho những phiếu đi đường đó.
> **Mặc định:** trạng thái/action nào tra không ra **trong bảng** ⇒ trả `allowed: true` + liệt kê
> vào `outOfScopeGuards`, **không** trả `false`. ⚠️ **Sửa ở P4c:** câu này chỉ nói về việc *tra
> bảng*. Guard nội dung (`requiredFields`, **T19**) là câu hỏi độc lập với bảng và **có** trả
> `allowed: false` — kể cả khi `coverage` là `TABLE_INCOMPLETE`.

---

## 2. Bốn câu CHẶN

Bốn câu này quyết định **hình dạng hợp đồng**, nên một khi đã chốt thì đổi rất tốn. Chúng tôi tạm dừng
ở đây chờ trả lời.

---

### B1. Endpoint C thiếu dữ liệu để tính được `nextStatus` — xin bổ sung `ticketRoles`

**Đây là câu quan trọng nhất.**

`nextStatus` của PCT **không** phải hàm của `(vai, trạng thái, action)`. Với **ba action then chốt**,
bảng có **hai hàng cùng khoá, khác trạng thái sau**:

| action | trạng thái trước | hai khả năng |
|---|---|---|
| `PCT_A_ALLOW` | `PCT_S_WORKING` | `PCT_S_ALLOWED_WAITING` **hoặc** `PCT_S_ALLOWED` |
| `PCT_A_HANDOVER` | `PCT_S_ALLOWED` | `PCT_S_HANDOVERED_WAITING` **hoặc** `PCT_S_HANDOVERED` |
| `PCT_A_END` | `PCT_S_HANDOVERED` | `PCT_S_END_WAITING` **hoặc** `PCT_S_END` |

Chọn hàng nào được quyết bởi `ACTION_CHECK_ROLE_PCT`
(`src/modules/ticket/ticket.constant.ts:1060-1086`), và phép kiểm là
`checkRoleCodeExistInTicket(roleCode, ticketId)`
(`src/modules/ticket/service/ticket-action.service.ts:1669`) — tra `ticket.ticket_role_values` xem
**trên phiếu đó có ai được phân vai** `PCT_R_LANH_DAO` / `PCT_R_GSATD` hay không. Đường chạy thật nằm ở
`ticket.service.ts:5244-5271` (nhánh `if (check)` lấy `YES`, `else` lấy `NO`):

```
PCT_A_ALLOW    : phiếu CÓ PCT_R_LANH_DAO → PCT_S_ALLOWED_WAITING ; KHÔNG → PCT_S_ALLOWED
PCT_A_HANDOVER : phiếu CÓ PCT_R_GSATD    → PCT_S_HANDOVERED_WAITING ; KHÔNG → PCT_S_HANDOVERED
PCT_A_END      : phiếu CÓ PCT_R_LANH_DAO → PCT_S_END_WAITING ; KHÔNG → PCT_S_END
```

Nhưng request của §12.C (`:1440-1452`) chỉ có `ticketId`, `ticketTypeCode`, `currentStatusCode`,
`actionCode`, `executorUserCode`, `ticketData` — **không có trường nào chở danh sách vai đã phân trên
phiếu**. Chúng tôi không truy được `ticket_role_values` (đó là DB của phía EVN).

**Đề nghị:** thêm vào request một mảng vai đã phân trên phiếu, ví dụ

```json
"ticketRoles": [
  { "roleCode": "PCT_R_CHTT",     "userCode": "emp002" },
  { "roleCode": "PCT_R_LANH_DAO", "userCode": "emp009" }
]
```

Chỉ cần `roleCode` là đủ để phá nhập nhằng; `userCode` giúp chúng tôi kiểm luôn quyền của người bấm.

| | |
|---|---|
| **Mặc định nếu không trả lời** | Trả `nextStatus: null` kèm `ambiguousNext: ["PCT_S_ALLOWED_WAITING","PCT_S_ALLOWED"]` cho đúng ba action đó |
| **Sai thì hỏng gì** | Ba action đó là **các bước chính giữa quy trình PCT**. Endpoint C trả `null` ở đúng những bước ấy thì gần như không dùng được cho PCT |

> **Câu hỏi phụ B1b:** phép kiểm này **không lọc `active`** — `checkRoleCodeExistInTicket` chỉ
> `findOne({ where: { roleCode, ticketId } })`. Trong khi đó hai chỗ khác cùng đọc bảng ấy **thì có
> lọc**: `getRoleValueTicket` (`ticket-action.service.ts:1674-1681`, `active: true`) và SQL
> `getActionStatusNext` (`:2586-2593`, `trv.active = true`). Vậy hàng `ticket_role_values` đã
> `active = false` có được tính là *"phiếu có vai đó"* không? Nếu không thì đây có thể là **lỗi** phía
> các anh chị: gỡ vai lãnh đạo khỏi phiếu rồi mà phiếu vẫn đi nhánh `*_WAITING`.
> (Chúng tôi mặc định: **không tính** — chỉ vai còn `active`.)

---

### B2. Một `ticketTypeCode` có **6** template — endpoint B không có chỗ nói lấy cái nào

`GET /external/form-template?ticketTypeCode=PCT` (`:1407`) chỉ nhận `ticketTypeCode` và `version`.
Nhưng trong `public/files/templateJSON` có **6 file cùng `formTypeCode = "PCT"`**, khác `formCode`:

| file | `formCode` | dùng cho |
|---|---|---|
| `CPCT.json` | `CPCT` | màn tạo phiếu |
| `CT_PCT.json` | `CT_PCT` | chi tiết phiếu (web) |
| `CT_PCT_Mobile.json` | `CT_PCT_M` | chi tiết phiếu (mobile) |
| `CT_PCT_PDF.json` | `CT_PCT_PDF` | dựng PDF |
| `CT_PCT_Action.json` | `CT_PCT_W_ACTION` | khối hành động trên web |
| `WORKFLOW_PCT.json` | `WORKFLOW_PCT` | hiển thị quy trình |

**Câu hỏi:** endpoint B nên nhận thêm `?formCode=` (trả **một** template), hay trả **tất cả** template
của loại phiếu đó trong một response?

| | |
|---|---|
| **Mặc định** | Thêm `?formCode=`. Thiếu tham số mà loại phiếu có >1 template ⇒ trả 404, **không đoán bừa** |
| **Sai thì hỏng gì** | Trả nhầm template (ví dụ đưa bản PDF cho màn tạo phiếu). Và vì đây là **hình dạng URL**, một bên tự đổi thì bên kia gọi hỏng — phải thống nhất trước |

---

### B3. Ba từ vựng `typeCode` đang mâu thuẫn — cái nào là chuẩn để chúng tôi xuất ra?

| nguồn | số mã | phủ được bao nhiêu node thật |
|---|---|---|
| tài liệu §8 (`:467-531`) | 36 | **69,3 %** |
| `COMPONENT_TYPES.md` (tự nhận *"liệt kê tất cả"*) | 44 | **70,5 %** |
| **template JSON thật** (32 file, 2709 node) | **97** | 100 % |

**60 mã đang dùng thật không có trong `COMPONENT_TYPES.md`**, trong đó có những mã rất phổ biến:
`LABEL` (225 lần), `ACTION` (133), `WORKFLOW_NODE` (54), `BLOCK` (40), `TABLE` (24), `TEXT_AREA` (23),
`SIGN` (22), `FORM_ACTION` (22). Ngược lại 7 mã có trong đặc tả nhưng **chưa từng dùng**
(`DATE_PICKER`, `SELECT_TAGS`, `COMPONENT_VERTICAL`, `VERTICAL_LINE`, `AREA`, `FILE`, `TEXT_HORIZONTAL`).

**Câu hỏi:** renderer của phía EVN chấp nhận **trọn 97 mã**, hay chỉ 36/44 mã trong đặc tả (nghĩa là
các mã còn lại là di sản đang được dọn)? Và xin xác nhận bảng tra `type` (phía chúng tôi) → `typeCode`
(phía EVN) ở **phụ lục A**.

| | |
|---|---|
| **Mặc định** | Bám **97 mã đo được từ template thật**. Loại nào không có đích ⇒ chúng tôi trả **422** kèm tên trường, không tự bịa mã mới |
| **Sai thì hỏng gì** | Xuất ra mã renderer không hiểu ⇒ **trắng màn hình**, và lỗi chỉ lộ ra lúc chạy chứ không lúc soạn |

---

### B4. `description` — khoá nào là **tối thiểu bắt buộc**?

> 🔴 **Bản này đã VIẾT LẠI (2026-08-10) sau khi chúng tôi đo trực tiếp trên renderer tạo phiếu.**
> Bản trước dựa trên **tần suất khoá trong template**, và tần suất đó là **tổng của bốn renderer khác
> nhau** (tạo phiếu / xem chi tiết / PDF / workflow) — cùng loại nhầm lẫn với "97 mã `typeCode`" ở B3.
> Ví dụ `valueCode` 896 lần là: tạo phiếu **1**, xem chi tiết 577, mobile 54, PDF 264.

Chúng tôi chỉ xuất được cho **renderer tạo phiếu**, nên chỉ những khoá renderer đó **thật sự đọc** mới
có nghĩa. Đo trên `web-admin/src/features/workOrder/workOrderManager` và `core-service/src`:

**Chúng tôi CÓ cấp** (đều đã kiểm là có nơi đọc):

| khoá | áp cho | nơi đọc |
|---|---|---|
| `isApi:false` + `data:{data:[…]}` | `SELECT*`, `SELECT_TREE_*`, `SELECT_TAGS`, `RADIO` | `SelectItemHandle.tsx:467`, `TreeSelectItemHandle.tsx:237`, `SelectedTagsItemRender.tsx:234`, `RadioItemHandle.tsx:82` |
| `disable` | `TEXT_INPUT`, `TEXTAREA`, `NUMBER_INPUT`, `SELECT*`, `SELECT_TREE_*`, `SELECT_TAGS`, `FILE_MULTIPLE` | `InputItemhandle.tsx:32`, `TextareaHandle.tsx:20`, `CheckTyprCodeRenderItem.tsx:309`, `SelectItemHandle.tsx:238`, `TreeSelectItemHandle.tsx:189`, `SelectedTagsItemRender.tsx:101`, `SharedUploadFile.tsx:224` |
| `min`, `max`, `controls` | `NUMBER_INPUT` | `CheckTyprCodeRenderItem.tsx:305,333` |
| `autoSize` | `TEXTAREA` | `TextareaHandle.tsx:18` |
| `acceptFile`, `max` | `FILE_MULTIPLE` | `CheckTyprCodeRenderItem.tsx:557` → `SharedUploadFile.tsx:225` |
| `value` | `TEXT_INPUT` | `InputItemhandle.tsx:140` (`initialValue`) |

**Chúng tôi KHÔNG cấp, và lý do khác nhau ở ba nhóm:**

1. **Không có nguồn tương ứng bên chúng tôi** — `styleLabel` (chuỗi class Tailwind; phía EVN dùng 5
   giá trị cố định, phổ biến nhất là chữ **trắng**, chỉ đúng trên nền màu của EVN) · `width` (bề rộng
   **cột bảng** trong `FORM_LIST`; bên chúng tôi là lưới form 24 cột — khác trục, quy đổi là đoán) ·
   `size` giới hạn dung lượng tệp · `fixed`, `isAdd`, `checkInfo`, `freeText`, `retchBy`.
2. **Hành vi động — ngoài phạm vi lát cắt này** — `isApi:true` + `data{path,method,query,body}` ·
   `OnChangeValue.fieldsRelevantReset` · `fillDataInForm` / `onChangeFillFields` · `hiddenWith` /
   `disableWith`. (Xem thêm T1: điều kiện ẩn/hiện của chúng tôi cũng không đi qua.)
3. **Khoá mà renderer tạo phiếu KHÔNG đọc** — `maxLength` (chỗ đọc duy nhất là
   `TextareaHandle.tsx:19` và nó **gán cứng `10000`**) · `styleValue` · `isWeb` · `valueCode` ·
   `valueType`. ⚠️ **Đây là chỗ chúng tôi cần phía EVN xác nhận**: chúng tôi chỉ đọc được hai cây
   `web-admin/src` và `core-service/src`; **app mobile và renderer PDF nằm ngoài tầm đo**. `isWeb`
   nghĩa đen là "tạo từ web" nên rất có thể **mobile** mới là nơi đọc nó.

**Câu hỏi:**
1. Với tập "có cấp" ở trên, renderer tạo phiếu **hiển thị và lấy được dữ liệu** chưa?
2. Nhóm 3 — có nơi nào ngoài hai cây trên đọc `isWeb` / `styleValue` / `valueCode` / `valueType`
   trên form **tạo phiếu** không? Nếu có, xin chỉ chỗ, chúng tôi bổ sung ngay.

| | |
|---|---|
| **Mặc định** | Cấp đúng 6 nhóm khoá trên; mọi khoá khác để trống và **liệt kê ra** (không im lặng bỏ) |
| **Sai thì hỏng gì** | Form render ra nhưng **không lấy được dữ liệu** — hỏng âm thầm, khó lần |

---

## 3. Chín câu có mặc định (không chặn, nhưng sai thì tốn công làm lại)

| # | Câu hỏi | Mặc định của chúng tôi | Sai thì hỏng gì |
|---|---|---|---|
| **Q1** | **Khoá của item.** Ví dụ §12.B (`:1418`) dùng `code`; serializer của phía EVN lại phát ra `itemCode` (`src/modules/form/service/forms.service.ts:107,218`); còn template JSON thật thì dùng `code` (2705/2709 node, `itemCode` 0/2709). Chúng tôi định **xuất cả hai khoá cùng một giá trị** — được không? | Xuất cả `code` và `itemCode` | Ingest bỏ rơi toàn bộ mã item ⇒ vỡ PK/FK lúc nạp |
| **Q2** | **`PCT_A_WORKING` chỉ đi từ `PCT_S_MODERATION`** (mục D2). Nghĩa là phiếu **không qua điều phối** thì không cấp được — đây là **chủ đích** hay là thiếu hàng trong bảng? | Theo đúng bảng: chỉ từ `PCT_S_MODERATION` | Nếu là thiếu hàng, chúng tôi sẽ chặn oan mọi phiếu không qua điều phối |
| **Q3** | **Hình dạng `ticketData` gửi lên endpoint C.** 🔴 **CHÚNG TÔI RÚT LẠI mặc định cũ ("chấp nhận cả hai dạng, tự dò") — xem T19.** Dạng scalar phẳng trong ví dụ §12.C (`:1447-1451`) **không chấm được**, và lý do nằm trong code của chính phía EVN. Câu hỏi rút gọn lại thành: phía EVN gửi **mảng hàng** hay gửi nguyên object `ticket_items.value`? | Nhận **mảng** hoặc `{ "data": [...] }`; dạng khác ⇒ **422** kèm giải thích | Xem **T19b** |
| **Q4** | **Guard xuyên phiếu.** Có nhóm điều kiện phải tra sang **phiếu khác** — ví dụ `getEmployeeCheckinByUserCode` (`ticket-action.service.ts:1211-1242`) hỏi *"nhân viên này có đang bận ở phiếu khác không"* bằng câu truy vấn có `te.ticket_id <> :ticketId`. Chúng tôi **không có** dữ liệu các phiếu khác, nên hiểu rằng **phía EVN tự giữ** nhóm này, còn endpoint C sẽ liệt kê chúng trong `outOfScopeGuards` để phía EVN biết cái gì **chưa** được kiểm. Đúng chứ? | Trả `outOfScopeGuards` | Phía EVN tưởng C đã kiểm hết ⇒ **bỏ lọt** điều kiện |
| **Q5** | **Mã cho container.** 10/12 loại container của chúng tôi (tabs, collapse, card, grid, step…) **không có tên định danh**, trong khi `FormItem.code` bên EVN là PK NOT NULL và phải nằm trong `form_item_codes` (ràng buộc #1, `:1466`). Chúng tôi định **sinh mã tất định từ đường dẫn cây** — nhưng mã đó sẽ **không** có trong danh mục. Chấp nhận mã layout ngoài danh mục, hay có cách khác? | Sinh mã tất định, ổn định giữa hai lần xuất | ~~Vỡ FK lúc nạp~~ — **đo lại 2026-08-10: KHÔNG vỡ** (xem T6), mã được tự thêm vào danh mục. Rủi ro thật là `form_item_codes` dài thêm sau mỗi lần nạp lại |
| **Q6** | **`validations`.** Ví dụ §12.B (`:1425-1427`) có mảng `validations`, và §14 mục 5 nói bên thứ ba có thể gửi thêm. Nhưng **template thật không có trường này** (0/2709 node) — ràng buộc bắt buộc chỉ thể hiện bằng `required: true` (**191** node đặt `true`; 290 node có khai khoá `required`). Vậy có nên gửi `validations` không? Nếu có, `form_item_validations.form_validate_code` là FK tới `form_validations.code` — xin danh sách mã hợp lệ | **Không** gửi `validations`; chỉ gửi `required` | FK không resolve lúc nạp |
| **Q7** | **Endpoint A** (`GET /external/workflow-definition`) **thay** `generateWorkflowForTicket` hay chạy **song song**? Chúng tôi thấy `WORKFLOW_PCT.json` hiện là read-model được sinh lại sau mỗi action; nếu endpoint A chạy song song thì sẽ có **hai nguồn sự thật** cho cùng một quy trình | ✅ **ĐÃ TỰ TRẢ LỜI — xem T23.** Chúng tôi quyết định **không làm A** và nêu đủ số đo. Câu hỏi còn để ngỏ chỉ còn: các anh có ý định **gỡ** `generateWorkflowForTicket` không? Nếu có thì chúng tôi mở lại | Hai nguồn sự thật cho cùng một quy trình — đúng vấn đề mà việc tích hợp này định gỡ |
| **Q8** | **§14 mục 2 & 3.** Template có phải **chừa sẵn** slot `*_SIGN` / `*_SIGNTIME` / `*_SIGNDATA` không? Và thứ tự trường cho PDF theo `typeFormItemPDF` (26 mã, `form.enum.ts:540`) là việc của bên nào? | Chừa slot **nếu form đã khai**; **không** tự sinh. Thứ tự PDF: mặc định là việc phía EVN | Ký số không gắn được giá trị; PDF sai thứ tự trường |
| **Q9** | **Tải thật của `/external/*`** khoảng bao nhiêu request/phút? | ✅ **ĐÃ LÀM XONG, không còn là câu chặn — xem T24.** Hạn mức **chính** nay là **300 request/60 giây cho mỗi KHOÁ API**; theo IP chỉ còn một trần chống lạm dụng 600/60 giây. Câu hỏi hạ xuống mức tham khảo: cho biết tần suất thật lúc cao điểm để chúng tôi chỉnh con số cho khớp | ~~Chặn nhầm traffic thật vào giờ cao điểm~~ — đã gỡ. Còn lại: nếu tải thật vượt 300/phút/khoá mà không ai báo thì vẫn chạm trần |

---

## 4. Xin dữ liệu (nếu tiện)

Chúng tôi đã tự trích được phần lớn từ source, nên phần này chỉ để **đối chiếu**, không chặn:

| bảng | vì sao vẫn cần | chúng tôi đã có gì |
|---|---|---|
| `ticket.action_role_status` (lọc PCT, **kèm cột `active`**) | biết bảng thật có bị **sửa tay sau khi seed** không, và hàng nào đang `active = false` | 34 hàng trích từ `ROLE_STATUS_ACTION_PCT` |
| `ticket.form_item_codes` (**kèm `active`**) | biết mã nào còn hiệu lực và có mã nào **mới thêm** sau thời điểm chúng tôi chụp source | 2142 mã trích từ source (xem T6); nhưng bảng thật của các anh còn dài hơn, nên chúng tôi vẫn cần bản export |
| `ticket.ticket_roles` | danh mục vai đầy đủ để validate `roleCode` xuất ra | `codeRoleEnum` trong source |

---

## 5. Thông báo — không cần trả lời, nhưng phía EVN cần biết

### T1. Phân quyền theo trường sẽ **không** đi qua được §12.B

Nền tảng của chúng tôi có RBAC **ở mức từng trường**: một trường có thể được cấu hình chỉ hiển thị với
một số vai (`permissions`), hoặc chỉ hiện khi thoả điều kiện (`visibleWhen`). Chúng tôi che ở **phía
server** — người không đủ vai thì API không trả về giá trị trường đó.

**Hợp đồng §12.B không có chỗ cho hai thuộc tính này.** Hệ quả: **trường nào chúng tôi che theo vai thì
sau khi xuất sang phía EVN sẽ hiển thị cho MỌI vai.**

Chúng tôi không coi đây là lỗi cần các bên sửa gấp — đó là ranh giới tự nhiên giữa hai mô hình. Nhưng
đây là **vấn đề lộ dữ liệu tiềm tàng phía EVN**, nên chúng tôi báo để phía EVN tự quyết. Về phần mình
chúng tôi sẽ: (1) ghi rõ trong tài liệu bàn giao; (2) **cảnh báo ngay lúc soạn form** — người soạn thấy
danh sách trường có `permissions`/`visibleWhen` trước khi xuất, chứ không bị bất ngờ.

Nếu phía EVN muốn giữ được lớp che này, cần thống nhất thêm một trường trong §12.B (ví dụ
`visibleForRoles: string[]` trên mỗi item). Chúng tôi sẵn sàng cấp nếu renderer đọc được.

### T2. Form **soạn theo danh mục của EVN** mới dùng được đầy đủ

*(Cập nhật 2026-08-10: mục này viết khi chúng tôi còn tưởng mã ngoài danh mục sẽ bị từ chối lúc nạp.
Số đo ở T6 cho thấy **không** — form vẫn xuất và vẫn nạp được. Điều dưới đây vẫn đúng về mặt **giá
trị sử dụng**, chỉ không còn đúng về mặt **chặn**; tiêu đề mục đã sửa theo.)*

Một form đặt tên trường tự do (`salary`, `department`…) vẫn xuất sang được, nhưng các tính năng của
EVN gắn với mã cụ thể sẽ không chạy cho những trường đó. Nghĩa là tính năng này thực chất là *"soạn
form EVN trên nền tảng của chúng tôi"*, không phải *"xuất mọi form sang EVN"*. Chúng tôi cảnh báo **ngay lúc soạn**
(kèm tên trường + lý do), chứ không để vỡ lúc phía EVN gọi.

---

## 6. Cập nhật sau khi hiện thực bộ xuất (P2b) — 6 điểm phía EVN cần biết

Phần này viết **sau** khi chúng tôi hiện thực xong bộ xuất và đo lại trực tiếp trên
`core-service` + `web-admin`. Có mấy chỗ khác với những gì chúng tôi nêu ở các mục trên; chỗ nào khác
đều ghi rõ.

### T3. Chúng tôi cần phía EVN cho biết **tên hiển thị của loại phiếu**

`formTypeName` là trường chúng tôi **không suy ra được**, và không dám tự đặt:
- `FormType.name` bên EVN là `NOT NULL`, nên **bỏ trống** ⇒ lần nạp **đầu tiên** của một loại phiếu
  chưa tồn tại sẽ hỏng vì ràng buộc cột.
- `saveFormType` là **upsert theo `code`**, nên **tự đặt** một tên (kể cả lấy chính mã, ví dụ `"PCT"`)
  sẽ **ghi đè tên thật đang hiển thị** của loại phiếu ấy — `"Công Tác"` biến thành `"PCT"`.

Cách chúng tôi làm: tên loại phiếu là **một tham số cấu hình của mỗi liên kết** (bên chúng tôi khai
lúc nối form ↔ ticketType). Khai rồi thì `formTypeName` được gửi kèm; chưa khai thì **bỏ khoá đó và
kèm một cảnh báo** trong phản hồi. Chúng tôi **không bao giờ đoán**.

👉 **Đề nghị:** khi mở một loại phiếu mới, phía EVN gửi cho chúng tôi cặp `(formTypeCode, formTypeName)`.

### T4. Mã trường tự sinh (`GEN_*`) sẽ làm **nở danh mục `form_item_codes`**

Hợp đồng của chúng tôi có những thành phần bố cục **không mang tên** (thẻ, khung, hàng ngang…), trong
khi `FormItem.code` bên EVN là `NOT NULL` và là một phần khoá chính. Chúng tôi vì thế **sinh mã tất
định theo vị trí trong cây**, dạng `GEN_CARD_0_2`.

Hai hệ quả cần phía EVN biết:
1. Mã `GEN_*` **không nằm trong danh mục mã chúng tôi đọc được** của EVN (xem T6). Vì `saveCreateFormItem` tự thêm mã mới (T6),
   chúng sẽ **được ghi vào `form_item_codes`** chứ không bị chặn.
2. Mã sinh theo vị trí **thay đổi khi người soạn CHÈN thêm một thành phần phía trước nó**. Mỗi lần
   xuất lại sau một lần chèn sẽ gieo thêm vài hàng `GEN_*` nữa.

👉 **Xin ý kiến:** phía EVN muốn (a) chấp nhận, (b) cho chúng tôi một tiền tố riêng đã thoả thuận, hay
(c) yêu cầu người soạn phải tự đặt mã cho **mọi** thành phần bố cục? Chúng tôi làm được cả ba.

### T5. Trùng mã trong một biểu mẫu ⇒ chúng tôi trả **422**, và đây **không** phải ca hiếm

Khoá chính của `form_items` là `(code, form_id)`. Hai trường cùng mã ⇒ `save()` lần hai là **UPDATE đè**
lên hàng thứ nhất: trường trước **biến mất, không báo lỗi**. Chúng tôi chặn ở phía mình bằng 422.

Điều đáng lưu ý: trong hợp đồng của chúng tôi, **danh sách lặp đóng phạm vi tên trường con** — một
trường `qty` ở ngoài và một trường `qty` trong mỗi dòng của danh sách là **hoàn toàn hợp lệ**. Sang
phía EVN thì hai cái đó là **một hàng**. Template của EVN tránh được là nhờ **quy ước đặt tiền tố**
(`NHAN_VIEN_LIST__ORDINAL`), không phải nhờ ràng buộc nào.

👉 **Xin xác nhận:** quy ước `<mã danh sách>__<mã trường>` có phải là chuẩn bắt buộc không? Nếu có,
chúng tôi sẽ **tự thêm tiền tố** thay vì báo 422 — nhưng việc đó đổi khoá dữ liệu gửi lên, nên chúng
tôi không tự ý làm.

### T6. 🔴 Sửa T2: mã ngoài danh mục **không bị từ chối** — nó được **tự thêm vào danh mục**

`form-items.service.ts` (`saveCreateFormItem`):
```ts
const codeExist = await this.formItemCodesRepository.findOne({ where: { code } })
if (!codeExist) await this.formItemCodesRepository.save({ code, description: label })
```
Không có FK nào vỡ; `form_item_codes` chỉ đơn giản là dài thêm. Và vì bảng này dùng chung với
`ticket_items`, mã rác ở đây là **rác toàn hệ thống**, không phải rác trong một form.

**✅ CHÚNG TÔI ĐÃ CHỐT (2026-08-10): để đi qua, kèm cảnh báo cho người soạn — xin phản đối nếu phía
EVN muốn khác.** Trước đó chúng tôi định trả 422 để giữ sạch danh mục của các anh, nhưng đã **bác bỏ
phương án đó bằng số đo**; xin nêu rõ căn cứ để các anh kiểm lại giúp:

- `saveCreateFormItem` là **đường ghi `form_items` duy nhất** trong toàn bộ `src/`
  (`formItemsRepository.save` đúng 1 chỗ, `form-items.service.ts:38`), và nó **tự thêm hàng
  `form_item_codes`** ngay trước đó, trong cùng transaction của `FormsService.create`. Không có FK
  nào vỡ.
- Không có lớp chặn nào khác trên đường đi: `CreateFormItemDto.code` chỉ là `@IsOptional() @IsString()`.
- Chính phía EVN đang dựa vào cơ chế này: `initTemplateForm()` nạp bộ template trong
  `public/files/templateJSON` qua đúng `create()` đó.
- ⇒ Nếu chúng tôi trả 422, chúng tôi sẽ **chặn oan** những biểu mẫu mà hệ thống của EVN nạp bình thường.

Thứ **thật sự** mất khi mã nằm ngoài danh mục không phải tính toàn vẹn dữ liệu mà là **hành vi**: các
tính năng gắn với mã cụ thể (tự động điền, ô ký) không chạy cho trường đó. Vì vậy chúng tôi cảnh báo
cho người soạn **lúc thiết kế biểu mẫu**, chứ không chặn lúc xuất.

Danh mục chúng tôi đối chiếu gồm **2142 mã**, trích tự động từ **ba** nguồn trong source của phía EVN:

1. `formItemCodeEnum` (`form.enum.ts`) — **398** mã khai báo.
2. Các họ mã `initFormItemCode()` tự sinh — `${action}_SIGN`/`_SIGNDATA`/`_SIGNTIME`, `DATE_TIME_*`,
   `DATE_*`. Phải gộp vì ô ký của các anh nhận diện bằng **hậu tố chuỗi** chứ không theo thành viên
   enum; chỉ đọc enum thì một trường ký **đặt tên đúng** vẫn bị chúng tôi báo là lạ.
3. **1813 mã trong 32 template ở `public/files/templateJSON`** — `initTemplateForm()` nạp chúng qua
   đúng đường tự-thêm-mã ở trên, nên chúng có mặt trong `form_item_codes` của mọi bản triển khai
   thật. Khoảng **1600 mã trong số này không có ở nguồn 1 và 2**; thiếu nguồn này thì một đơn vị dựng
   lại đúng phiếu PCT của các anh sẽ bị chúng tôi báo sai trên hơn nửa số trường.

⚠️ Chúng tôi hiểu rõ **2142 chỉ là cận dưới**, không phải nội dung bảng `form_item_codes` của các anh:
bảng đó còn dài thêm sau mỗi biểu mẫu bất kỳ ai nạp. Vì vậy chúng tôi chỉ **cảnh báo**, không kết luận
mã là sai. 👉 **Xin cho biết cách lấy bản đầy đủ** (mục xin export ở trên), và nơi lấy bản mới khi danh
mục thay đổi.

⚠️ Một hệ quả xin nêu trước: mã layout chúng tôi tự sinh (`GEN_*`, xem Q5) **sẽ** làm dài thêm
`form_item_codes` sau mỗi lần nạp lại, vì bảng này dùng chung toàn hệ thống.

### T7. Hai chỗ chúng tôi **tự nắn cấu trúc**, và một chỗ chúng tôi **từ chối**

Đều xuất phát từ hành vi có thật của renderer, không phải sở thích:

| | Đo được | Chúng tôi làm gì |
|---|---|---|
| Trường đặt ở **cấp ngoài cùng** | `WorkOrderRenderFormItem` chỉ có nhánh cho 11 mã; `default:` vẽ **con** chứ không vẽ chính nó ⇒ một trường đơn đặt ở gốc **không hiện ra gì cả**. Đúng như 8/8 template thật: gốc chỉ có container | **Tự gói** các trường đó vào một `CARD`, kèm cảnh báo |
| **Nhóm/bố cục đặt trong danh sách lặp** | Con của `FORM_LIST` thành **cột bảng**: `COLLAPSE`/`COMPONENT_HORIZONAL` bị `SharedEditTable` gom vào **cột nút xoá**, `CARD` rơi vào `default: return <></>` | **Từ chối (422)** — không có cách nắn nào giữ được ý người soạn |
| **Container lồng container** | Chạy tốt (`RenderFormItemInForm` định tuyến ngược lại đúng chỗ), kể cả trong `COMPONENT_HORIZONAL` | **Cho phép**, không cảnh báo |

### T8. `validations` — phía EVN **có** hỗ trợ, chúng tôi **chưa** dùng

Chúng tôi từng ghi ở Phụ lục C là "không gửi `validations`; chỉ gửi `required`". Nói vậy chưa đủ đúng:
`CreateFormItemDto.validations` tồn tại và `RenderFormItemInForm` **có** đánh giá `condition.regex`,
`condition.lt`/`gt` (so với trường khác, kể cả `KEY_CURRENT_TIME`) và `condition.between`.

Nghĩa là **đây là năng lực của EVN mà chúng tôi đang bỏ không**, chứ không phải thiếu sót của hợp đồng.
Ở lát cắt này chúng tôi **cảnh báo** thay vì im lặng, và sẽ ánh xạ ở một lát cắt riêng.

👉 **Xin dữ liệu:** vài ví dụ `validations` thật đang chạy (nhất là `between` và `lt`/`gt` trỏ tên
trường), để chúng tôi ánh xạ cho khớp thay vì đoán từ code renderer.

---

## 7. Cập nhật sau khi hiện thực `description` (P2c) — 4 điểm, trong đó **1 lỗi của phía EVN**

### T9. 🔴 Trường tệp không có `description` làm **VỠ màn tạo phiếu** — xin phía EVN vá

Đây là điểm quan trọng nhất trong tài liệu này.

`CheckTyprCodeRenderItem.tsx` có hàm `handleCheckDataInDescription` (dòng 66–110). Toàn thân hàm nằm
trong `if (_.size(description))` và **không có `return` nào ở ngoài** ⇒ khi `description` vắng (hoặc
là `{}`) hàm trả về `undefined`.

Mọi nhánh gọi hàm này đều tự vệ bằng `?? {}` — **trừ hai nhánh tệp**:

```ts
// dòng 538 — case ETypeForm.File
const { acceptFile, size: sizeFile } = handleCheckDataInDescription(description)
// dòng 557 — case ETypeForm.FileMutiple
const { acceptFile, size: sizeFile, max } = handleCheckDataInDescription(description)
```

⇒ `TypeError: Cannot destructure property 'acceptFile' of 'undefined'` — **hỏng cả màn hình**, không
chỉ một trường.

**Ảnh hưởng vượt ra ngoài tích hợp của chúng tôi:** bất kỳ ai nạp một `FILE`/`FILE_MULTIPLE` không kèm
`description` (qua API, qua import, hay soạn tay) đều làm sập màn tạo phiếu.

**Chúng tôi đã tự phòng vệ:** mọi trường tệp chúng tôi xuất ra **luôn** kèm `description` khác rỗng —
tối thiểu `{"acceptFile": ""}` (chuỗi rỗng vào `accept` = nhận mọi định dạng, `SharedUploadFile.tsx:225`,
nên không đổi ngữ nghĩa). Nhưng đây là **vá ở phía gửi**, không phải ở phía nhận.

👉 **Đề nghị:** thêm `?? {}` vào hai dòng trên, hoặc cho `handleCheckDataInDescription` một
`return {}` ở cuối.

### T10. Danh sách lựa chọn tĩnh: **tài liệu của EVN mâu thuẫn với code của EVN**

Chúng tôi gửi lựa chọn tĩnh theo dạng **lồng**:

```jsonc
"description": { "isApi": false, "data": { "data": [ {"label":"Nam","value":"M"} ] } }
```

Không phải vì thích, mà vì đó là **dạng duy nhất chạy được ở cả bốn control**:

| control | biểu thức đọc | mảng trần `data:[…]` | dạng lồng `data:{data:[…]}` |
|---|---|---|---|
| `SELECT`, `SELECT_MULTIPLE` | `data?.data ?? data` | ✅ | ✅ |
| `SELECT_TREE_ONE/_MULTIPLE` | `data?.data ?? data` | ✅ | ✅ |
| `SELECT_TAGS` | `data?.data ?? data` | ✅ | ✅ |
| **`RADIO`** | `handleCheckDataInDescription(description)?.data?.data` | ❌ **rỗng, im lặng** | ✅ |

Với mảng trần, `RadioItemHandle` lấy `mảng.data` = `undefined` ⇒ radio hiện **không lựa chọn nào**, và
không báo lỗi ở đâu cả.

⚠️ Trong khi đó **tài liệu và hằng số của phía EVN lại ghi dạng mảng trần**:
`core-service/src/modules/form/form.constant.ts:60-62` và `templateJSON/COMPONENT_TYPES.md:43`.

👉 **Xin xác nhận dạng nào là chuẩn.** Nếu phía EVN muốn mảng trần, xin sửa `RadioItemHandle.tsx:82`
trước; chúng tôi đổi theo trong một dòng.

⚠️ Thêm một điểm cần biết: **không template nào trong 32 template đang chạy dùng lựa chọn tĩnh**.
Cụ thể, riêng trong **8 template tạo phiếu** (thứ chúng tôi xuất ra), cả **136** chỗ có `data` đều là
`isApi: true`. Nghĩa là nhánh tĩnh **có code nhưng chưa từng chạy thật**. Xin phía EVN thử một biểu mẫu
có lựa chọn tĩnh trước khi nạp dữ liệu thật.

*(Con số 136 là đếm trên nhóm tạo phiếu, không phải trên cả 32 file — chúng tôi tách phạm vi vì đây
đúng là chỗ B4 từng nhầm.)*

### T11. Ô số: `min` vắng ⇒ phía EVN **tự chặn dưới ở 1**

`CheckTyprCodeRenderItem.tsx:305` khai `const { controls, max, min = 1, disable } = …`. Do đó một ô số
không khai `min` **không** là "không giới hạn" mà là "**nhỏ nhất bằng 1**" — người dùng không nhập được
`0` hay số âm. Cộng với việc bộ kiểm tra của EVN vốn đã từ chối giá trị `0` (xem Phụ lục C), một ô số
hợp lệ bên chúng tôi có thể trở thành ô **không gửi được** bên EVN.

Thêm nữa, khi có **cả** `min` và `max`, `onChange` (dòng 310–326) đặt giá trị ngoài khoảng về đúng số
`1` — **không phải về `min`** — nên với `min:5,max:10` thì gõ `12` sẽ ra `1`, thấp hơn cả `min`.

Chúng tôi **không tự bịa** `min` khi tác giả không khai; thay vào đó mỗi trường như vậy sinh một dòng
cảnh báo trong `warnings` của phản hồi.

👉 **Câu hỏi:** `min = 1` là chủ đích hay là giá trị mặc định sót lại? Nếu là sót, xin đổi thành
`min = undefined`.

### T12. Hai chỗ chúng tôi **nắn dữ liệu** khi xuất, xin phía EVN biết để khỏi bất ngờ

**a) `readOnly` của chúng tôi gộp vào `disable` của phía EVN — đây là siết chặt hơn.**
Hợp đồng của chúng tôi có ba mức: `readPretty` (hiện như văn bản thuần) > `readOnly` (không tương tác
nhưng **không** làm mờ) > `disabled` (làm mờ). Phía EVN chỉ có `disable`, ánh xạ thẳng sang `disabled`
của antd. Chúng tôi gộp `readOnly` **và** `disabled` thành `disable: true` — trường sẽ **mờ đi** dù tác
giả chỉ muốn khoá tương tác. `readPretty` thì không có chỗ nào để đặt, nên nó nằm trong danh sách cảnh
báo "không xuất đi".

**b) `accept` của trường tệp được viết lại thành danh sách phần mở rộng.**
Bên chúng tôi `accept` là thuộc tính HTML (nhận cả kiểu MIME: `image/*`, `application/pdf`). Bên phía
EVN, `SharedUploadFile.tsx:73-79` tách theo dấu phẩy, gọi `ext.replace('.','')` (**chỉ dấu chấm đầu
tiên, không cắt khoảng trắng**) rồi so khớp **tuyệt đối** với phần mở rộng đã hạ chữ thường
(`fileUtil.ts:6-9,30-34`).

Hệ quả nếu gửi nguyên văn: `image/*` không khớp gì cả · `.PDF` thành `PDF` nên **trượt chính định dạng
nó khai** · `.pdf, .docx` cho ra `" docx"` (còn dấu cách). Tức là trường tệp **không nhận được tệp nào**.

Vì vậy chúng tôi chỉ gửi các mục dạng `.ext`, hạ chữ thường, và **liệt kê trong `warnings`** những mục
bị bỏ. Nếu không còn mục nào hợp lệ, chúng tôi gửi `acceptFile: ""` (nhận mọi định dạng) chứ không gửi
một bộ lọc không khớp gì.

👉 **Câu hỏi:** phía EVN có định hỗ trợ kiểu MIME trong `acceptFile` không? Nếu có, chúng tôi bỏ bước
nắn này.

---

## 8. Cập nhật sau khi hiện thực endpoint C — 12 điểm, trong đó **5 lỗi của phía EVN**

*(T13–T22 là endpoint C — T19b là phần bổ sung của T19, không đếm riêng; **T23** là quyết định không
làm endpoint A; **T24** là hạn mức gọi API.)*

Endpoint C `POST /external/check-transition` **đã chạy**. Nó trả `allowed`, `nextStatus`,
`ambiguousNext`, `coverage`, **`definitionVersion`** và `message` — **sáu trường này LUÔN có mặt** —
cùng với `outOfScopeGuards`, `requiredFields`, `unverifiedFields`, **`progress`** và
**`unverifiedWorkflow`** **trừ khi `coverage` là `NO_TABLE`** (xem T17, T19, **T21** cho
`definitionVersion`, và **T22** cho `progress`). Dưới đây là những gì chúng tôi phát hiện khi dựng
nó, và những gì vẫn còn chặn.

### T13. 🔴 Chúng tôi **dựng lại** bảng `action_role_status` từ source của phía EVN — xin xác nhận

Chúng tôi đã **không** chờ export nữa (câu Q8 cũ). `initActionRoleStatus()`
(`ticket-action.service.ts:230`) `clear()` rồi dựng lại toàn bộ bảng từ hằng số **cùng repo**, nên
bảng dựng lại được. Kết quả: **307 hàng PCT** từ **hai** nguồn —
`ROLE_STATUS_ACTION_PCT` (**34 hàng khai báo**) và vòng lặp `ticket-action.service.ts:245-471`
(**273 hàng nữa**, tức **89%**). Hai chuyển trạng thái thật `PCT_A_HALT`→`PCT_S_HALT` và
`PCT_A_POSTPONE`→`PCT_S_POSTPONE` **chỉ có ở phần vòng lặp**.

👉 **Xin xác nhận con số 307 khớp bảng đang chạy ở môi trường của phía EVN.** Nếu lệch, gần như chắc
chắn là do một trong hai điểm T14/T15 bên dưới.

### T14. 🔴 `initActionRoleStatus` **nuốt lỗi giữa chừng** ⇒ bảng thật có thể dở dang mà không ai biết

Hàm bọc toàn bộ vòng seed trong `try { … } catch (error) { return error }`
(`ticket-action.service.ts:231, 758-760`) **dưới `@Transactional()`**. Một lời gọi `save()` hỏng
giữa chừng sẽ commit một bảng **dựng dở** và **trả lỗi ra như một giá trị trả về bình thường** —
không log, không ném. Đây là lý do nhiều khả năng nhất khiến số hàng thật lệch khỏi 307.

👉 **Đề nghị:** log và ném lại trong `catch`.

### T15. 🔴 80 hàng `LCT_R_*` đang nằm trong nhánh **PCT** của vòng lặp

Hai nhánh LCT nằm bên trong vòng lặp trạng thái PCT (`ticket-action.service.ts:377-406` và
`:452-470`), sinh ra **80 hàng** gắn vai `LCT_R_*` vào **trạng thái PCT**. Nhìn giống lỗi copy-paste.
Chúng tôi **loại chúng ra** khỏi bảng PCT của mình.

👉 **Xin xác nhận đây là lỗi**, để chúng tôi khỏi phải mô phỏng theo.

### T16. Danh sách guard mà endpoint C **không** phán — và **hai** bề mặt guard, không phải một

`allowed: true` của chúng tôi nghĩa là *"không guard nào TRONG PHẠM VI C bị vi phạm"*, **không** phải
*"được phép tuyệt đối"*. Vì vậy mỗi phản hồi **có `coverage` khác `NO_TABLE`** đều kèm
`outOfScopeGuards`.

Khi dựng danh sách đó chúng tôi thấy phía EVN có **hai** bề mặt guard, và ban đầu chúng tôi chỉ thấy
một:

| Bề mặt | Ở đâu | Bản chất |
|---|---|---|
| **Tiền-kiểm** | `getActionForUserByTicketId` (`ticket-action.service.ts:781-1069`) — **31** chỗ `addAction = false` | quyết định user được **mời** làm gì |
| **Đường ghi** | `updateStatus` (`ticket.service.ts:4779+`) | ném `BadRequestException` và từ chối |

Endpoint C là **tiền-kiểm**, nên bề mặt thứ nhất mới là thứ nó thay thế. Một vài guard trong đó
**không request per-phiếu nào chở nổi dữ liệu** — ví dụ `getEmployeeCheckinByUserCode` truy vấn
`ticket_employees` **xuyên các phiếu khác** (vị từ `te.ticket_id <> :ticketId`,
`ticket-action.service.ts:1242`). Những guard đó **vĩnh viễn** thuộc phía EVN.

👉 **Không cần trả lời**, nhưng xin biết: `outOfScopeGuards` sẽ **dài** (**19** action PCT có
guard). Đó là số đo, không phải chúng tôi thận trọng quá mức.

⚠️ **Con số này là 19 chứ không phải 21 như bản trước của tài liệu.** Chúng tôi đã rút
`CHTT_IS_WORKING` khỏi `PCT_A_HALT` và `PCT_A_POSTPONE`: hai action đó **bị comment** trong
`CHTT_ACTION` (`ticket.constant.ts:1656-1657`), còn bộ trích của chúng tôi thì đọc nhầm chúng thành
thành viên sống. Sai theo **chiều an toàn** (thừa một lượt kiểm), và bản sửa khớp lại số đo P4a rằng
hai action này **không** đi qua `updateStatus`.

### T17. ⚠️ Vẫn chặn: **B1**, và một hệ quả mới của nó

Ba action `PCT_A_ALLOW` / `PCT_A_HANDOVER` / `PCT_A_END` vẫn có **2 hàng cùng khoá 3 cột**. Thiếu
`ticketRoles[]`, C trả `nextStatus: null` + `ambiguousNext: [...]` và **tuyệt đối không đoán**.

**Hệ quả mới, quan trọng hơn câu hỏi gốc:** tập vai gửi lên **phải là tập CHƯA lọc `active`**. Cổng
thật khi thực hiện action là `checkPermisstionToAction`
(`ticket.service.ts:8105-8135`, gọi từ `updateStatus:4737`) — nó left-join `ticket_role_values`
**không có** vị từ `active` (`:8110`). Chỉ bản **liệt kê** `getActionStatusNext` mới lọc
(`ticket-action.service.ts:2587`). Gửi nhầm tập con `active` thì C sẽ trả `allowed: false` cho
action mà phía EVN **cho qua**.

👉 **Xin bổ sung `ticketRoles: [{roleCode, userCode}]` vào request §12.C, KHÔNG lọc `active`.**

**Endpoint C có đúng HAI trường hợp trả `allowed: false`** *(mục này đã được **viết lại** ở lát cắt
P4c — bản trước nói "đúng MỘT trường hợp" và nói thêm rằng chừng nào chưa có `ticketRoles` thì C
không thể từ chối bất cứ điều gì. **Câu thứ hai nay không còn đúng**, nên chúng tôi sửa thẳng vào
đây thay vì để nó nằm lại như một ghi chú cũ)*:

1. **Sai vai** — request **có** `ticketRoles` và bảng **có** hàng cho `(trạng thái, action)` nhưng
   **không hàng nào** thuộc vai mà người thực hiện đang giữ trên phiếu; đúng chỗ
   `checkPermisstionToAction` trả `isPermission = false`.
2. **Thiếu nội dung bắt buộc** (mới ở P4c) — request **có** `ticketData`, action nằm trong **5**
   action mà `ACTION_FINISH_CONTENT` phủ, và có ít nhất một hàng thiếu cờ đánh dấu. Trường hợp này
   **không cần `ticketRoles`**. Chi tiết ở **T19**.

Mọi trường hợp "chúng tôi không **tra** được" vẫn trả **`allowed: true`** kèm `coverage` — quy tắc
đó không đổi. Điều đổi là: **"không tra được bảng"** và **"chấm được nội dung và thấy thiếu"** là hai
câu khác nhau, và cái thứ hai bây giờ C trả lời được.

**Một điểm về `ticketTypeCode`:** ở endpoint **B**, `ticketTypeCode` là **từ vựng của phía EVN** và
được phân giải theo *binding* của từng tenant. Ở endpoint **C** thì không: C trả lời từ **bảng PCT
của chính phía EVN**, **bất kể** tenant có binding hay không. Gửi một `ticketTypeCode` khác `PCT` sẽ
nhận `coverage: "NO_TABLE"` — không phải lỗi, mà là "chúng tôi không giữ bảng cho loại phiếu này".
Trong đúng trường hợp đó, phản hồi **không có** trường `outOfScopeGuards` — cùng một luật với
`requiredFields`/`unverifiedFields` ở T19: một danh sách rỗng sẽ đọc thành *"đã soát, không còn gì
phải kiểm"*, trong
khi với loại phiếu đó chúng tôi **chưa đo gì cả**.

⚠️ **`definitionVersion` là ngoại lệ CÓ CHỦ ĐÍCH của luật vừa nói** — nó **vẫn có** trong phản hồi
`NO_TABLE`. Ba trường kia là **khẳng định về phiếu của các anh**; `definitionVersion` là khẳng định
về **chính chúng tôi** (đang chạy bản chụp bảng nào), và nó đúng như nhau bất kể các anh hỏi gì. Bỏ
nó ở đây còn xoá mất tín hiệu ngay trên phản hồi mà "các anh đang nói chuyện với bản nào" gần như là
toàn bộ nội dung có thật. Xem **T21**.

### T18. Điểm hợp đồng chúng tôi **cố ý** làm khác tài liệu *(trước là hai; điểm 1 đã đóng ở P4c)*

1. ~~**`requiredFields` chưa có trong phản hồi.**~~ — **ĐÃ CÓ từ lát cắt P4c, xem T19.** Ghi chú cũ:
   chúng tôi bỏ trống hẳn trường thay vì trả `[]`, vì `[]` đọc thành *"đã kiểm, không thiếu gì"*
   trong khi chúng tôi chưa kiểm.
2. **Ví dụ §12.C trong tài liệu sai so với bảng thật** (`PCT_S_CREATED` + `PCT_A_WORKING`). Bảng chỉ
   có **một** hàng cho `PCT_A_WORKING`, và nó bắt đầu từ `PCT_S_MODERATION`. C trả
   `coverage: "TABLE_INCOMPLETE"` cho ví dụ đó — **không từ chối**, nhưng cũng không đoán.

### T19. `requiredFields` — endpoint C **đã chấm được** `checkContentFinished` (P4c)

Chúng tôi trích `ACTION_FINISH_CONTENT` (`ticket.constant.ts:911`) thành dữ liệu — **13 cặp
`item × mark` trên 5 action PCT** (`PCT_A_ALLOW` 4 · `PCT_A_HANDOVER` 5 · `PCT_A_ALLOW_HANDOVER` 2 ·
`PCT_A_END` 1 · `PCT_A_CONFIRM_LOCK` 1) — và chấm chúng bằng đúng một điều kiện JSONLogic mô phỏng
nhánh `type: OBJ` của `checkContentFinished` (`ticket.service.ts:5478-5486`).

**Phản hồi có thêm hai trường** (cả hai **vắng mặt** khi `coverage: "NO_TABLE"`, cùng luật với
`outOfScopeGuards`):

| Trường | Nghĩa |
|---|---|
| `requiredFields: [{itemCode, mark}]` | Cặp **đã chấm** và **thiếu**. Khác rỗng ⇒ `allowed: false` |
| `unverifiedFields: [{itemCode, mark, type, reason}]` | Cặp **chưa chấm được**, kèm lý do |

`reason` có đúng **bốn** giá trị:

| `reason` | Nghĩa |
|---|---|
| `TICKET_DATA_ABSENT` | Request không gửi `ticketData` (hoặc gửi `null`) ⇒ chúng tôi không chấm gì |
| `ITEM_ABSENT` | Có `ticketData` nhưng không có khoá cho item này |
| `TRUTHINESS_DISAGREEMENT` | Cờ đánh dấu mang **mảng rỗng** — xem gạch đầu dòng thứ ba bên dưới |
| `PAIR_NOT_MODELLED` | Cặp không phải `type: OBJ` có `mark` — điều kiện của chúng tôi không mô phỏng nhánh đó, nên chúng tôi không chấm. **Hôm nay không xảy ra** (13/13 cặp đều `OBJ`); nó tồn tại để nếu phía EVN thêm cặp `LIST` thì chúng tôi **im lặng không phán** thay vì phán sai |

🔴 **`CONTENT_FINISHED` chỉ được gỡ khỏi `outOfScopeGuards` khi `unverifiedFields` rỗng.** Còn một
cặp chưa chấm thì guard vẫn nằm đó — nghĩa là phía EVN vẫn phải tự kiểm.

**Ba điều xin nói thẳng, vì chúng giới hạn giá trị của trường này:**

- **Chúng tôi chấm trên `ticketData` của request, phía EVN chấm trên `ticket_items` trong DB của
  các anh** (`ticket.service.ts:5437`, `:5452`). Không có gì ràng buộc hai nguồn đó bằng nhau. Nếu
  payload không phản ánh đúng dữ liệu phiếu thì `requiredFields: []` **không có giá trị gì**.
- **Thiếu khoá thì chúng tôi KHÔNG từ chối.** Đo được: phía EVN lấy item với `active: true`, không
  có hàng thì `_.forEach` chạy **0 vòng** ⇒ **cho qua**. Một phiếu PCT không khai mục 2.5 là phiếu
  hợp lệ. Nên khoá vắng ⇒ vào `unverifiedFields` (`reason: "ITEM_ABSENT"`), **không** 422.
- **Một chỗ chúng tôi khắt khe hơn các anh, và chúng tôi từ chối đoán:** nếu cờ đánh dấu mang **mảng
  rỗng**, `_.forEach` của các anh **cho qua** còn JSONLogic của chúng tôi **đánh trượt**. Gặp hàng
  như thế chúng tôi **giữ nó lại khỏi phép chấm** và chấm những hàng còn lại; nếu phần còn lại vẫn
  **trượt** thì đó là từ chối chắc chắn (`requiredFields`), chỉ khi phần còn lại **đạt** thì cặp mới
  vào `unverifiedFields` (`reason: "TRUTHINESS_DISAGREEMENT"`). Nói cách khác: điều không chắc chỉ
  làm mất một câu "đạt", **không bao giờ** nuốt mất một câu "trượt".

**Hai khác biệt nhỏ nữa, ghi cho đủ:**

- Cờ đánh dấu là **scalar** (`0`, `""`, `false`) nằm thẳng ở giá trị item — tức `ticketData[CODE]`
  không phải mảng — thì chúng tôi trả **422** (xem T19b) trong khi `_.forEach` của các anh không lặp
  và **cho qua**. Chiều an toàn, nhưng khác.
- Một hàng là `null` (`[null]`): `valueItem[mark]` bên các anh **ném `TypeError`**
  (`ticket.service.ts:5481`) ⇒ HTTP 500; chúng tôi trả `allowed: false`. Chúng tôi **không** mô
  phỏng lỗi đó.

### T19b. 🔴 Hình dạng `ticketData`: chúng tôi **rút lại** mặc định cũ ở Q3

Trước đây chúng tôi ghi *"chấp nhận cả hai hình dạng, tự dò"*, hiểu là dạng `.data` **và** dạng scalar
phẳng trong ví dụ §12.C (`:1447-1451`). **Dạng phẳng không nhận được**, và lý do nằm trong code của
chính phía EVN: `_.forEach("Trạm 110kV Thủ Đức", …)` duyệt **từng ký tự**, nên `valueItem[mark]` là
`undefined` và `checkContentFinished` của các anh **cũng đánh trượt** nó. Không có cách đọc nào của
dạng đó khớp với hành vi thật, nên chúng tôi không bịa ra một cách.

Endpoint C nhận: **mảng hàng** `[{...}]`, hoặc object `{ "data": [...] }`. Hình khác ⇒ **422** với
`errors` nêu **tên item và hình dạng mong đợi** (không bao giờ nêu giá trị các anh gửi).

Đây là lỗi duy nhất phát sinh từ **nội dung** của một request đã hợp lệ và đã xác thực. Endpoint C
vẫn trả các lỗi thông thường khác của bề mặt: **401** (thiếu/sai khoá API), **400** (thiếu trường bắt
buộc, sai kiểu, **hoặc sai dạng** — ví dụ `definitionVersion` chứa ký tự ngoài tập cho phép ở T21 —
do `ValidationPipe`), **429** (chạm hạn mức — xem **T24**, kể cả tên header trả kèm).

⚠️ **Thân lỗi KHÔNG phải một phán quyết.** Sáu trường luôn-có-mặt nêu ở đầu §8 (gồm cả
`definitionVersion`) chỉ thuộc về phản hồi **200**; thân của 400/401/422/429 **không** mang chúng —
vì ở đó chúng tôi **chưa kết luận gì**, nên không nên gắn dấu vết của một kết luận.

⚠️ Nói rõ để khỏi hiểu nhầm theo chiều ngược lại: **422 CÓ phụ thuộc bảng.** Việc khoá nào bị soi
đến từ `ACTION_FINISH_CONTENT` (T19) — tức là dữ liệu mà `definitionVersion` có phủ — nên khi chúng
tôi sinh lại bảng thì **một request hôm nay trả 200 có thể ngày mai trả 422**. Chỉ *luật hình dạng*
(`[{...}]` hay `{ "data": [...] }`) mới là phần không nằm trong version.

⚠️ **Chúng tôi chỉ soi những khoá mà action đang hỏi tham chiếu tới.** `ticketData` có thể chứa item
khác sai hình dạng mà vẫn được trả lời bình thường — chúng tôi không đọc chúng, nên không phán về
chúng. Nghĩa là 422 nói *"khoá tôi CẦN đọc thì không đọc được"*, chứ không phải *"payload của các anh
sạch"*.

👉 **Xin xác nhận phía EVN gửi hình nào**, để chúng tôi bỏ bớt một nhánh dò.

### T20. Ba điểm trong `checkContentFinished` phía EVN nên xem lại

Không chặn việc tích hợp; chúng tôi gặp khi đọc kỹ để mô phỏng.

1. **`changeStatus = false` trong `checkContentFinished` không có tác dụng** (`:5474`, `:5482`,
   `:5490`). `changeStatus` là **tham số truyền theo giá trị** (`:5421`), chỗ gọi (`:4793`, `:4796`)
   chỉ dùng `isError`. Hôm nay vô hại vì `isError` đủ dùng, nhưng đoạn code đọc như thể nó có tác dụng.
2. **`return` bên trong `_.forEach` không thoát vòng lặp** (`:5460`, `:5467`, `:5476`, `:5484`,
   `:5492` — **năm** chỗ).
   lodash chỉ dừng khi callback trả về đúng `false`. Kết quả cuối vẫn đúng vì `messErr` được gán
   **trước** `return`, nhưng hệ quả là **`messErr` chỉ là một chuỗi chung** — phía EVN **không nói
   được item nào thiếu**. Đó chính là khoảng trống mà `requiredFields` của T19 lấp.
3. **`checkContentFinished` có hai chỗ gọi** (`:4796` trong `updateStatus`, `:19625` trong
   `updateDataSync`) và **hai bản sao logic inline** (`:8490+`, `:8723+`) tính cờ `checkDone` cho
   thông báo. Bốn chỗ đọc cùng một bảng bằng bốn đoạn code — sửa bảng thì phải nhớ cả bốn.

### T21. `definitionVersion` — cách phát hiện bảng của chúng tôi đã trôi so với lúc các anh kiểm thử

Endpoint C trả lời bằng **bản chụp bảng của chính phía EVN** mà chúng tôi dựng lại từ source (T13).
Khi phía EVN sửa source và chúng tôi sinh lại, **mọi câu trả lời của C có thể đổi mà không một dòng
code nào của chúng tôi đổi**. `definitionVersion` đặt tên cho bản chụp đó.

- **Hình dạng:** chuỗi dạng `pct-<16 ký tự hex>`. Tiền tố `pct-` gọi tên **bộ bảng PCT mà bản
  triển khai này đang giữ**. Giá trị **giống nhau trên mọi phản hồi của cùng một bản triển khai** —
  kể cả phản hồi `NO_TABLE` về một loại phiếu khác; ở đó nó vẫn trả lời *"các anh đang nói chuyện
  với bản nào"*, chứ **không** tự nhận là version định nghĩa của loại phiếu đó.
- **Ghim (tuỳ chọn):** gửi kèm `definitionVersion` trong request — **chuỗi 1–100 ký tự, chỉ gồm
  chữ cái ASCII `a–z`/`A–Z`, chữ số, `_`, `.`, `:`, `-`**; ngoài tập đó ⇒ **400** (giá trị này được
  chép **nguyên văn** vào `message`, nên chúng tôi chặn xuống dòng, dấu backtick, khoảng trắng và ký
  tự điều khiển; chữ có dấu cũng bị chặn). ⚠️ **Không ghim thì BỎ HẲN trường**, đừng gửi chuỗi rỗng
  — chuỗi rỗng là **400**. Lưu ý phân biệt: chúng tôi
  ràng buộc **dạng**, chứ **không** ràng buộc **giá trị** — ghim một bản mà bản triển khai này chưa
  từng giữ là hợp lệ và vẫn được trả lời. Nếu khác bản chúng tôi đang chạy,
  chúng tôi **thêm một câu vào `message`** và **không đổi gì khác** — `allowed`/`nextStatus` giữ
  nguyên. Ghim sai **không phải là lỗi**, và tuyệt đối không phải lý do để từ chối: C là **tiền-kiểm
  tư vấn**, còn việc các anh ghim bản cũ là chuyện triển khai phía các anh, không phải chuyện cái phiếu.
- **Câu đó dành cho NGƯỜI đọc log, không phải cho máy parse.** Nếu phía các anh muốn rẽ nhánh theo
  nó thì đã có sẵn cả hai vế — bản các anh ghim, và `definitionVersion` chúng tôi trả — nên một cờ
  boolean nữa chỉ là thêm một thứ phải giữ cho đúng mà không thêm thông tin nào.
- 🔴 **Giới hạn, nói thẳng: nó phủ DỮ LIỆU, KHÔNG phủ CODE.** Nó trả lời *"tôi đang soi bản chụp nào
  của bảng"*, **không** trả lời *"cách chấm của tôi có đổi không"*. Đã có tiền lệ thật: ở lát cắt
  trước, một lỗi thuần logic phía chúng tôi (mảng rỗng bị JSONLogic coi là sai) làm đổi kết luận mà
  **không đụng một byte dữ liệu nào** — `definitionVersion` sẽ **không** nhúc nhích ở lần đó. Chúng
  tôi công bố giới hạn này thay vì thêm một con số phải nhớ tay tăng, vì loại cổng đó sẽ mục.

✅ **Điều kiện vận hành nói ở các bản trước đã được xử lý xong** — hạn mức **chính** nay tính theo
**khoá API** (300 request/60 giây cho mỗi khoá) chứ không theo IP, nên việc gọi C ở tần suất cao từ
một IP egress chung không còn bị trần 120/phút cũ chặn. (Vẫn còn một **trần theo IP là 600
request/60 giây** cho traffic có khoá — lưới chống lạm dụng, không phải hạn mức chính; chỉnh được
bằng biến môi trường.) Chi tiết, tên header và giới hạn ở **T24**.

### T22. `progress` — phiếu đang ở đâu trong luồng, **chiếu lại chứ không tính lại**

Endpoint C nay trả thêm `progress`: vị trí của phiếu trên **15 node** của `WORKFLOW_PCT.json`.

- **Nguồn là dữ liệu phía EVN đã lưu, không phải mô phỏng.** Chúng tôi đọc `WORKFLOW_NODES` trong
  `ticketData` — đúng thứ `saveWorkflowNodes` ghi ra — rồi đối chiếu với định nghĩa 15 node. Chúng
  tôi **không** chạy lại `checkConditionMethod`, và **không** dựng lại `generateWorkflowForTicket`.
  Nếu chạy lại, chúng tôi sẽ thành **nguồn sự thật thứ hai** cho cùng một luồng — đúng thứ mà câu
  **Q7** khuyến nghị tránh, và là lý do chúng tôi khuyên **không làm** endpoint A.
- **Vì thế `progress` mô tả trạng thái TRƯỚC action đang hỏi**, không phải sau. C là **tiền-kiểm**;
  lệch một nhịp ở đây là hiểu nhầm dễ xảy ra nhất nên chúng tôi nói thẳng ra.
- **Hình dạng:** `{ nodes: [...], completed, total, unknownNodes }`. Mỗi node có `nodeCode`,
  `order` (1–15, đúng `priority` của các anh), `state`, và `completedBy` — **danh sách mã action
  đóng node đó, đọc từ `condition.complete`**, chứ không suy từ tên node. Node `FINISHED` đóng theo
  **node khác** (`NODE_COMPLETED`) nên nó mang **thêm** `completedByNode`, còn `completedBy` của nó
  là `[]`. Hai trường này loại trừ nhau: `completedBy: []` **chỉ** xuất hiện cùng `completedByNode`,
  nên `[]` không bao giờ có nghĩa *"chúng tôi trích không ra"*.
- **`state`** là một trong `ADDED` / `PROCESSING` / `COMPLETED` — **nguyên văn ba giá trị
  `EWorkflowNodeEdgeStatus` của các anh** — hoặc **`NOT_REACHED`**, là **tên của chúng tôi** cho node
  chưa có mặt trong bản đã lưu. Các anh không có trạng thái này, nên chúng tôi không mượn tên nào của
  các anh cho nó.
- 🔴 **Đọc không ra ⇒ `progress: null`, KHÔNG BAO GIỜ là `completed: 0`.** Khoá `progress` **luôn có
  mặt** (trừ `NO_TABLE`), và `null` nghĩa là *"chúng tôi không đọc được"*, kèm lý do trong
  `unverifiedWorkflow`. Một con số 0 ở chỗ này sẽ đọc thành *"đã soi, phiếu chưa đi bước nào"* —
  khẳng định mạnh nhất từ hiểu biết ít nhất. Đây đúng là lý do `unverifiedFields` ra đời (T19).
- **Đủ bộ `reason` để các anh rẽ nhánh** — chỉ có **năm** giá trị, không hơn:

  | `reason` | Nghĩa |
  |---|---|
  | `TICKET_DATA_ABSENT` | không gửi `ticketData` (hoặc gửi `null`) |
  | `ITEM_ABSENT` | có `ticketData` nhưng không có khoá `WORKFLOW_NODES` (hoặc khoá đó `null`) |
  | `ITEM_UNREADABLE` | giá trị không phải map node — xem gạch đầu dòng dưới |
  | `NODE_UNREADABLE` | một node **thuộc 15 node chúng tôi biết** không phải object (node lạ thì vào `unknownNodes`, không phải lý do này) |
  | `STATUS_NOT_MODELLED` | một node **thiếu** `status`, hoặc mang `status` ngoài ba giá trị của các anh |

  Cả năm đều **không** phải lỗi và **không** làm hỏng phản hồi: `allowed`/`nextStatus` không đổi vì
  chúng, và endpoint **không** trả 422 cho bất kỳ ca nào ở đây.
- **Nhận cả hai hình dạng** như T19b: `{"WORKFLOW_NODES": {"data": {...}}}` hoặc map node trần.
  🔴 **Nhưng phải là map NODE.** Nếu các anh gửi nguyên hàng `ticket_items`
  (`{id, code, ticketId, value:{data:{...}}}`) thì chúng tôi trả `ITEM_UNREADABLE` chứ **không** đọc
  thành phiếu chưa đi bước nào. Quy tắc: map **có khoá nhưng không khoá nào là mã node** ⇒ đọc không
  ra. Map **rỗng** thì khác: chính các anh đọc item này bằng `?.value?.data || {}`, nên một bên gọi
  dựng `ticketData` theo đúng cách đó sẽ gửi `{}` cho phiếu chưa có hàng nào — với họ, `completed: 0`
  là câu trả lời thành thật. (Chúng tôi **không** nói rằng các anh *lưu* `{}`: `saveWorkflowNodes`
  thoát sớm khi map rỗng, nên hàng đã lưu luôn khác rỗng.)
- **Node lạ ⇒ không từ chối**: mã node có trong dữ liệu mà định nghĩa của chúng tôi không biết được
  liệt kê ở `unknownNodes`. Đó là **trôi định nghĩa** — thứ `definitionVersion` sinh ra để lộ diện —
  chứ không phải lỗi của phiếu.
- ⚠️ **Bảng 15 node NẰM TRONG `definitionVersion`.** Các anh sửa `WORKFLOW_PCT.json`, chúng tôi sinh
  lại, thì `definitionVersion` **đổi**. (Vì việc này, giá trị của nó đã đổi một lần so với lúc T21
  được viết.)
- ⚠️ **Giá phải trả, nói trước:** khối `nodes` làm phản hồi dài thêm khoảng **1,8 KB**. Phần **định
  nghĩa** trong đó (`nodeCode` / `order` / `completedBy` / `completedByNode`) là **giống hệt nhau ở
  mọi phản hồi** của cùng một bản triển khai, nên nếu các anh gọi C ở tần suất cao thì nó **cache
  được theo `definitionVersion`** — khoá đó đổi đúng khi và chỉ khi bảng đổi. Chỉ `state`,
  `completed` và `unknownNodes` là thay đổi theo từng phiếu.
- 🔴 **Giới hạn, nói thẳng:** `state` do **code phía EVN** ghi ra, không phải do người gọi gõ. Nếu
  các anh thêm một thành viên mới vào `EWorkflowNodeEdgeStatus`, `progress` sẽ thành `null` cho
  **mọi** phiếu cùng lúc, và `definitionVersion` **sẽ không** nhúc nhích — chúng tôi băm **bảng** của
  các anh, không băm **enum** của các anh. Xin báo trước cho chúng tôi khi thêm.

### T23. 🔴 Endpoint A — chúng tôi **quyết định KHÔNG làm**, và đây là số đo dẫn tới quyết định đó

Đây là câu trả lời của chúng tôi cho **Q7**. Chúng tôi **không** xây `GET /external/workflow-definition`.
Nói ra kèm bằng chứng, thay vì làm rồi để hai bên lệch nhau.

**Lý do 1 — hai bên đang mô hình hoá HAI THỨ KHÁC NHAU, không phải hai cú pháp của một thứ.**

| | Mô hình của chúng tôi | Mô hình của các anh (`WORKFLOW_PCT.json`) |
|---|---|---|
| Node là gì | một **trạng thái** của phiếu | một **bước** trong luồng |
| Cạnh là gì | `action` đưa phiếu **từ X sang Y** | quan hệ hiển thị giữa các bước |
| Tiến triển đo bằng | trạng thái hiện tại | ba pha `add` / `process` / `complete` mỗi bước |

Transition của chúng tôi **không có** khái niệm ba pha; node của các anh **không có** khái niệm
`from → to`. Đây chính là lý do endpoint C phải giữ **hai bảng riêng**: bảng chuyển trạng thái (trả
`nextStatus`) và bảng 15 node (trả `progress`, T22). Chúng trả lời hai câu hỏi khác nhau, và không
bảng nào suy ra được bảng kia.

**Lý do 2 — ngôn ngữ điều kiện: của chúng tôi MỞ, của các anh ĐÓNG.**
Guard trong hợp đồng của chúng tôi là **JSONLogic tự do** (ví dụ có thật:
`{"==": [{"var": "co_gsatd"}, true]}`). Điều kiện của các anh là **danh mục đóng 21 mã**
(`EWorkflowConditionCode`; luồng PCT dùng 8 trong số đó). Không tồn tại phép ánh xạ tổng quát từ một
biểu thức tự do sang một tên gọi cố định — chỉ một tập con nhỏ dịch được.

Số đo trên chính luồng PCT mà chúng tôi đã dựng: **11 node / 17 transition, trong đó 6 transition
mang guard JSONLogic**. Nếu làm endpoint A, phần lớn số đó sẽ rơi vào nhánh *"không map được ⇒ 422"*.
Một endpoint từ chối phần lớn đầu vào hợp lệ của chính nó thì không dùng được vào việc gì.

**Lý do 3 — chạy song song là tạo ra đúng căn bệnh việc tích hợp này định gỡ.**
`generateWorkflowForTicket` của các anh vẫn đang sinh lại read-model sau mỗi action. Nếu endpoint A
phục vụ một bản định nghĩa **thứ hai**, hai bản đó sẽ trôi khỏi nhau, và không có cách nào để bên thứ
ba biết bản nào đúng. Chúng tôi đã áp đúng nguyên tắc này cho chính mình ở T22: `progress` được
**chiếu** từ dữ liệu các anh đã lưu, chứ **không** mô phỏng lại `checkConditionMethod` — dù về mặt kỹ
thuật chúng tôi mô phỏng được. Làm endpoint A song song sẽ là tự phản bội quyết định đó.

**Chúng tôi khuyến nghị:** giữ `generateWorkflowForTicket` làm **nguồn sự thật duy nhất** cho định
nghĩa luồng. B (form template) + C (chuyển trạng thái, guard ngoài phạm vi, `requiredFields`,
`progress`) đã phủ trọn phần chúng tôi có thể đảm bảo đúng.

⚠️ **Quyết định này ĐẢO NGƯỢC ĐƯỢC, và đây là điều kiện đảo:** nếu các anh muốn **giao hẳn** việc
định nghĩa luồng cho chúng tôi và **gỡ bỏ** `generateWorkflowForTicket`, thì lý do 3 biến mất và lý do
2 trở thành bài toán thu hẹp từ vựng có chủ đích (thoả thuận trước một tập điều kiện chung) thay vì
ánh xạ mò. Khi đó xin báo, chúng tôi sẽ mở lại. Còn chừng nào hai bên cùng định nghĩa luồng thì làm
endpoint A là làm sớm.

### T24. ✅ Hạn mức gọi API — hạn mức **chính** nay theo **khoá**, IP chỉ còn là lưới chặn (trả lời **Q9**)

Đây là câu trả lời của chúng tôi cho **Q9**, và nó **gỡ bỏ điều kiện vận hành** mà các bản trước của
tài liệu này đã xin các anh chờ. Các anh **không cần trả lời gì** để dùng được; con số thật của phía
các anh (nếu có) chỉ giúp chúng tôi chỉnh cho khớp.

**Hạn mức hiện tại (mặc định, cùng một cửa sổ 60 giây):**

| Áp cho | Mặc định | Biến môi trường |
|---|---|---|
| **Mỗi khoá API** gọi `/external/*` | **300 request / 60 giây** | `EXTERNAL_THROTTLE_LIMIT` |
| Trần theo IP cho traffic `/external/*` **có khoá** | 600 request / 60 giây | `EXTERNAL_IP_THROTTLE_LIMIT` |
| Mọi thứ còn lại (không đổi) | 120 request / 60 giây / IP | `THROTTLE_LIMIT` |
| Cửa sổ dùng chung | 60 000 ms | `THROTTLE_TTL` |

- **Ngân sách theo khoá là ngân sách CHUNG cho cả bề mặt**, không phải mỗi endpoint một suất: 300
  request đó tính gộp cả `form-template` lẫn `check-transition`. Chúng tôi chọn như vậy để con số
  chúng tôi nói với các anh không tự nhân lên mỗi lần chúng tôi thêm một endpoint.
- **Nhiều tiến trình dùng chung một khoá thì dùng chung ngân sách.** Nếu phía các anh có nhiều
  service gọi song song và muốn tách hạn mức, xin **cấp thêm khoá** (mỗi khoá một ngân sách riêng)
  — chúng tôi phát khoá theo yêu cầu, không giới hạn số lượng.
- **Vẫn còn trần theo IP** cho traffic có khoá, vì hạn mức được tính **trước khi** khoá được xác
  thực: nếu không có trần đó, một bên bất kỳ chỉ cần đổi giá trị header mỗi lần gọi là thoát hết mọi
  giới hạn. Nghĩa là: hai khoá của các anh đi chung một IP **không tranh nhau** ở mức bình thường,
  nhưng tổng của cả IP vẫn có trần. Nếu các anh cần vượt 600/phút từ một IP, chỉ cần báo — đó là một
  biến môi trường.

**Khi chạm trần**, chúng tôi trả **429**. ⚠️ **Tên header có hậu tố**, xin lưu ý khi viết client
(đo thật trên bản đã chạy, không phải suy đoán):

| Tình huống | Header các anh nhận được (đo thật, không phải suy đoán) |
|---|---|
| Request **không** bị chặn | đủ hai bộ: `X-RateLimit-{Limit,Remaining,Reset}-external-key` **và** `…-external-ip` |
| **429** vì hạn mức **khoá** | `Retry-After-external-key: <số giây còn lại>` — 🔴 **kèm theo bộ `X-RateLimit-*-external-ip`, XIN ĐỪNG TIN nó** (xem ghi chú dưới) |
| **429** vì trần **IP** | chỉ `Retry-After-external-ip: <số giây còn lại>` |

🔴 **Một cái bẫy chúng tôi phải nói trước, vì client rất dễ đọc nhầm:** trên phản hồi 429 do **hạn
mức khoá**, các anh vẫn nhận được `X-RateLimit-Remaining-external-ip` với một số **dương** (ví dụ đo
thật: `429` kèm `X-RateLimit-Remaining-external-ip: 2`). Đó là ngân sách **của IP**, không phải của
khoá — hạn mức khoá lúc đó đã cạn. Bộ `X-RateLimit-*-external-key` **không bao giờ** xuất hiện trên
429. Quy tắc an toàn cho client: **thấy 429 thì đọc `Retry-After-*`, đừng đọc `X-RateLimit-*`**.
Giá trị `Retry-After-*` là số giây còn lại của cửa sổ đang chặn (giảm dần), không phải hằng số.

Không có header `Retry-After` trần — đó là hệ quả của việc đặt tên cho từng hạn mức, và chúng tôi nói
ra thay vì để các anh phát hiện lúc chạy thật. Đọc `X-RateLimit-Remaining-external-key` là cách rẻ
nhất để client tự giãn nhịp trước khi chạm trần.

🔴 **Năm điều nói thẳng (ba giới hạn + hai lựa chọn thiết kế):**
1. **Hạn mức đếm theo tiến trình, không dùng bộ nhớ chung.** Hôm nay chúng tôi chạy một instance nên
   con số trên là con số thật. Nếu sau này chạy nhiều instance sau bộ cân bằng tải, hạn mức hiệu
   dụng sẽ **nhân lên** theo số instance cho tới khi chúng tôi chuyển sang bộ đếm dùng chung. Chúng
   tôi sẽ báo trước nếu điều đó xảy ra.
2. **Sau reverse-proxy, "IP" là IP của proxy.** Trần theo IP vì thế có thể gộp nhiều client lại làm
   một trong một số cách triển khai. Ngân sách **theo khoá** không bị ảnh hưởng — đó là lý do nó là
   hạn mức chính, còn trần IP chỉ là lưới chống lạm dụng.
3. **Mặc định 300/600 là con số chúng tôi tự chọn**, vì Q9 chưa có câu trả lời. Xin cho biết tần
   suất thật lúc cao điểm, chúng tôi chỉnh lại — việc chỉnh là đổi một biến môi trường, không phải
   đổi code, và không ảnh hưởng gì tới hợp đồng dữ liệu.
4. **Cửa sổ là cửa sổ CỐ ĐỊNH, không phải cửa sổ trượt.** Bộ đếm của một khoá về 0 khi cửa sổ của
   nó hết, nên về lý thuyết một client có thể tiêu trọn hạn mức ở cuối cửa sổ này và tiêu trọn lần
   nữa ở đầu cửa sổ sau (tức gấp đôi trong một khoảng ngắn). Chúng tôi chọn như vậy vì nó đơn giản
   và **đo được** — `X-RateLimit-Reset-external-key` cho biết chính xác lúc nào cửa sổ của các anh
   lật.
5. **Bộ đếm giữ tối đa 10.000 khoá cùng lúc trên mỗi tiến trình.** Con số đó thừa cho mọi khoá thật
   + mọi địa chỉ nguồn thật; nó tồn tại để một bên gọi bịa khoá liên tục không làm phình bộ nhớ vô
   hạn. Nếu bị flood tới mức đó, bộ đếm cũ nhất bị loại trước, và **trần theo IP** là thứ vẫn giữ.
   Traffic thật của các anh (vài khoá, gọi đều) không bao giờ chạm giới hạn này.

*(Ghi chú kỹ thuật, để các anh khỏi phải hỏi: chúng tôi **không** dùng bộ đếm mặc định của thư viện
`@nestjs/throttler` mà tự viết một bộ đếm riêng, chính vì hai điểm 4–5 ở trên: bộ mặc định không bao
giờ quên một khoá nào, và nó cho một khoá bị chặn làm đông cứng bộ đếm của khoá khác. Chúng tôi đo
được cả hai và sửa chứ không công bố như hạn chế.)*

---

## Phụ lục A — bảng tra `type` → `typeCode` đề xuất (liên quan B3)

> 🔴 **BẢNG NÀY LÀ BẢN ĐỀ XUẤT BAN ĐẦU, ĐÃ BỊ THAY THẾ MỘT PHẦN.** Nó được soạn khi chúng tôi còn
> đang đối chiếu với **hợp của 97 mã trên 4 renderer**. Sau khi hiện thực bộ xuất, chúng tôi đo lại
> và thấy đích đúng là **38 mã `ETypeForm` của riêng renderer tạo phiếu**, nên vài hàng dưới đây đã
> **không còn khớp với thứ hệ thống thật sự gửi đi**. Bốn chỗ lệch đã biết:
>
> | hàng ở bảng dưới | thực tế hệ thống đang làm |
> |---|---|
> | `space` → `BLOCK` | → **`COMPONENT_HORIZONAL`** (xem **T7**) |
> | `grid` → `GROUP_HORIZONTAL` | **không xuất thành item** — nó tan ra, các con được kéo lên (T7) |
> | `group` → `GROUP` | → **`COLLAPSE`** nếu có nhãn, **`CARD`** nếu không |
> | `password` → `TEXT_INPUT` | **từ chối xuất ⇒ 422** — đúng như chúng tôi tự đề nghị ở cảnh báo dưới bảng |
>
> Khi hai chỗ mâu thuẫn, **§6 (T3–T8) là bản đúng**. Chúng tôi giữ lại bảng này vì câu hỏi **B3** và
> **B3b** bên dưới vẫn còn nguyên giá trị và vẫn đang chờ phía EVN trả lời.

Nền tảng của chúng tôi có **đúng 33 loại thành phần**. Bảng dưới đây phủ **cả 33**, chia bốn nhóm.
Số trong ngoặc sau mỗi `typeCode` là **số lần mã đó xuất hiện trong 32 template thật** — chúng tôi chọn
đích dựa trên đó chứ không dựa trên tên gọi.

**Nhóm 1 — map thẳng, không mất gì (15 loại)**

| của chúng tôi | → `typeCode` | | của chúng tôi | → `typeCode` |
|---|---|---|---|---|
| `text` | `TEXT_INPUT` (86) | | `checkbox` | `CHECK_BOX` (11) |
| `textarea` | `TEXTAREA` (37) — xem **B3b** | | `date` | `DATE_TIME_PICKER` (18) — xem **B3b** |
| `number` | `NUMBER_INPUT` (8) | | `date-range` | `DATETIME_PICKER_RANGE` (7) |
| `radio` | `RADIO` (1) | | `upload` | `FILE_MULTIPLE` (12) / `FILE_LIST` (10) |
| `select` | `SELECT` (87) / `SELECT_MULTIPLE` (2) | | `array` | `FORM_LIST` (44) |
| `tree-select` | `SELECT_TREE_ONE` (34) | | `card` | `CARD` (12) |
| `display-text` | `TEXT` (915) | | `group` | `GROUP` (56) |
| | | | `collapse` | `COLLAPSE` (25) |

**Nhóm 2 — map được nhưng **mất widget**; chúng tôi vẫn map, và **cảnh báo** cho người soạn (9 loại)**

| của chúng tôi | → `typeCode` | mất gì |
|---|---|---|
| `cascader` | `SELECT_TREE_ONE` (34) | mất chọn theo tầng |
| `checkbox-group` | `SELECT_MULTIPLE` (2) | đổi từ ô tích sang danh sách chọn |
| `slider` | `NUMBER_INPUT` (8) | mất thanh trượt, còn lại con số |
| `rate` | `NUMBER_INPUT` (8) | mất chấm sao, còn lại con số |
| `color` | `TEXT_INPUT` (86) | mất bảng chọn màu, còn lại chuỗi mã màu |
| `password` | `TEXT_INPUT` (86) | **mất che ký tự** — xem cảnh báo dưới bảng |
| `grid` | `GROUP_HORIZONTAL` (170) | mất số cột / điểm ngắt responsive |
| `space` | `BLOCK` (40) | mất khoảng cách đã cấu hình |
| `collapse-panel` | con trực tiếp của `COLLAPSE` | không có mã riêng cho từng panel |

> ⚠️ **`password` cần phía EVN xác nhận riêng.** Chúng tôi không tìm thấy mã nào trong 97 mã có nghĩa
> "ô nhập được che". Nếu map sang `TEXT_INPUT` thì **giá trị sẽ hiển thị rõ trên màn hình**. Nếu phía
> EVN không có mã tương ứng, chúng tôi đề nghị chuyển `password` xuống **nhóm 4 (từ chối xuất)** thay vì
> map thầm — xin cho biết ý kiến.

**Nhóm 3 — chỉ là vỏ bọc, không xuất thành item (1 loại)**

`form-layout` — chúng tôi thể hiện bằng khoá `layout` ở cấp cao nhất của template, không tạo item riêng.

**Nhóm 4 — chưa tìm được đích, chúng tôi sẽ trả 422 kèm tên trường (8 loại)**

| của chúng tôi | vì sao chưa map được |
|---|---|
| `time`, `time-range` | trong 97 mã **không có mã nào chỉ-giờ**; tất cả đều là `DATE…` / `DATETIME…` |
| `tabs`, `tab-pane` | không có mã nào chứa `TAB` theo nghĩa thẻ chuyển |
| `steps`, `step` | không có mã nào chứa `STEP` |
| `switch` | có `SWITCH_ACTION` (2 lần) nhưng tên cho thấy đó là **nút hành động**, không phải công tắc bật/tắt giá trị. Xin xác nhận |
| `lookup` | mở hộp thoại chọn bản ghi từ nguồn khác rồi tự điền vào form. Có thể gần với `PICKER` (7) — xin xác nhận |

> **Xin cho biết:** nhóm 4 có mã tương ứng không? Riêng `switch` → `SWITCH_ACTION` và
> `lookup` → `PICKER` chỉ cần một câu xác nhận là chúng tôi chuyển lên nhóm 1 ngay.

---

### B3b. Trong 97 mã có vài cặp **gần trùng nhau** — mã nào là mã chuẩn?

Khi dựng bảng trên, chúng tôi gặp những cặp mã khác tên nhưng có vẻ cùng nghĩa. Chọn nhầm thì renderer
vẫn chạy nhưng ra sai thành phần, nên xin hỏi luôn:

| cặp mã | số lần dùng | câu hỏi |
|---|---|---|
| `TEXTAREA` / `TEXT_AREA` / `TEXTAREA_CONDITION` | 37 / 23 / 6 | ba mã hay một mã bị viết ba kiểu? Chúng tôi đang chọn `TEXTAREA` |
| `DATE_TIME_PICKER` / `DATETIME_PICKER` | 18 / 3 | chúng tôi đang chọn `DATE_TIME_PICKER` (dùng nhiều hơn) |
| `GROUP_HORIZONTAL` / `GROUP_HORIZONTAL_001` / `GROUP_HORIZONTAL_002` | 170 / 3 / 2 | hai mã đuôi số là biến thể trình bày hay là di sản? |
| `COMPONENT_HORIZONAL` | 44 | mã này thiếu chữ `T` (`HORIZONAL`). Là **lỗi chính tả đã đi vào production** và phải giữ nguyên, hay đã có mã đúng chính tả để chúng tôi dùng? |

**Mặc định:** chọn mã có số lần dùng cao nhất trong mỗi cặp, và **giữ nguyên** `COMPONENT_HORIZONAL`
kể cả khi sai chính tả.
**Sai thì hỏng gì:** ra sai thành phần ở những chỗ dùng nhiều nhất — `GROUP_HORIZONTAL` một mình đã là
170 node.

---

## Phụ lục B — bảng chuyển trạng thái PCT chúng tôi trích được (34 hàng)

Trích từ `ROLE_STATUS_ACTION_PCT` (`src/shared/common/constant/ticket.constant.ts:2576-2788`).
Dùng để đối chiếu với export ở §4. `(S_N/A)` = hàng không khai `statusCodeNext` ⇒ nhận default của cột.

| vai | trạng thái trước | action | trạng thái sau |
|---|---|---|---|
| `R_NA` | `S_N/A` | `PCT_A_DRAFT` | `PCT_S_DRAFT` |
| `PCT_R_CREATED` | `PCT_S_DRAFT` | `PCT_A_DRAFT` | `PCT_S_DRAFT` |
| `PCT_R_CREATED` | `PCT_S_DRAFT` | `PCT_A_DELETE` | *(S_N/A)* |
| `R_NA` | `S_N/A` | `PCT_A_CREATED` | `PCT_S_CREATED` |
| `PCT_R_CREATED` | `PCT_S_DRAFT` | `PCT_A_CREATED` | `PCT_S_CREATED` |
| `PCT_R_CREATED` | `PCT_S_CREATED` | `PCT_A_CANCEL` | `PCT_S_CANCEL` |
| `PCT_R_CREATED` | `PCT_S_DRAFT` | `PCT_A_EDIT` | *(S_N/A)* |
| `PCT_R_CREATED` | `PCT_S_MODERATION` | `PCT_A_UPDATE` | *(S_N/A)* |
| `PCT_R_CREATED` | `PCT_S_CREATED` | `PCT_A_UPDATE` | *(S_N/A)* |
| `PCT_R_CREATED` | `PCT_S_MODERATION` | `PCT_A_CANCEL` | `PCT_S_CANCEL` |
| `PCT_R_CHTT` | `PCT_S_MODERATION` | `PCT_A_WORKING` | `PCT_S_WORKING` |
| `PCT_R_CHTT` | `PCT_S_HALT` | `PCT_A_CONTINUE_WORK` | `PCT_S_ALLOWED` |
| `PCT_R_CHO_PHEP` | `PCT_S_WORKING` | `PCT_A_ALLOW_INPUT` | `PCT_S_WORKING` |
| `PCT_R_CHO_PHEP` | `PCT_S_WORKING` | `PCT_A_ALLOW` | `PCT_S_ALLOWED_WAITING` ⚠️ |
| `PCT_R_CHO_PHEP` | `PCT_S_WORKING` | `PCT_A_ALLOW` | `PCT_S_ALLOWED` ⚠️ |
| `PCT_R_LANH_DAO` | `PCT_S_ALLOWED_WAITING` | `PCT_A_ALLOW_HANDOVER` | `PCT_S_ALLOWED` |
| `PCT_R_CHTT` | `PCT_S_ALLOWED` | `PCT_A_HANDOVER_INPUT` | `PCT_S_ALLOWED` |
| `PCT_R_CHTT` | `PCT_S_ALLOWED_WAITING` | `PCT_A_HANDOVER_INPUT` | `PCT_S_ALLOWED_WAITING` |
| `PCT_R_CHTT` | `PCT_S_ALLOWED` | `PCT_A_ALLOW_INPUT` | `PCT_S_ALLOWED` |
| `PCT_R_CHTT` | `PCT_S_ALLOWED` | `PCT_A_HANDOVER` | `PCT_S_HANDOVERED_WAITING` ⚠️ |
| `PCT_R_CHTT` | `PCT_S_ALLOWED` | `PCT_A_HANDOVER` | `PCT_S_HANDOVERED` ⚠️ |
| `PCT_R_GSATD` | `PCT_S_HANDOVERED_WAITING` | `PCT_A_HANDOVER_APPROVED` | `PCT_S_HANDOVERED` |
| `PCT_R_NHAN_VIEN` | `PCT_S_HANDOVERED` | `PCT_A_NHANVIEN_CHECKIN` | `PCT_S_HANDOVERED` |
| `PCT_R_CHTT` | `PCT_S_HANDOVERED` | `PCT_A_CHTT_NHANVIEN_CHECKIN` | `PCT_S_HANDOVERED` |
| `PCT_R_NHAN_VIEN` | `PCT_S_HANDOVERED` | `PCT_A_NHANVIEN_CHECKOUT` | `PCT_S_HANDOVERED` |
| `PCT_R_CHTT` | `PCT_S_HANDOVERED` | `PCT_A_CHTT_NHANVIEN_CHECKOUT` | `PCT_S_HANDOVERED` |
| `PCT_R_CHTT` | `PCT_S_HANDOVERED` | `PCT_A_END_INPUT` | `PCT_S_HANDOVERED` |
| `PCT_R_CHTT` | `PCT_S_HANDOVERED` | `PCT_A_END` | `PCT_S_END_WAITING` ⚠️ |
| `PCT_R_CHTT` | `PCT_S_HANDOVERED` | `PCT_A_END` | `PCT_S_END` ⚠️ |
| `PCT_R_LANH_DAO` | `PCT_S_END_WAITING` | `PCT_A_END_APPROVED` | `PCT_S_END` |
| `PCT_R_CHO_PHEP` | `PCT_S_WAITING_LOCKED` | `PCT_A_LOCK_INPUT` | `PCT_S_WAITING_LOCKED` |
| `PCT_R_CHO_PHEP` | `PCT_S_END` | `PCT_A_LOCK` | `PCT_S_WAITING_LOCKED` |
| `PCT_R_CHO_PHEP` | `PCT_S_WAITING_LOCKED` | `PCT_A_CONFIRM_LOCK` | `PCT_S_LOCKED` |
| `PCT_R_CREATED` | `PCT_S_LOCKED` | `PCT_A_FINISHED` | `PCT_S_FINISHED` |

⚠️ = ba cặp nhập nhằng nói ở **B1**.

**Ngoài 34 hàng trên**, `initActionRoleStatus()` còn sinh thêm hàng theo vòng lặp cho các action không
theo flow (`SYNCHRONIZE`, `ROLE_STATUS_ACTION_WEB_PCT`, `ROLE_STATUS_ACTION_PCT_CHTT_NOT_FLOW`…). Bản
trích này **chỉ gồm phần flow**, đó là lý do chúng tôi vẫn xin export ở §4.

---

## Phụ lục C — tóm tắt mặc định của chúng tôi

Nếu không nhận được trả lời, chúng tôi làm tiếp theo đúng những mặc định này:

| # | Mặc định |
|---|---|
| B1 | `nextStatus: null` + `ambiguousNext[]` cho `PCT_A_ALLOW` / `PCT_A_HANDOVER` / `PCT_A_END` |
| B1b | Hàng `ticket_role_values` đã `active = false` ⇒ **không** tính là "phiếu có vai đó" |
| B2 | Endpoint B nhận thêm `?formCode=`; thiếu mà có >1 template ⇒ 404 |
| B3 | Bám 97 `typeCode` đo từ template thật; loại không có đích ⇒ 422 kèm tên trường |
| B3b | Cặp mã gần trùng ⇒ chọn mã **dùng nhiều nhất**; giữ nguyên `COMPONENT_HORIZONAL` dù sai chính tả |
| ~~B4~~ | ~~`description` chỉ gồm `styleLabel`/`styleValue`/`width`/`isWeb` + `valueCode`/`valueType`~~ → **VIẾT LẠI (P2c)**: bảng cũ dựng trên tần suất **cộng gộp bốn renderer**; 4/6 khoá đó renderer tạo phiếu **không đọc**. Nay cấp: lựa chọn tĩnh (`isApi:false`+`data{data}`), `disable`, `min`/`max`/`controls`, `autoSize`, `acceptFile`/`max`, `value` — xem B4 |
| A (phụ lục) | `password` → `TEXT_INPUT` **nhưng** nếu phía EVN không có mã che ký tự thì chuyển sang **từ chối xuất**, không map thầm |
| X1–X3, D1–D7 | Lấy **source** làm chuẩn, không lấy tài liệu. Cụ thể: `PCT_A_WORKING` → `PCT_S_WORKING`; mã vai là **`R_NA`**; hàng `PCT_A_CANCEL` từ `PCT_S_WORKING` (đang bị comment) coi như **không tồn tại** |
| ~~Q1~~ | ~~Xuất cả `code` và `itemCode`, cùng giá trị~~ → **BỎ (P2b)**: `itemCode` không có trong `CreateFormItemDto` và **không có cột** trên `FormItem` — nó do `forms.service.ts` sinh ra lúc ĐỌC. Gửi đi chỉ là khoá thừa bị `save()` bỏ im lặng. Chúng tôi **chỉ gửi `code`** |
| Q2 | `PCT_A_WORKING` chỉ từ `PCT_S_MODERATION` |
| Q3 | **(sửa ở P4c)** Nhận `ticketData` dạng **mảng hàng** hoặc `{ "data": [...] }`; dạng scalar phẳng của ví dụ §12.C **không nhận** ⇒ 422 — xem **T19b** |
| Q4 | Guard xuyên phiếu ⇒ liệt kê trong `outOfScopeGuards`, không tự kiểm |
| Q5 | Container: sinh mã tất định từ đường dẫn cây |
| Q6 | Không gửi `validations`; chỉ gửi `required` — **nhưng xem T8**: phía EVN CÓ hỗ trợ, nên đây là năng lực bỏ không chứ không phải hợp đồng thiếu. Đã chuyển thành cảnh báo, sẽ ánh xạ ở lát cắt riêng |
| Q7 | ✅ **ĐÃ CHỐT: KHÔNG làm endpoint A** — không còn là "mặc định nếu không ai trả lời", mà là quyết định có số đo, xem **T23**. Đảo ngược nếu EVN gỡ `generateWorkflowForTicket` |
| Q8 | Chừa slot ký số nếu form đã khai; không tự sinh. Thứ tự PDF: việc phía EVN |
| Q9 | ✅ **ĐÃ SHIP (T24)**: hạn mức chính 300 req/60s cho mỗi **khoá API** (biến `EXTERNAL_THROTTLE_LIMIT`); theo IP còn trần 600 req/60s cho traffic có khoá; 429 kèm header `Retry-After-external-key` |
| — | Tra không ra **trong bảng** ⇒ `allowed: true` + `outOfScopeGuards`. **(sửa ở P4c)** Guard **nội dung** là việc khác: thiếu nội dung bắt buộc ⇒ `allowed: false`, xem **T19** |
