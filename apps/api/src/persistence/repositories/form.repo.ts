import type { FormSchema } from "@org/form-schema";

/** Where a form sits in the workspace — org metadata that lives OUTSIDE the form contract. */
export interface FormUpsertMeta {
  projectId: string;
  folderId?: string | null;
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
}
