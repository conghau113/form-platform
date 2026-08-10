import type { FieldNode } from "@org/form-schema";

/**
 * Fill an item's `description` — the per-control settings bag EVN's create renderer reads (P2c).
 *
 * `description` is a free-form JSON column on their side (`create-form.dto.ts:37` `@IsOptional()
 * description?: any`, stored `type: 'json'`, returned unmodified by `forms.service.ts:198-231`), so
 * whatever we put here is exactly what their renderer sees. Nothing normalises it for us, which cuts
 * both ways: every key below was checked to have a *reader* in
 * `web-admin/src/features/workOrder/workOrderManager`, because a key nobody reads is a key that
 * makes an integrator believe a setting travelled when it did not.
 *
 * Keys their shipped templates use heavily but which are deliberately absent — measured, not
 * overlooked. Three have no reader at all: `isWeb` (333 uses) and `styleValue` (232) are read
 * nowhere in either of their two repos, and `maxLength` (35) is overridden by a hard-coded
 * `maxLength={10000}` at `TextareaHandle.tsx:19`. Three more do have readers but no honest source
 * on our side: `styleLabel` is a raw Tailwind class string (most often white text, legible only on
 * their coloured header); `width` is an antd *table column* width inside `FORM_LIST`, a different
 * axis from our 24-column form grid; and `size` (a `"50MB"` string on 13/13 of their uploads) has
 * no counterpart in `uploadFieldSchema` — omitting it means their client-side size guard never
 * fires, which loses nothing an author here could have expressed. All six are in the handover doc.
 *
 * Measurements and their sources: `~/.claude/plans/evn-p2c-description.md` §1.
 */

/** What `descriptionOf` produces: the bag itself (when non-empty) plus anything the author lost. */
export interface DescriptionResult {
  description?: Record<string, unknown>;
  warnings: readonly string[];
}

/**
 * Codes whose renderer reads `description.disable`.
 *
 * Measured branch by branch rather than assumed — an earlier draft of this list guessed that the
 * choice controls ignored it and would have dropped `disable` for every select, tree-select and
 * upload in the export. `disable` is the second most used key in their own create templates
 * (TEXT_INPUT 34, SELECT 21, SELECT_TREE_ONE 12, TEXTAREA 11).
 *
 * Not here, also measured: `RADIO` (no `disable` anywhere in `RadioItemHandle.tsx`) and the three
 * date codes (`CheckTyprCodeRenderItem.tsx:392,436,515` pass only the form-wide `isDisableForm`).
 * `FORM_LIST` does read it (`SharedDragEditTableInForm.tsx:81`) but our `arrayFieldSchema` has no
 * `disabled`/`readOnly` to source it from, so it stays out.
 */
const DISABLE_AWARE_CODES: ReadonlySet<string> = new Set([
  "TEXT_INPUT", // InputItemhandle.tsx:24,32
  "TEXTAREA", // TextareaHandle.tsx:13,20
  "NUMBER_INPUT", // CheckTyprCodeRenderItem.tsx:305,309
  "SELECT", // SelectItemHandle.tsx:46,238
  "SELECT_MULTIPLE", // idem
  "SELECT_TAGS", // SelectedTagsItemRender.tsx:34,101
  "SELECT_TREE_ONE", // TreeSelectItemHandle.tsx:44,189
  "SELECT_TREE_MULTIPLE", // idem
  "FILE_MULTIPLE", // SharedUploadFile.tsx:43,224,318
]);

/** Codes that take a static option list. All four consume it through the shape in {@link optionsOf}. */
const OPTION_BEARING_CODES: ReadonlySet<string> = new Set([
  "SELECT",
  "SELECT_MULTIPLE",
  "SELECT_TAGS",
  "SELECT_TREE_ONE",
  "SELECT_TREE_MULTIPLE",
  "RADIO",
]);

const OPTIONS_EMPTY =
  "Ô chọn không có lựa chọn nào để xuất; người dùng bên nhận sẽ mở ra một danh sách rỗng.";

