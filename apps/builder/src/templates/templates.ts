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
  preset("blank", "Blank form", "An empty form to start from scratch.", {
    formVersion: 3,
    id: "untitled",
    title: "Untitled form",
    fields: [],
  }),
  preset("contact", "Contact request", "Name, email and a conditional country field.", formV1),
  preset(
    "onboarding",
    "Employee onboarding",
    "Tabs, cards and a grid — a layout-container showcase.",
    formV3,
  ),
  preset("feedback", "Feedback survey", "Rating, recommendation and free-text comments.", {
    formVersion: 3,
    id: "feedback-survey",
    title: "Feedback survey",
    fields: [
      { type: "rate", name: "rating", label: "Overall rating", required: true },
      {
        type: "radio",
        name: "recommend",
        label: "Would you recommend us?",
        options: [
          { label: "Yes", value: "yes" },
          { label: "No", value: "no" },
        ],
      },
      { type: "textarea", name: "comments", label: "Comments" },
    ],
  }),
  preset("registration", "Event registration", "Attendee details and session choice.", {
    formVersion: 3,
    id: "event-registration",
    title: "Event registration",
    fields: [
      {
        type: "grid",
        cols: 2,
        children: [
          { type: "text", name: "fullName", label: "Full name", required: true },
          { type: "text", name: "email", label: "Email", required: true },
        ],
      },
      { type: "number", name: "guests", label: "Number of guests" },
      {
        type: "select",
        name: "session",
        label: "Session",
        options: [
          { label: "Morning", value: "am" },
          { label: "Afternoon", value: "pm" },
        ],
      },
      { type: "checkbox", name: "terms", label: "I accept the terms", required: true },
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
        title: title.trim() || "Untitled template",
        description: "Saved from the builder",
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
