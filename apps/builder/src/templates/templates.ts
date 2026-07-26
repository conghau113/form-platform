import { type FormSchema, migrate } from "@org/form-schema";
import { useCallback } from "react";
import formV1 from "../../../../examples/form.v1.json";
import formV3 from "../../../../examples/form.v3.json";
import { usePersistentState } from "../workbench/persist";

/* ----------------------------------------------------------------------------
 * templates.ts — Phase I starter presets + the user-saved template store.
 *
 * A Template is just display metadata around a validated FormSchema. Built-ins
 * are migrated at module load (two reuse the example fixtures, the rest are
 * authored here); user templates live in guarded localStorage so they survive
 * reloads. "Use" in the gallery hands the schema to App's loadSchema.
 * ------------------------------------------------------------------------- */

export type Template = {
  id: string;
  title: string;
  description: string;
  schema: FormSchema;
};

/** Author a built-in from a raw doc — `migrate` validates it (any unsupported
 *  field throws here at load, which the gallery test guards against). */
function preset(id: string, title: string, description: string, doc: unknown): Template {
  return { id, title, description, schema: migrate(doc) };
}

export const BUILTIN_TEMPLATES: Template[] = [
  preset("blank", "Biểu mẫu trống", "Biểu mẫu trống để bắt đầu từ đầu.", {
    formVersion: 3,
    id: "untitled",
    title: "Biểu mẫu chưa đặt tên",
    fields: [],
  }),
  preset("contact", "Yêu cầu liên hệ", "Tên, email và trường quốc gia có điều kiện.", formV1),
  preset(
    "onboarding",
    "Tiếp nhận nhân viên",
    "Tab, thẻ và lưới — trình diễn vùng chứa bố cục.",
    formV3,
  ),
  preset("feedback", "Khảo sát phản hồi", "Đánh giá, giới thiệu và nhận xét tự do.", {
    formVersion: 3,
    id: "feedback-survey",
    title: "Khảo sát phản hồi",
    fields: [
      { type: "rate", name: "rating", label: "Đánh giá tổng thể", required: true },
      {
        type: "radio",
        name: "recommend",
        label: "Bạn có giới thiệu chúng tôi không?",
        options: [
          { label: "Có", value: "yes" },
          { label: "Không", value: "no" },
        ],
      },
      { type: "textarea", name: "comments", label: "Nhận xét" },
    ],
  }),
  preset("registration", "Đăng ký sự kiện", "Thông tin người tham dự và lựa chọn phiên.", {
    formVersion: 3,
    id: "event-registration",
    title: "Đăng ký sự kiện",
    fields: [
      {
        type: "grid",
        cols: 2,
        children: [
          { type: "text", name: "fullName", label: "Họ và tên", required: true },
          { type: "text", name: "email", label: "Email", required: true },
        ],
      },
      { type: "number", name: "guests", label: "Số khách" },
      {
        type: "select",
        name: "session",
        label: "Phiên",
        options: [
          { label: "Buổi sáng", value: "am" },
          { label: "Buổi chiều", value: "pm" },
        ],
      },
      { type: "checkbox", name: "terms", label: "Tôi đồng ý với điều khoản", required: true },
    ],
  }),
];

function isTemplate(v: unknown): v is Template {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    typeof t.title === "string" &&
    typeof t.description === "string" &&
    typeof t.schema === "object" &&
    t.schema !== null
  );
}

export function isTemplateArray(v: unknown): v is Template[] {
  return Array.isArray(v) && v.every(isTemplate);
}

/** User-saved templates, persisted to localStorage (newest first). */
export function useUserTemplates(): {
  templates: Template[];
  save: (title: string, schema: FormSchema) => void;
  remove: (id: string) => void;
} {
  const [templates, setTemplates] = usePersistentState<Template[]>(
    "templates",
    [],
    isTemplateArray,
  );
  const save = useCallback(
    (title: string, schema: FormSchema) => {
      const tpl: Template = {
        id: `user-${Date.now()}`,
        title: title.trim() || "Mẫu chưa đặt tên",
        description: "Đã lưu từ trình thiết kế",
        schema,
      };
      setTemplates((list) => [tpl, ...list]);
    },
    [setTemplates],
  );
  const remove = useCallback(
    (id: string) => setTemplates((list) => list.filter((t) => t.id !== id)),
    [setTemplates],
  );
  return { templates, save, remove };
}
