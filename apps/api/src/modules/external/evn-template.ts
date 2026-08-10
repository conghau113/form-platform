import { childrenKeyOf, childrenOf, type FieldNode, type FormSchema } from "@org/form-schema";
import { defaultValueExported, descriptionOf, lockedStateExported } from "./evn-description.js";
import { EVN_ROOT_RENDERABLE_CODES } from "./evn-vocabulary.js";
import { mapNodeType } from "./type-map.js";

/**
 * Turn one of our forms into the shape EVN's `POST /forms` actually ingests (P2b).
 *
 * The target is the TEMPLATE tier — the same shape as the files in
 * `core-service/public/files/templateJSON`, which is what `CreateFormDto` parses. It is not the
 * shape their renderer receives: their backend re-reads the rows and aliases `code` to `itemCode`
 * (`forms.service.ts:106`), so emitting `itemCode` ourselves writes a key that has no column and is
 * dropped in silence.
 *
 * Everything here is measured against their sources rather than their integration document, which
 * disagrees with the shipped templates in several places. The measurements are recorded in
 * `~/.claude/plans/evn-p2b-export-shape.md` §1 and re-derivable with
 * `src/scripts/measure-evn-templates.ts`.
 */

/**
 * Keys that must never appear anywhere in what leaves this endpoint.
 *
 * - `permissions` holds `viewRoles`/`editRoles` — **the tenant's own Role codes**. Field-level RBAC
 *   is enforced here, not there, so the integration has no use for them.
 * - `url` appears on the remote-fetch shapes (`asyncValidator`, `dataSource`, `lookup`) and
 *   `submitUrl` under `settings`. Both point at *our* endpoints; a caller that learned them would be
 *   reading our topology.
 *
 * These used to be stripped on the way out by a `redactForExternal` pass over the whole form body.
 * That pass is gone because the body is: {@link toEvnTemplate} builds its output key by key from a
 * fixed list, so there is no path by which any of these could reach a caller. This constant exists
 * so the test can assert that property directly instead of trusting the sentence.
 *
 * ⚠️ `packages/form-ai/src/sanitize.ts` is the other egress and host-allowlists rather than strips.
 * A new URL-bearing schema field still has to be considered there.
 */
export const FORBIDDEN_OUTPUT_KEYS: readonly string[] = ["permissions", "url", "submitUrl"];

/**
 * Codes that break when placed inside a `FORM_LIST`, i.e. inside our `array`.
 *
 * A `FORM_LIST`'s children are rendered as **table columns** (`SharedEditTable`), not as a nested
 * layout. Two distinct failures, both silent:
 * - `COLLAPSE` and `COMPONENT_HORIZONAL` are pattern-matched into the pinned right-hand action
 *   column (`SharedEditTable.tsx:120`), so a labelled `group` inside an `array` reappears as the
 *   row's delete button.
 * - `CARD` has no branch in the column renderer and falls through to
 *   `CheckTyprCodeRenderItem.tsx:614` `default: return <></>` — the whole subtree vanishes.
 *
 * `FORM_LIST` itself is deliberately absent: it *does* have a branch (`:580`), so an `array` inside
 * an `array` renders a nested table and is allowed.
 *
 * Hand-written rather than generated, unlike the vocabulary: this is a three-way conclusion drawn
 * from control flow across two components, not a catalog that can be counted. `evn-template.test.ts`
 * pins it.
 */
const ARRAY_HOSTILE_CODES: ReadonlySet<string> = new Set([
  "CARD",
  "COLLAPSE",
  "COMPONENT_HORIZONAL",
]);

const ROOT_RENDERABLE: ReadonlySet<string> = new Set(EVN_ROOT_RENDERABLE_CODES);

/** One node of the template tree. Optional keys are omitted, never emitted empty (§1 N-D2/3/5). */
export interface EvnFormItem {
  code: string;
  typeCode: string;
  priority: number;
  label?: string;
  placeholder?: string;
  required?: boolean;
  /** Per-control settings; built key by key in `evn-description.ts`, never a passthrough of ours. */
  description?: Record<string, unknown>;
  children?: EvnFormItem[];
}