const OPTIONS_REMOTE =
  "Danh sách lựa chọn lấy từ nguồn dữ liệu từ xa nên không xuất được — địa chỉ đó là của hệ thống " +
  "này, bên nhận gọi trên hệ thống của họ. Hãy nhập sẵn các lựa chọn nếu muốn chúng đi kèm.";

/**
 * Their number input defaults `min` to 1 when the key is absent
 * (`CheckTyprCodeRenderItem.tsx:305`), so an unbounded number field of ours silently gains a floor
 * on their screen. We cannot express "no minimum" in their vocabulary — omitting the key IS the
 * floor — so the only honest move is to say so.
 */
const NUMBER_HIDDEN_FLOOR =
  "Ô số không khai giá trị nhỏ nhất; bên nhận sẽ tự chặn dưới ở 1 — không nhập được 0 hay số âm.";

/**
 * With both bounds set, their `onChange` resets an out-of-range entry to the literal `1`
 * (`CheckTyprCodeRenderItem.tsx:310-326`) rather than to `min`, so the correction can land below the
 * author's own minimum.
 */
const NUMBER_RESET_TO_ONE =
  "Giá trị ngoài khoảng cho phép sẽ bị bên nhận đặt lại thành 1, kể cả khi 1 nhỏ hơn giá trị nhỏ nhất đã khai.";

/**
 * Two different outcomes, so two different sentences.
 *
 * When SOME segments survive, the filter got narrower and the dropped formats become unusable. When
 * NONE survive we emit `acceptFile: ""`, which is falsy on their side (`SharedUploadFile.tsx:73`)
 * and therefore means "any file" — the opposite of a narrower filter. Saying "you will not be able
 * to pick those formats" in that case would be false in both halves: the user can pick them, and
 * everything else too. A field restricted to images ends up unrestricted, and that has to be the
 * thing the warning says.
 */
const ACCEPT_NOT_EXTENSIONS =
  "Bên nhận chỉ hiểu danh sách phần mở rộng tệp (ví dụ .pdf,.docx), không hiểu kiểu MIME, nên " +
  "những mục sau đã bị bỏ khỏi bộ lọc tệp và người dùng bên đó sẽ không chọn được các định dạng ấy";

const ACCEPT_FILTER_LOST =
  "Bên nhận chỉ hiểu danh sách phần mở rộng tệp (ví dụ .pdf,.docx), không hiểu kiểu MIME, nên " +
  "không mục nào trong bộ lọc tệp dùng được — trường này sẽ nhận MỌI định dạng, thay vì chỉ";

const DEFAULT_VALUE_RESERVED_PREFIX =
  'Giá trị mặc định bắt đầu bằng "KEY_" không được xuất — đó là tiền tố dành riêng của bên nhận để trỏ sang trường khác.';

/**
 * Build the `description` for one item, and report what could not travel.
 *
 * `typeCode` rather than the node type decides most keys, because the reader lives on their side:
 * `text` and `color` both arrive as `TEXT_INPUT` and get the same treatment, while `select` splits
 * three ways depending on its variant.
 */
