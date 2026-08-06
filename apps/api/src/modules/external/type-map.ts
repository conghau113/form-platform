import type { FieldNode } from "@org/form-schema";
import { EVN_TEMPLATE_USAGE } from "./evn-vocabulary.js";

/**
 * What one of our node types becomes on the way to EVN's create-form renderer (P2a).
 *
 * Four outcomes, not three. The fourth — `unwrap` — is forced by the shapes, not invented: our
 * `collapse` wraps `collapse-panel` children, while EVN's `COLLAPSE` holds fields directly and never
 * nests inside another `COLLAPSE`. Rejecting `collapse` would make the panel mapping unreachable,
 * since a panel only ever exists inside one. So the wrapper has to dissolve and its children rise.
 *
 * P2a decides the vocabulary only. Actually hoisting `unwrap`ped children, generating codes and
 * filling `description` are P2b/P2c/P2e.
 */
export type TypeMapping =
  | { kind: "map"; typeCode: string; warnings: readonly string[] }
  | { kind: "unwrap"; warnings: readonly string[] }
  | { kind: "reject"; reason: string };

/**
 * Targets whose `case` exists in the create renderer but which NO shipped template exercises.
 *
 * They are chosen anyway, because the alternative is worse: mapping a date-only field to a
 * date+time picker changes the value the user submits, and downgrading free-tagging to a fixed
 * multi-select silently drops entered values. Supported-on-paper beats wrong-on-purpose — but it is
 * a real risk, so it is written down, pinned by a test, and asked about in the handover doc rather
 * than blended into the mapping table where nobody would notice it.
 */
export const UNEXERCISED_TARGETS: readonly string[] = [
  "DATE_PICKER",
  "SELECT_TAGS",
  "SELECT_TREE_MULTIPLE",
];

/**
 * Node types our contract gives no `name`, so an exporter must GENERATE their `code`.
 *
 * `code` is `NOT NULL` and part of the primary key on EVN's side, so every emitted node needs one.
 * The containers are the obvious cases; `display-text` is the trap — it is a leaf, so a
 * "containers need generated codes" rule written from the shape of the tree would walk straight
 * past it. Recorded here for P2e rather than left as a comment nobody greps for.
 */
export const TYPES_WITHOUT_NAME: readonly FieldNode["type"][] = [
  "display-text",
  "tabs",
  "tab-pane",
  "collapse",
  "collapse-panel",
  "card",
  "grid",
  "space",
  "steps",
  "step",
  "form-layout",
];

/**
 * Choice controls get their options from `description` — either `isApi` + a data endpoint, or a
 * static list under `description.data`. BOTH work in their renderer; what does not work is what we
 * currently emit, which is neither.
 *
 * The wording matters: an earlier draft of this warning claimed EVN only accepts options through an
 * API of theirs. That is false (`SelectItemHandle.tsx:467` falls back to `data?.data ?? data`, and
 * `RadioItemHandle.tsx:82` reads the static list exclusively) and would have sent P2c asking them to
 * build an endpoint it does not need.
 */
const OPTIONS_NOT_EXPORTED_YET =
  "Danh sách lựa chọn chưa được xuất — nó nằm trong phần cấu hình hiển thị mà lát cắt này chưa " +
  "cấp, nên trường này sẽ hiển thị rỗng cho tới khi phần đó được bổ sung.";

/**
 * Every date control in the create renderer unconditionally disables days before today. Our
 * contract has no such rule, so an exported date field silently becomes stricter than it was
 * authored — the author has to know before EVN's users hit it.
 */
const NO_PAST_DATES = "EVN chặn chọn ngày trong quá khứ ở mọi ô ngày; hợp đồng của ta không chặn.";

/**
 * Their number validator rejects `0` outright — in both validation paths, whether or not the field
 * is required. Same family as {@link NO_PAST_DATES}: a constraint EVN imposes that we never agreed
 * to, which turns a valid authored form into one the user cannot submit.
 */
const NUMBER_ZERO_REJECTED =
  "EVN không cho nhập giá trị 0 ở ô số (kể cả khi trường không bắt buộc).";

/** Their text validators cap input at 10 000 characters regardless of what we authored. */
const TEXT_LENGTH_CAP = "EVN giới hạn 10.000 ký tự cho ô chữ, bất kể giới hạn ta đặt.";

