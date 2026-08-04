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

Trên template thật, `description` có **150 khoá riêng biệt** (2077 node có `description`). Dùng nhiều
nhất: `valueCode` 896 · `styleLabel` 409 · `valueType` 385 · `width` 375 · `isWeb` 333 · `data` 321 ·
`isApi` 280 · `length` 268 · `styleValue` 232 · `pdf` 171.

Lát cắt đầu tiên chúng tôi định cấp:

- **Có cấp:** `styleLabel`, `styleValue`, `width`, `isWeb` (trình bày) + **`valueCode`, `valueType`**
  (cơ chế gắn giá trị).
- **Chưa cấp:** `isApi` + `data{path,method,query,body}` (gọi API), `OnChangeValue.fieldsRelevantReset`,
  `hiddenWith`, `disableWith`, `fillDataInForm`, `prioritizeCode`, `changeCode`. Lý do: đây là **hành vi
  động**, chưa có đối ứng một-một trong contract của chúng tôi. Chúng tôi sẽ **liệt kê ra** những khoá
  không cấp được chứ không im lặng bỏ.

**Câu hỏi:** với tập "có cấp" ở trên, renderer của phía EVN **hiển thị và lấy được dữ liệu** chưa? Hay
còn khoá nào nữa là bắt buộc, thiếu là hỏng?

| | |
|---|---|
| **Mặc định** | Cấp nhóm trình bày + `valueCode`/`valueType`; khoá khác để trống và liệt kê ra |
| **Sai thì hỏng gì** | Form render ra nhưng **không lấy được dữ liệu**, hoặc không ẩn/hiện đúng — hỏng âm thầm, khó lần |

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

---

## Phụ lục A — bảng tra `type` → `typeCode` đề xuất (liên quan B3)

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
| B4 | `description` chỉ gồm `styleLabel`/`styleValue`/`width`/`isWeb` + `valueCode`/`valueType` |
| A (phụ lục) | `password` → `TEXT_INPUT` **nhưng** nếu phía EVN không có mã che ký tự thì chuyển sang **từ chối xuất**, không map thầm |
| X1–X3, D1–D7 | Lấy **source** làm chuẩn, không lấy tài liệu. Cụ thể: `PCT_A_WORKING` → `PCT_S_WORKING`; mã vai là **`R_NA`**; hàng `PCT_A_CANCEL` từ `PCT_S_WORKING` (đang bị comment) coi như **không tồn tại** |
| Q1 | Xuất cả `code` và `itemCode`, cùng giá trị |
| Q2 | `PCT_A_WORKING` chỉ từ `PCT_S_MODERATION` |
| Q3 | Chấp nhận cả hai hình dạng `ticketData`, tự dò |
| Q4 | Guard xuyên phiếu ⇒ liệt kê trong `outOfScopeGuards`, không tự kiểm |
| Q5 | Container: sinh mã tất định từ đường dẫn cây |
| Q6 | Không gửi `validations`; chỉ gửi `required` |
| Q7 | Nếu A chạy song song với `generateWorkflowForTicket` ⇒ **không làm A** |
| Q8 | Chừa slot ký số nếu form đã khai; không tự sinh. Thứ tự PDF: việc phía EVN |
| Q9 | Hạn mức theo khoá API thay vì theo IP |
| — | Mọi trạng thái/action tra không ra trong bảng ⇒ `allowed: true` + `outOfScopeGuards`, **không bao giờ** `allowed: false` |
