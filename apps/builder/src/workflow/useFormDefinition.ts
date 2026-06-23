import { type FormSchema, migrate } from "@org/form-schema";
import { useQuery } from "@tanstack/react-query";
import { getForm } from "../editor/client";
import { qk } from "../query";

export interface FormDefinitionStore {
  /** The loaded + migrated form, or `null` while loading / when no form is bound. */
  definition: FormSchema | null;
  loading: boolean;
  error: string | null;
}

/**
 * Loads + migrates a saved form by id for the workflow node's bound-form preview. Cached on the
 * shared `qk.form(id)` key so a form save (which `useFormPersistence` invalidates) refreshes any
 * open preview. Mirrors the migrate step in `useFormPersistence.onLoad`, but stays a passive read
 * (no editor history side effects). Disabled when `formId` is absent.
 */
export function useFormDefinition(formId: string | undefined): FormDefinitionStore {
  const query = useQuery<FormSchema, Error>({
    queryKey: qk.form(formId ?? ""),
    enabled: !!formId,
    queryFn: async () => {
      const res = await getForm(formId as string);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? res.statusText);
      return migrate(data);
    },
  });

  return {
    definition: query.data ?? null,
    loading: query.isPending && !!formId,
    error: query.error ? query.error.message : null,
  };
}
