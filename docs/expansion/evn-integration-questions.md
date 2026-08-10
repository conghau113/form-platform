# Bộ câu hỏi tích hợp — form-platform ↔ EVN core-service (§12)

**Người gửi:** đội form-platform · **Ngày:** 2026-08-04
**Đối tượng:** đội phát triển `core-service`
**Căn cứ:** `core-service/docs/third-party-form-ticket-integration.md` §11–§14 (dưới đây gọi là *tài liệu*)
và source `core-service/src` + `core-service/public/files/templateJSON` (dưới đây gọi là *source*).

> ⚠️ **Hai lưu ý khi tra dẫn chứng:**
> 1. Repo có **hai** file cùng tên `ticket.constant.ts`. Chúng tôi luôn ghi đường dẫn đầy đủ:
>    `src/shared/common/constant/ticket.constant.ts` (chứa các bảng `ROLE_STATUS_ACTION_*`) và
>    `src/modules/ticket/ticket.constant.ts` (chứa `ACTION_CHECK_ROLE_PCT`).
> 2. Trong tài liệu, các mục `### 11.1`–`### 11.7` **nằm bên dưới** tiêu đề `## 12` (dòng 1368), và có
>    **hai** tiêu đề `## 12`. Chúng tôi gọi theo nội dung (*"§12.B"* = phần *"Lấy form template động"*,
>    *"§12.C"* = *"Kiểm tra điều kiện chuyển bước"*), và **mọi dẫn chứng đều kèm số dòng** để tra cho chắc.

---

## 0. Bối cảnh và cách đọc tài liệu này

Chúng tôi đang hiện thực ba endpoint mà §12 mô tả:

| | Endpoint | Trạng thái phía chúng tôi |
|---|---|---|
| A | `GET /external/workflow-definition` | chưa làm — xin ý kiến, xem **Q7** |
| B | `GET /external/form-template` | đã chạy được bản đầu, **hợp đồng còn tạm** vì các câu B1–B4 dưới đây |
| C | `POST /external/check-transition` | chưa làm — bị chặn bởi **B1** |

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
(`ticket.service.ts:14363-14366`, `:14740-14743`, `:14790-14793`), **không** qua `action_role_status`.