/**
 * Map one node to EVN's create-form vocabulary.
 *
 * Pure and total over the contract: `type-map.test.ts` iterates `FIELD_TYPES` so a new node type
 * added to the schema fails here rather than falling through to something plausible.
 *
 * Variant-dependent branches (`select.tags`, `date.showTime`, `group.label`) are why this is a
 * function and not a lookup table — the same `type` legitimately targets different codes.
 */
export function mapNodeType(node: FieldNode): TypeMapping {
  switch (node.type) {
    // ── Plain leaves ────────────────────────────────────────────────────────────────────────
    case "text":
      return map("TEXT_INPUT", [TEXT_LENGTH_CAP]);
    case "textarea":
      return map("TEXTAREA", [TEXT_LENGTH_CAP]);
    case "number":
      return map("NUMBER_INPUT", [NUMBER_ZERO_REJECTED]);
    // `TYPOGRAPHY` is the static-text node, not `TEXT`: `TEXT` wants `width`/`styleValue` and is
    // used as a cell inside `FORM_LIST`, whereas our display-text is authored prose in a section.
    case "display-text":
      return map("TYPOGRAPHY");

    // ── Choice controls — all inherit the empty-options warning ──────────────────────────────
    case "select":
      // `tags` beats `multiple`, matching our own renderer's precedence.
      if (node.tags) return map("SELECT_TAGS", [OPTIONS_NOT_EXPORTED_YET]);
      return map(node.multiple ? "SELECT_MULTIPLE" : "SELECT", [OPTIONS_NOT_EXPORTED_YET]);
    case "tree-select":
      return map(node.multiple ? "SELECT_TREE_MULTIPLE" : "SELECT_TREE_ONE", [
        OPTIONS_NOT_EXPORTED_YET,
      ]);
    case "radio":
      return map("RADIO", [OPTIONS_NOT_EXPORTED_YET]);
    case "checkbox-group":
      return map("SELECT_MULTIPLE", [
        "Nhóm ô tích xuất thành ô chọn nhiều (dropdown) — người dùng không còn thấy các ô tích.",
        OPTIONS_NOT_EXPORTED_YET,
      ]);
    case "cascader":
      return map("SELECT_TREE_ONE", [
        "Chọn theo từng cấp xuất thành cây chọn một nút — người dùng chọn thẳng nút lá.",
        OPTIONS_NOT_EXPORTED_YET,
      ]);

    // ── Dates ───────────────────────────────────────────────────────────────────────────────
    case "date": {
      const warnings = [NO_PAST_DATES];
      if (node.picker && node.picker !== "date") {
        warnings.push(
          `Ô ngày theo "${node.picker}" xuất thành ô chọn ngày thường — người dùng sẽ chọn từng ngày.`,
        );
      }
      return map(node.showTime ? "DATETIME_PICKER" : "DATE_PICKER", warnings);
    }
    case "date-range": {
      const warnings = [NO_PAST_DATES];
      // Their range picker hard-codes `showTime` and an `HH:mm DD/MM/YYYY` format, so a date-only
      // range gains a time-of-day the author never asked for.
      if (!node.showTime) warnings.push("Khoảng ngày của EVN luôn kèm giờ, không tắt được.");
      if (node.picker && node.picker !== "date") {
        warnings.push(`Khoảng ngày theo "${node.picker}" xuất thành khoảng ngày thường.`);
      }
      return map("DATETIME_PICKER_RANGE", warnings);
    }

    // ── Files ───────────────────────────────────────────────────────────────────────────────
    // Always the multi-file control, even for `maxCount: 1`: the single-file code exists in the
    // renderer but no shipped form uses it, and the limit is expressible on the multi one anyway
    // (as a `description` key, which P2c carries).
    case "upload":
      return map("FILE_MULTIPLE", [
        "Giới hạn số lượng/định dạng tệp chưa được xuất ở lát cắt này.",
      ]);

    // ── Numeric-ish widgets with no counterpart ─────────────────────────────────────────────
    case "slider":
      return map("NUMBER_INPUT", ["Thanh trượt xuất thành ô nhập số.", NUMBER_ZERO_REJECTED]);
    // A rate of zero stars is a legitimate value here and unsubmittable there, so the zero warning
    // is not boilerplate on this one — it is the whole bottom of the scale.
    case "rate":
      return map("NUMBER_INPUT", ["Thang sao xuất thành ô nhập số.", NUMBER_ZERO_REJECTED]);
    case "color":
      return map("TEXT_INPUT", ["Bộ chọn màu xuất thành ô nhập chữ (người dùng tự gõ mã màu)."]);

    // ── Containers ──────────────────────────────────────────────────────────────────────────
    case "array":
      return map("FORM_LIST");
    case "collapse-panel":
      return map("COLLAPSE");
    case "card":
      // Their card component is passed no title, so an authored one would vanish silently.
      return node.title
        ? map("CARD", ["Tiêu đề của thẻ không hiển thị được ở phía EVN."])
        : map("CARD");
    case "group":
      // A labelled group must become `COLLAPSE`: it is the only create-form container that renders
      // a label (and the required marker). `CARD` renders children only. Unlabelled groups are
      // plain boxes, so `CARD` loses nothing.
      return node.label
        ? map("COLLAPSE", ["Nhóm có nhãn xuất thành mục thu/mở (mặc định đang mở)."])
        : map("CARD");
    case "space": {
      // No "cannot nest" warning here. `COMPONENT_HORIZONAL` renders its children through
      // `RenderFormItemInForm`, which routes container codes back to `WorkOrderRenderFormItem` — so
      // a group inside a horizontal row does work. (The blank-render branch that made this look
      // broken is only reachable when the row sits inside a `FORM_LIST`, and putting a container in
      // an `array` is already a 422.) Warning here would push tenants to restructure forms around a
      // limit that does not exist, and would contradict what we told EVN in the handover doc.
      const warnings: string[] = [];
      // Their horizontal row is the ONLY arrangement container the create renderer has, so a
      // vertical stack comes out laid on its side. Silently flipping a layout the author chose is
      // the same failure the past-date warning exists to prevent.
      if (node.direction === "vertical") {
        warnings.push("Khoảng cách xếp dọc sẽ xuất thành hàng NGANG — EVN không có kiểu xếp dọc.");
      }
      return map("COMPONENT_HORIZONAL", warnings);
    }

    // ── Containers that dissolve ────────────────────────────────────────────────────────────
    case "collapse":
      // The panels inside become the sections; this wrapper has no counterpart.
      return { kind: "unwrap", warnings: [] };
    case "form-layout":
      return { kind: "unwrap", warnings: [] };
    case "grid":
      return {
        kind: "unwrap",
        warnings: ["Bố cục chia cột không được giữ; các trường xếp lần lượt."],
      };

    // ── No target ───────────────────────────────────────────────────────────────────────────
    // Reasons name only OUR field type and OUR reason. They become the 422 body at P2h, which must
    // not leak EVN's internal vocabulary back to a caller.
    case "time":
      return reject("Không có ô chỉ chọn giờ; hãy dùng ô ngày (có kèm giờ) thay thế.");
    case "time-range":
      return reject("Không có ô chỉ chọn khoảng giờ; hãy dùng khoảng ngày (có kèm giờ) thay thế.");
    case "lookup":
      return reject(
        "Không có ô tra cứu dùng chung; các ô tra cứu bên nhận đều gắn cứng với một loại phiếu.",
      );
    case "password":
      // Mapping to a text input would print the value on screen. Refusing is the safe answer.
      return reject("Không có ô nhập che ký tự; xuất đi sẽ hiển thị nguyên giá trị.");
    case "checkbox":
      return reject("Không có ô tích đơn; hãy dùng ô chọn một trong hai giá trị.");
    case "switch":
      return reject("Không có công tắc bật/tắt; hãy dùng ô chọn một trong hai giá trị.");
    case "tabs":
    case "tab-pane":
      return reject("Không có bố cục thẻ tab; hãy tách thành các mục thu/mở.");
    case "steps":
    case "step":
      return reject("Không có bố cục các bước; hãy tách thành các mục thu/mở.");
  }
}

function map(typeCode: string, warnings: readonly string[] = []): TypeMapping {
  return { kind: "map", typeCode, warnings };
}

function reject(reason: string): TypeMapping {
  return { kind: "reject", reason };
}

/** How often a code appears in create-form templates; absent from the census means never. */
export function createUsageOf(typeCode: string): number {
  return EVN_TEMPLATE_USAGE[typeCode]?.create ?? 0;
}
