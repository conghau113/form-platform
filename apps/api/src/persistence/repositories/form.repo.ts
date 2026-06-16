import type { FormSchema } from "@org/form-schema";

/** Where a form sits in the workspace — org metadata that lives OUTSIDE the form contract. */
export interface FormUpsertMeta {
  projectId: string;
  folderId?: string | null;
}

/** Query for listing a folder's (or project's) forms. Omit `folderId` for the whole project. */
export interface FormListQuery {
  projectId: string;
  /** `null` → project-root forms only; `undefined` → all forms in the project. */
  folderId?: string | null;
}

/** Org-index summary of a form (no body) — cheap to list a folder without parsing every contract. */
export interface FormSummary {
  id: string;
  projectId: string;
  folderId: string | null;
  title: string;
  status: string | null;
  updatedAt: Date;
}

/**
 * Persistence boundary for form bodies (D4: services depend on this interface, never on
 * Prisma). The stored `body` is the already-migrated contract; the repo only stores/loads it
 * and the org index alongside — it never validates (that is the service's `migrate()` gate).
 */
export abstract class FormRepo {
  /** Upsert by `form.id`; returns the stored contract. */
  abstract upsert(form: FormSchema, meta: FormUpsertMeta): Promise<FormSchema>;
  /** Load a form contract by id, or `null` when absent (service maps null → 404). */
  abstract load(id: string): Promise<FormSchema | null>;
  /** The org-index summary of a form (no body), or `null` — for placement/ownership checks. */
  abstract findSummary(id: string): Promise<FormSummary | null>;
  /** List form summaries (no body) for a project/folder, most-recently-updated first. */
  abstract listSummaries(query: FormListQuery): Promise<FormSummary[]>;
  /** Move a form to another folder within its project (`null` → project root). */
  abstract move(id: string, folderId: string | null): Promise<FormSummary | null>;
  /** Delete a form by id; no-op if already absent. */
  abstract delete(id: string): Promise<void>;
}