/** The document `CreateFormDto` parses. `formTypeName` is omitted unless the binding supplies one. */
export interface EvnFormTemplate {
  formTypeCode: string;
  formTypeName?: string;
  formCode: string;
  formName: string;
  layout: string;
  formItems: EvnFormItem[];
}

/** One reason a form cannot be exported. `field` names OUR field; `reason` speaks OUR vocabulary. */
export interface EvnExportError {
  field: string;
  reason: string;
}

export type EvnExportResult =
  | { ok: true; template: EvnFormTemplate; warnings: string[] }
  | { ok: false; errors: EvnExportError[] };

export interface EvnTemplateMeta {
  formTypeCode: string;
  formCode: string;
  /** Display name of the ticket type, from the binding. Absent is a warning, never a guess. */
  formTypeName?: string;
}

/**
 * Every create template ships `layout: "horizontal"` (8/8). Our three layout values are all members
 * of their `layoutForm` enum, so an authored one passes through unchanged.
 */
const DEFAULT_LAYOUT = "horizontal";

/**
 * Convert, or explain why not.
 *
 * Collects **every** problem before returning: an integrator fixing one field at a time across six
 * round-trips is the failure mode this avoids.
 */
export function toEvnTemplate(form: FormSchema, meta: EvnTemplateMeta): EvnExportResult {
  const ctx: Ctx = { errors: [], warnings: [], dropped: new Set() };

  // `?? []` is unreachable from the HTTP path — `external.service.ts` migrates the frozen snapshot
  // first, and `formSchema.parse` makes `fields` mandatory. It stays because this is an exported
  // pure function: a caller that has a `FormSchema` by construction rather than by parse is a legal
  // caller, and the whole point of this surface is that every failure on it is a deliberate status
  // rather than a `TypeError` from somewhere in the walk.
  let items = convert(form.fields ?? [], [], "fields", false, ctx);
  items = wrapStrayRootLeaves(items, ctx);

  collectDuplicateCodes(items, ctx);
  if (ctx.errors.length > 0) return { ok: false, errors: ctx.errors };

  if (meta.formTypeName === undefined) {
    // Their `FormType.name` is NOT NULL and `saveFormType` upserts by code: inventing a name would
    // overwrite the display name of a ticket type they already have, and omitting one makes the
    // first ingest of a *new* ticket type fail outright. Neither is silent here.
    ctx.warnings.push(
      "Loại phiếu chưa khai tên hiển thị; nếu bên nhận chưa có loại phiếu này thì lần nạp đầu sẽ bị từ chối.",
    );
  }
  for (const warning of DROPPED_FEATURE_WARNINGS) {
    if (ctx.dropped.has(warning.key)) ctx.warnings.push(warning.message);
  }

  return {
    ok: true,
    template: {
      formTypeCode: meta.formTypeCode,
      ...(meta.formTypeName === undefined ? {} : { formTypeName: meta.formTypeName }),
      formCode: meta.formCode,
      formName: form.title,
      layout: form.layoutProps?.layout ?? DEFAULT_LAYOUT,
      formItems: assignPriorities(items),
    },
    warnings: ctx.warnings,
  };
}

/** What a node carries that the export cannot express. Order here is the order warnings appear. */
const DROPPED_FEATURE_WARNINGS: readonly { key: DroppedFeature; message: string }[] = [
  {
    key: "permissions",
    message:
      "Phân quyền theo vai của trường không xuất đi; bên nhận sẽ hiển thị trường cho MỌI vai.",
  },
  {
    key: "visibleWhen",
    message: "Điều kiện ẩn/hiện không xuất đi; trường sẽ luôn hiển thị.",
  },
  {
    key: "validations",
    // Not a gap on their side: `CreateFormItemDto.validations` exists and their renderer evaluates
    // regex / field-comparison rules. This is a capability of theirs we are not using yet.
    message:
      "Quy tắc kiểm tra dữ liệu không xuất đi, dù bên nhận có hỗ trợ — trường chỉ còn ràng buộc bắt buộc/không bắt buộc.",
  },
  {
    key: "locked",
    // Narrowed since P2c: `disable` now travels for the codes in `DISABLE_AWARE_CODES`, so this
    // only fires for the ones left over (radio, the date controls, containers, `readPretty`).
    message:
      "Trạng thái khoá/chỉ-đọc của MỘT SỐ trường không xuất đi (ô chọn một trong nhiều, ô ngày, và chế độ chỉ xem); người dùng bên nhận vẫn sửa được các trường đó.",
  },
  {
    key: "asyncValidator",
    message: "Kiểm tra từ xa khi nhập không xuất đi.",
  },
  {
    key: "defaultValue",
    // Narrowed since P2c: a scalar default on a text field travels as `description.value`. Only
    // the rest — other controls, and non-scalar defaults — are still lost.
    message:
      "Giá trị mặc định của MỘT SỐ trường không xuất đi (ngoài ô chữ, và mọi giá trị không phải chữ/số); những trường đó sẽ trống khi mở phiếu.",
  },
  {
    key: "i18n",
    message: "Bản dịch đa ngôn ngữ không xuất đi; chỉ ngôn ngữ đã soạn được gửi.",
  },
];