> **Xin xác nhận (X3):** đúng chứ? Và **còn trạng thái nào khác** cũng được ghi thẳng kiểu này không?
> Chúng tôi cần biết để endpoint C **không** trả `allowed: false` oan cho những phiếu đi đường đó.
> **Mặc định:** trạng thái/action nào tra không ra trong bảng ⇒ trả `allowed: true` + liệt kê vào
> `outOfScopeGuards`, **tuyệt đối không** trả `false`.

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
(`src/modules/ticket/service/ticket-action.service.ts:1659`) — tra `ticket.ticket_role_values` xem
**trên phiếu đó có ai được phân vai** `PCT_R_LANH_DAO` / `PCT_R_GSATD` hay không. Đường chạy thật nằm ở
`ticket.service.ts:5198-5225` (nhánh `if (check)` lấy `YES`, `else` lấy `NO`):

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
| **Q3** | **Hình dạng `ticketData` gửi lên endpoint C.** Chúng tôi thấy hai dạng: lồng trong `ticket_items.value.data` (`ticket.service.ts:5398-5406`, dòng gán là `itemTickets[code] = itemTicketDB.value?.data`) và scalar phẳng như ví dụ §12.C (`:1447-1451`). Dạng nào là dạng phía EVN sẽ gửi? | Chấp nhận **cả hai**, tự dò | Điều kiện dạng `{"var":"LIST"}` không resolve được. Với JSONLogic thì "khoá không tồn tại" và "mảng rỗng" cho **cùng một kết quả** ⇒ guard **fail-open** (cho qua nhầm). Chúng tôi đã chặn hai lớp, nhưng biết đúng hình dạng thì an toàn hơn hẳn |
| **Q4** | **Guard xuyên phiếu.** Có nhóm điều kiện phải tra sang **phiếu khác** — ví dụ `getEmployeeCheckinByUserCode` (`ticket-action.service.ts:1211-1242`) hỏi *"nhân viên này có đang bận ở phiếu khác không"* bằng câu truy vấn có `te.ticket_id <> :ticketId`. Chúng tôi **không có** dữ liệu các phiếu khác, nên hiểu rằng **phía EVN tự giữ** nhóm này, còn endpoint C sẽ liệt kê chúng trong `outOfScopeGuards` để phía EVN biết cái gì **chưa** được kiểm. Đúng chứ? | Trả `outOfScopeGuards` | Phía EVN tưởng C đã kiểm hết ⇒ **bỏ lọt** điều kiện |
| **Q5** | **Mã cho container.** 10/12 loại container của chúng tôi (tabs, collapse, card, grid, step…) **không có tên định danh**, trong khi `FormItem.code` bên EVN là PK NOT NULL và phải nằm trong `form_item_codes` (ràng buộc #1, `:1466`). Chúng tôi định **sinh mã tất định từ đường dẫn cây** — nhưng mã đó sẽ **không** có trong danh mục. Chấp nhận mã layout ngoài danh mục, hay có cách khác? | Sinh mã tất định, ổn định giữa hai lần xuất | Vỡ FK lúc nạp |
| **Q6** | **`validations`.** Ví dụ §12.B (`:1425-1427`) có mảng `validations`, và §14 mục 5 nói bên thứ ba có thể gửi thêm. Nhưng **template thật không có trường này** (0/2709 node) — ràng buộc bắt buộc chỉ thể hiện bằng `required: true` (**191** node đặt `true`; 290 node có khai khoá `required`). Vậy có nên gửi `validations` không? Nếu có, `form_item_validations.form_validate_code` là FK tới `form_validations.code` — xin danh sách mã hợp lệ | **Không** gửi `validations`; chỉ gửi `required` | FK không resolve lúc nạp |
| **Q7** | **Endpoint A** (`GET /external/workflow-definition`) **thay** `generateWorkflowForTicket` hay chạy **song song**? Chúng tôi thấy `WORKFLOW_PCT.json` hiện là read-model được sinh lại sau mỗi action; nếu endpoint A chạy song song thì sẽ có **hai nguồn sự thật** cho cùng một quy trình | Nếu song song ⇒ **khuyến nghị không làm A**, và nói rõ lý do thay vì làm rồi để lệch | Hai nguồn sự thật cho cùng một quy trình — đúng vấn đề mà việc tích hợp này định gỡ |
| **Q8** | **§14 mục 2 & 3.** Template có phải **chừa sẵn** slot `*_SIGN` / `*_SIGNTIME` / `*_SIGNDATA` không? Và thứ tự trường cho PDF theo `typeFormItemPDF` (26 mã, `form.enum.ts:540`) là việc của bên nào? | Chừa slot **nếu form đã khai**; **không** tự sinh. Thứ tự PDF: mặc định là việc phía EVN | Ký số không gắn được giá trị; PDF sai thứ tự trường |
| **Q9** | **Tải thật của `/external/*`** khoảng bao nhiêu request/phút? Hiện chúng tôi giới hạn 120 req/60s **theo IP**, mà traffic từ phía EVN sẽ dùng chung một IP | Đổi sang hạn mức **theo khoá API**, không theo IP | Chặn nhầm traffic thật vào giờ cao điểm |

---

## 4. Xin dữ liệu (nếu tiện)

Chúng tôi đã tự trích được phần lớn từ source, nên phần này chỉ để **đối chiếu**, không chặn:

| bảng | vì sao vẫn cần | chúng tôi đã có gì |
|---|---|---|
| `ticket.action_role_status` (lọc PCT, **kèm cột `active`**) | biết bảng thật có bị **sửa tay sau khi seed** không, và hàng nào đang `active = false` | 34 hàng trích từ `ROLE_STATUS_ACTION_PCT` |
| `ticket.form_item_codes` (**kèm `active`**) | biết mã nào còn hiệu lực và có mã nào **mới thêm** sau thời điểm chúng tôi chụp source | 398 mã trích từ `formItemCodeEnum` (`form.enum.ts:48-534`) |
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

### T2. Chỉ form **soạn theo danh mục của EVN** mới xuất được

Vì `FormItem.code` phải nằm trong `form_item_codes` (398 mã), một form đặt tên trường tự do
(`salary`, `department`…) sẽ **không** xuất sang được. Nghĩa là tính năng này là *"soạn form EVN trên
nền tảng của chúng tôi"*, không phải *"xuất mọi form sang EVN"*. Chúng tôi sẽ báo lỗi **ngay lúc soạn**
(kèm tên trường + lý do), chứ không để vỡ lúc phía EVN gọi.

> ⚠️ **T2 đã được sửa — xem T6 ở §6.** Đo lại `form-items.service.ts` cho thấy mã lạ **không** bị từ
> chối: `saveCreateFormItem` **tự thêm** mã mới vào `form_item_codes`. Vấn đề vì thế không phải
> "không xuất được" mà là "danh mục dùng chung của EVN sẽ nở ra".

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
1. Mã `GEN_*` **không nằm trong danh mục 398 mã** của EVN. Vì `saveCreateFormItem` tự thêm mã mới (T6),
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

👉 **Xin xác nhận** phía EVN muốn chúng tôi **chặn** mã ngoài danh mục (chúng tôi trả 422, an toàn cho
danh mục của EVN) hay **để đi qua** (tiện cho người soạn, nhưng danh mục nở). Mặc định hiện tại của
chúng tôi: **để đi qua** ở lát cắt này, và sẽ chốt ở lát cắt danh mục kế tiếp.

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
| Q3 | Chấp nhận cả hai hình dạng `ticketData`, tự dò |
| Q4 | Guard xuyên phiếu ⇒ liệt kê trong `outOfScopeGuards`, không tự kiểm |
| Q5 | Container: sinh mã tất định từ đường dẫn cây |
| Q6 | Không gửi `validations`; chỉ gửi `required` — **nhưng xem T8**: phía EVN CÓ hỗ trợ, nên đây là năng lực bỏ không chứ không phải hợp đồng thiếu. Đã chuyển thành cảnh báo, sẽ ánh xạ ở lát cắt riêng |
| Q7 | Nếu A chạy song song với `generateWorkflowForTicket` ⇒ **không làm A** |
| Q8 | Chừa slot ký số nếu form đã khai; không tự sinh. Thứ tự PDF: việc phía EVN |
| Q9 | Hạn mức theo khoá API thay vì theo IP |
| — | Mọi trạng thái/action tra không ra trong bảng ⇒ `allowed: true` + `outOfScopeGuards`, **không bao giờ** `allowed: false` |
