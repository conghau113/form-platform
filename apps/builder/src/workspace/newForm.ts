import { CURRENT_FORM_VERSION, type FormSchema, migrate } from "@org/form-schema";

/** Slugify a title into a url/filename-safe id, with a short random suffix for uniqueness. */
function slugId(title: string): string {
  const base =
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "form";
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${base}-${suffix}`;
}

/** A fresh, empty, `migrate()`-valid form contract for the Explorer "new form" flow. */
export function newForm(title: string): FormSchema {
  return migrate({
    formVersion: CURRENT_FORM_VERSION,
    id: slugId(title),
    title: title.trim() || "Biểu mẫu chưa đặt tên",
    fields: [],
  });
}

/** A copy of an existing form for duplication: fresh id, " (bản sao)" suffix on the title. */
export function duplicateForm(source: FormSchema): FormSchema {
  const title = `${source.title} (bản sao)`;
  return { ...source, id: slugId(title), title };
}