type DroppedFeature =
  | "permissions"
  | "visibleWhen"
  | "validations"
  | "locked"
  | "asyncValidator"
  | "defaultValue"
  | "i18n";

interface Ctx {
  errors: EvnExportError[];
  warnings: string[];
  dropped: Set<DroppedFeature>;
}

/** An item before priorities are numbered — they can only be assigned once the tree stops moving. */
interface Draft {
  code: string;
  typeCode: string;
  label?: string;
  placeholder?: string;
  required?: true;
  description?: Record<string, unknown>;
  children?: Draft[];
}

/**
 * Walk our tree, producing theirs.
 *
 * `path` is the index path in the SOURCE tree and is what generated codes are derived from, so a
 * node keeps its code no matter how `unwrap` rearranges the output. `label` is the human-readable
 * form of the same position, used when a rejected node has no `name` to blame.
 */
function convert(
  nodes: FieldNode[],
  path: number[],
  label: string,
  inArray: boolean,
  ctx: Ctx,
): Draft[] {
  const out: Draft[] = [];

  for (const [index, node] of nodes.entries()) {
    const childPath = [...path, index];
    const childLabel = `${label}[${index}]`;
    const mapping = mapNodeType(node);

    if (mapping.kind === "reject") {
      // Deliberately does not descend. The subtree's fate depends on how the author restructures
      // the rejected container, so reporting its children now would be advice about a tree that is
      // about to change.
      ctx.errors.push({ field: fieldNameOf(node) ?? childLabel, reason: mapping.reason });
      continue;
    }

    noteDroppedFeatures(node, mapping.kind === "map" ? mapping.typeCode : undefined, ctx);
    const kids = childrenOf(node);
    const kidLabel = `${childLabel}.${childrenKeyOf(node.type) ?? "children"}`;

    if (mapping.kind === "unwrap") {
      pushWarnings(ctx, node, childLabel, mapping.warnings);
      // The wrapper dissolves and its children take its place in the parent's list.
      out.push(...convert(kids ?? [], childPath, kidLabel, inArray, ctx));
      continue;
    }

    if (inArray && ARRAY_HOSTILE_CODES.has(mapping.typeCode)) {
      ctx.errors.push({
        field: fieldNameOf(node) ?? childLabel,
        reason:
          "Không đặt được nhóm/bố cục bên trong danh sách lặp; hàng của danh sách chỉ chứa được trường đơn.",
      });
      continue;
    }

    pushWarnings(ctx, node, childLabel, mapping.warnings);
    // Per-control settings and their own losses (empty option lists, the hidden numeric floor).
    // Routed through the same `pushWarnings` prefix so one array does not carry two styles.
    const settings = descriptionOf(node, mapping.typeCode);
    pushWarnings(ctx, node, childLabel, settings.warnings);
    const children =
      kids === null
        ? undefined
        : convert(kids, childPath, kidLabel, inArray || node.type === "array", ctx);

    // Keys are attached only when they carry something. `undefined` would serialize as absent
    // anyway; building the object this way is what lets the deep-scan test read the real shape.
    const item: Draft = { code: codeOf(node, childPath), typeCode: mapping.typeCode };
    const itemLabel = labelOf(node);
    if (itemLabel !== undefined) item.label = itemLabel;
    const placeholder = placeholderOf(node);
    if (placeholder !== undefined) item.placeholder = placeholder;
    if (requiredOf(node)) item.required = true;
    if (settings.description !== undefined) item.description = settings.description;
    // Never `children: []` — no shipped template has one (0/522).
    if (children && children.length > 0) item.children = children;
    out.push(item);
  }

  return out;
}