export function descriptionOf(node: FieldNode, typeCode: string): DescriptionResult {
  const description: Record<string, unknown> = {};
  const warnings: string[] = [];
  const read = (key: string): unknown => (node as unknown as Record<string, unknown>)[key];

  if (OPTION_BEARING_CODES.has(typeCode)) {
    const options = optionsOf(node);
    if (options.length > 0) {
      // The nested `{ data: [...] }` is not a stylistic choice. `RadioItemHandle.tsx:82` reads
      // `handleCheckDataInDescription(description)?.data?.data`, so a bare array leaves the radio
      // with NO options and no error; the select-family (`SelectItemHandle.tsx:467`,
      // `TreeSelectItemHandle.tsx:237`, `SelectedTagsItemRender.tsx:234`) reads `data?.data ?? data`
      // and accepts both. The nested shape is the only one that works everywhere — even though
      // their own docs (`form.constant.ts:60-62`, `COMPONENT_TYPES.md:43`) document the bare array.
      description.isApi = false;
      description.data = { data: options };
    } else if (read("dataSource") !== undefined) {
      warnings.push(OPTIONS_REMOTE);
    } else {
      warnings.push(OPTIONS_EMPTY);
    }
  }

  if (
    DISABLE_AWARE_CODES.has(typeCode) &&
    (read("disabled") === true || read("readOnly") === true)
  ) {
    description.disable = true;
  }

  if (typeCode === "TEXTAREA") {
    const autoSize = read("autoSize");
    // The boolean form ("grow freely") has no counterpart: their default is a bounded
    // `{minRows:1,maxRows:5}` (`TextareaHandle.tsx:18`), and inventing bounds would cap a field the
    // author deliberately left unbounded.
    if (isRecord(autoSize)) {
      const bounds: Record<string, unknown> = {};
      if (typeof autoSize.minRows === "number") bounds.minRows = autoSize.minRows;
      if (typeof autoSize.maxRows === "number") bounds.maxRows = autoSize.maxRows;
      if (Object.keys(bounds).length > 0) description.autoSize = bounds;
    }
  }

  if (typeCode === "NUMBER_INPUT") {
    const min = read("min");
    // `rate` counts stars instead of carrying bounds, so `count` is its honest upper bound.
    const max = node.type === "rate" ? read("count") : read("max");
    if (typeof min === "number") description.min = min;
    else warnings.push(NUMBER_HIDDEN_FLOOR);
    if (typeof max === "number") description.max = max;
    // Their guard is `if (max && min)` — TRUTHINESS, not presence (`CheckTyprCodeRenderItem.tsx:311`),
    // evaluated after `min` has already defaulted to 1. So the reset happens whenever `max` is
    // truthy and the effective minimum is non-zero: `{max:10}` alone DOES reset, and `{min:0,max:10}`
    // does NOT. Mirroring the presence of the keys instead would warn in exactly the wrong two cases.
    const effectiveMin = typeof min === "number" ? min : 1;
    if (typeof max === "number" && max !== 0 && effectiveMin !== 0) {
      warnings.push(NUMBER_RESET_TO_ONE);
    }
    if (read("controls") === false) description.controls = false;
  }

  if (typeCode === "FILE_MULTIPLE") {
    const maxCount = read("maxCount");
    const accepted = acceptFileOf(read("accept"));
    if (accepted.dropped.length > 0) {
      const prefix = accepted.value === "" ? ACCEPT_FILTER_LOST : ACCEPT_NOT_EXTENSIONS;
      warnings.push(`${prefix} (${accepted.dropped.join(", ")})`);
    }
    if (typeof maxCount === "number") description.max = maxCount;
    // ⚠️ DO NOT "clean up" this fallback to `""`. `CheckTyprCodeRenderItem.tsx:557` destructures
    // `handleCheckDataInDescription(description)` WITHOUT a `?? {}` guard, and that helper
    // (`:66-110`) returns `undefined` whenever `_.size(description)` is 0 — absent or `{}` alike.
    // An upload field with no `description` therefore throws `Cannot destructure property
    // 'acceptFile' of 'undefined'` and takes their whole create screen down. An empty `acceptFile`
    // is falsy on their side (`SharedUploadFile.tsx:73`), meaning "any file", so this changes
    // nothing except that the object is non-empty.
    description.acceptFile = accepted.value;
  }

  if (typeCode === "TEXT_INPUT") {
    const defaultValue = read("defaultValue");
    if (typeof defaultValue === "string" || typeof defaultValue === "number") {
      // `KEY_*` is their reserved prefix for "read another field". `InputItemhandle.tsx:140` would
      // in fact print it verbatim, but the same string means a reference on SELECT
      // (`SelectItemHandle.tsx:68`) and HIDDEN (`HiddenItemHandle.tsx:16`) — colliding with a
      // convention of theirs is not worth a default value.
      if (typeof defaultValue === "string" && defaultValue.startsWith("KEY_")) {
        warnings.push(DEFAULT_VALUE_RESERVED_PREFIX);
      } else {
        description.value = defaultValue;
      }
    }
  }

  return Object.keys(description).length > 0 ? { description, warnings } : { warnings };
}

/**
 * Whether this node's `defaultValue` reached the export.
 *
 * Lives here so the "default values are dropped" warning can narrow to the nodes where it is still
 * true, instead of firing for a form whose defaults all travelled.
 */