/**
 * Wrap runs of root-level nodes that would render as nothing.
 *
 * The root is entered through `WorkOrderRenderFormItem`, whose `default:` branch renders a node's
 * children and not the node itself — so a bare leaf at the root produces no markup, silently. Every
 * shipped create template puts only containers at the root for exactly this reason.
 *
 * Wrapped per contiguous RUN, not all into one card. Gathering `[leaf, CARD, leaf]` into a single
 * wrapper would move the second leaf across the author's own card, and giving both wrappers the
 * same generated code would then trip the duplicate check — rejecting the very form the wrapping
 * exists to rescue.
 */
function wrapStrayRootLeaves(items: Draft[], ctx: Ctx): Draft[] {
  if (items.every((item) => ROOT_RENDERABLE.has(item.typeCode))) return items;

  const out: Draft[] = [];
  let run: Draft[] = [];
  const flush = () => {
    if (run.length === 0) return;
    out.push({ code: `GEN_ROOT_CARD_${out.length}`, typeCode: "CARD", children: run });
    run = [];
  };

  for (const item of items) {
    if (ROOT_RENDERABLE.has(item.typeCode)) {
      flush();
      out.push(item);
    } else {
      run.push(item);
    }
  }
  flush();

  ctx.warnings.push(
    "Các trường nằm trực tiếp ở cấp ngoài cùng đã được gói vào một thẻ, vì bên nhận không hiển thị trường đặt ở cấp ngoài cùng.",
  );
  return out;
}

/**
 * Number siblings 1..n, after every rearrangement.
 *
 * Contiguous and unique on purpose, which their own templates are not: their ordering query is
 * `order by form_item_parent_id NULLS FIRST, item.priority` with no tie-break and their frontend
 * never re-sorts, so the 64 sibling groups (of 135) that carry duplicate or gapped priorities are
 * ordered by whatever Postgres returns. We do not reproduce that.
 */
function assignPriorities(items: Draft[]): EvnFormItem[] {
  return items.map((item, index) => {
    const { children, ...rest } = item;
    const numbered: EvnFormItem = { ...rest, priority: index + 1 };
    if (children) numbered.children = assignPriorities(children);
    return numbered;
  });
}

/**
 * Reject codes that repeat anywhere in the tree.
 *
 * The primary key of `form_items` is `(code, form_id)`, so a second row with the same code is an
 * UPDATE of the first: the earlier field is overwritten rather than rejected, and nobody is told.
 *
 * ⚠️ This is not an exotic case. Our `array` scopes its item field names — a row field `qty` and a
 * top-level `qty` are a legal, ordinary form here and collide into one row there. EVN's own
 * templates avoid it by prefixing row fields (`NHAN_VIEN_LIST__ORDINAL`), which is a convention on
 * their side, not a property of ours.
 */
function collectDuplicateCodes(items: Draft[], ctx: Ctx): void {
  const seen = new Set<string>();
  const reported = new Set<string>();

  const walk = (list: Draft[]): void => {
    for (const item of list) {
      if (seen.has(item.code) && !reported.has(item.code)) {
        reported.add(item.code);
        ctx.errors.push({
          field: item.code,
          reason:
            "Mã trường bị trùng trong cùng một biểu mẫu; bên nhận dùng mã làm khoá nên trường sau sẽ ghi đè trường trước.",
        });
      }
      seen.add(item.code);
      if (item.children) walk(item.children);
    }
  };

  walk(items);
}

/**
 * The code EVN keys the item by.
 *
 * An authored `name` is used VERBATIM. Normalising it to their `UPPER_SNAKE` house style would fold
 * `ho.ten` and `ho_ten` into one code and then reject the form for a collision the author never
 * wrote — inventing a failure in order to catch it. Their column is a plain `varchar` primary key
 * with no format constraint, so the convention is theirs to keep, not ours to enforce.
 *
 * The eleven nameless types get a code derived from their position in the SOURCE tree, so exporting
 * the same form twice yields the same codes. ⚠️ Inserting a sibling *before* one of them does change
 * its code, and since `form_item_codes` is a global catalog auto-populated on ingest, each such
 * re-export seeds another `GEN_*` row on their side. Recorded in the handover doc.
 */
function codeOf(node: FieldNode, path: number[]): string {
  const name = fieldNameOf(node);
  if (name !== undefined) return name;
  return `GEN_${node.type.replace(/-/g, "_").toUpperCase()}_${path.join("_")}`;
}

function fieldNameOf(node: FieldNode): string | undefined {
  return "name" in node && typeof node.name === "string" && node.name !== ""
    ? node.name
    : undefined;
}

/**
 * The text EVN shows beside the control.
 *
 * `display-text` is the odd one: their `TYPOGRAPHY` renders the item's `label` and ignores any
 * content field, so the authored prose has to travel as the label or it is simply not shown.
 * `card` carries a `title` rather than a `label` (their card component drops it — P2a warns).
 */
function labelOf(node: FieldNode): string | undefined {
  if (node.type === "display-text") return node.content || undefined;
  if ("label" in node && typeof node.label === "string" && node.label !== "") return node.label;
  if ("title" in node && typeof node.title === "string" && node.title !== "") return node.title;
  return undefined;
}

function placeholderOf(node: FieldNode): string | undefined {
  return "placeholder" in node && typeof node.placeholder === "string" && node.placeholder !== ""
    ? node.placeholder
    : undefined;
}

/**
 * Only ever `true`. Their column is `NOT NULL DEFAULT false`, so an absent key already means "not
 * required" — emitting `required: false` would be noise on 55% of nodes.
 *
 * `display-text` is excluded on purpose: `TYPOGRAPHY` appends a red asterisk when `required` is set,
 * which would decorate a paragraph of prose with a validation marker for a field that has no value.
 */
function requiredOf(node: FieldNode): true | undefined {
  if (node.type === "display-text") return undefined;
  return "required" in node && node.required === true ? true : undefined;
}

/**
 * Record what this node carries that the export cannot express.
 *
 * `typeCode` is `undefined` for a node that dissolves (`unwrap`), which has no target to carry
 * anything. Two of these warnings are conditional on it: since P2c, a locked state and a default
 * value DO travel for some codes, so firing the warning for every node that has one would report a
 * loss that did not happen. `evn-description.ts` owns both answers — the rule lives next to the
 * emission it describes rather than being restated here.
 */
function noteDroppedFeatures(node: FieldNode, typeCode: string | undefined, ctx: Ctx): void {
  const has = (key: string): boolean => key in node;
  const value = (key: string): unknown => (node as unknown as Record<string, unknown>)[key];

  if (has("permissions") && value("permissions") !== undefined) ctx.dropped.add("permissions");
  if (has("visibleWhen") && value("visibleWhen") !== undefined) ctx.dropped.add("visibleWhen");
  if (Array.isArray(value("validations")) && (value("validations") as unknown[]).length > 0) {
    ctx.dropped.add("validations");
  }
  if (value("disabled") === true || value("readOnly") === true || value("readPretty") === true) {
    if (typeCode === undefined || !lockedStateExported(node, typeCode)) ctx.dropped.add("locked");
  }
  if (has("asyncValidator") && value("asyncValidator") !== undefined) {
    ctx.dropped.add("asyncValidator");
  }
  // `false` and `0` are real default values, so presence is what counts, not truthiness.
  if (has("defaultValue") && value("defaultValue") !== undefined) {
    if (typeCode === undefined || !defaultValueExported(node, typeCode)) {
      ctx.dropped.add("defaultValue");
    }
  }
  if (has("i18n") && value("i18n") !== undefined) ctx.dropped.add("i18n");
}

/** Prefix each mapping warning with the field it is about — a bare list of caveats is unactionable. */
function pushWarnings(
  ctx: Ctx,
  node: FieldNode,
  positionLabel: string,
  warnings: readonly string[],
): void {
  if (warnings.length === 0) return;
  const subject = fieldNameOf(node) ?? labelOf(node) ?? positionLabel;
  for (const warning of warnings) ctx.warnings.push(`${subject}: ${warning}`);
}