export function defaultValueExported(node: FieldNode, typeCode: string): boolean {
  if (typeCode !== "TEXT_INPUT") return false;
  const defaultValue = (node as unknown as Record<string, unknown>).defaultValue;
  if (typeof defaultValue === "number") return true;
  return typeof defaultValue === "string" && !defaultValue.startsWith("KEY_");
}

/** Whether this node's locked state reached the export, for the same reason as above. */
export function lockedStateExported(node: FieldNode, typeCode: string): boolean {
  const record = node as unknown as Record<string, unknown>;
  // No `readPretty` anywhere in their create renderer: a review-mode field has nowhere to land.
  if (record.readPretty === true) return false;
  return DISABLE_AWARE_CODES.has(typeCode);
}

/**
 * Translate our `accept` into the only thing their upload control can match against.
 *
 * Our `accept` is the HTML attribute (`schema.ts:441`, and the builder prompts for
 * `"image/*,.pdf"`). Theirs is not: `SharedUploadFile.tsx:73-79` splits on `,`, calls
 * `ext.replace('.', '')` — the FIRST dot only, and no trim — then requires an exact match against
 * `fileName.replace(/^.*\./,'').toLowerCase()` (`fileUtil.ts:6-9,30-34`).
 *
 * So anything that is not a lowercase dot-extension silently rejects every file the author meant to
 * allow: `image/*` stays `image/*` and matches nothing, `.PDF` becomes `PDF` and fails against
 * `pdf`, and a space after a comma turns `.docx` into `" docx"`. All 12 `acceptFile` values in
 * their shipped templates are lowercase dot-extension lists — the only shape ever exercised.
 *
 * Passing our value through unchanged would therefore produce an upload field that accepts NOTHING,
 * which is the same class of defect as the missing-description crash. We normalise what can be
 * normalised and name what cannot, rather than emitting a filter that matches nothing.
 */
function acceptFileOf(accept: unknown): { value: string; dropped: string[] } {
  if (typeof accept !== "string" || accept.trim() === "") return { value: "", dropped: [] };

  const kept: string[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (const raw of accept.split(",")) {
    const segment = raw.trim();
    if (segment === "") continue;
    // `.pdf,.PDF` collapses to one entry: both fold to `pdf` for matching, and their rejection
    // toast prints the raw list back at the user ("Chỉ chấp nhận định dạng PDF, PDF").
    if (seen.has(segment.toLowerCase())) continue;
    seen.add(segment.toLowerCase());
    // A single leading dot and nothing else dotted: `.tar.gz` would lose everything after the first
    // dot on their side too, so it is reported rather than half-translated.
    if (/^\.[a-z0-9]+$/i.test(segment)) kept.push(segment.toLowerCase());
    else dropped.push(segment);
  }
  // An empty string is "any file" over there. Emitting a filter that matches nothing would be worse
  // than emitting no filter, and the dropped list is already reported as a warning.
  return { value: kept.join(","), dropped };
}

interface EvnOption {
  label: string;
  value: string | number;
  children?: EvnOption[];
}

/**
 * Our options, in the `{label, value}` shape antd renders.
 *
 * Their controls read `option.label` directly (`SelectItemHandle.tsx:477` filters on it,
 * `maxTagPlaceholder` prints it), which is what our `optionSchema` already carries. `i18n` is
 * dropped — it has no reader there, and the dropped-translations warning already covers it.
 */
function optionsOf(node: FieldNode): EvnOption[] {
  const raw = (node as unknown as Record<string, unknown>).options;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): EvnOption[] => {
    if (!isRecord(entry)) return [];
    const { label, value } = entry;
    if (typeof label !== "string") return [];
    if (typeof value !== "string" && typeof value !== "number") return [];
    const option: EvnOption = { label, value };
    // Tree options nest; `@rc-component/tree-select` resolves the title as `['title','label']`, so
    // `label` is a fallback rather than the primary key — it renders, and nothing here passes
    // `fieldNames` to change that.
    const children = Array.isArray(entry.children)
      ? optionsOf({ options: entry.children } as unknown as FieldNode)
      : [];
    if (children.length > 0) option.children = children;
    return [option];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
