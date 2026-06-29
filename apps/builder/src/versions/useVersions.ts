import type { FormSchema, FormVersion } from "@org/form-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "../query";
import type { FormVersionSummary } from "../workspace/types";
import * as api from "./client";

/**
 * Form version data hooks (FB1b), react-query like {@link useSubmissions}. The server owns the
 * immutable history, so a mutation just `invalidateQueries` and the next read reflects it. `fetch`
 * lives only in `client.ts`. The version list is keyed per form; one version by form+number; the
 * active published version per form.
 */

/** Lists a form's published versions (summaries), newest first. */
export function useFormVersions(formId: string | undefined): {
  versions: FormVersionSummary[];
  loading: boolean;
} {
  const query = useQuery({
    queryKey: qk.versions(formId ?? ""),
    queryFn: () => api.listVersions(formId as string),
    enabled: !!formId,
  });
  return { versions: query.data ?? [], loading: query.isPending && !!formId };
}

/** Loads one published version (with body) for the view/diff panel. */
export function useVersion(
  formId: string | undefined,
  version: number | undefined,
): { version: FormVersion | null; loading: boolean } {
  const query = useQuery({
    queryKey: qk.version(formId ?? "", version ?? 0),
    queryFn: () => api.getVersion(formId as string, version as number),
    enabled: !!formId && version != null,
  });
  return { version: query.data ?? null, loading: query.isPending && !!formId && version != null };
}

/** Loads the form's active published version body, or `null` when it was never published. Drives the
 *  editor publish badge + the default diff base. */
export function useActiveVersion(formId: string | undefined): {
  active: FormVersion | null;
  loading: boolean;
} {
  const query = useQuery({
    queryKey: qk.activeVersion(formId ?? ""),
    queryFn: () => api.getActiveVersion(formId as string),
    enabled: !!formId,
  });
  return { active: query.data ?? null, loading: query.isPending && !!formId };
}

/** Publishes the current saved draft as a new version; invalidates the history + active version so
 *  the list and the badge update. Rejects on failure so the caller can surface the message. */
export function usePublishForm(formId: string | undefined): () => Promise<FormVersionSummary> {
  const qc = useQueryClient();
  const publish = useMutation({
    mutationFn: () => api.publishForm(formId as string),
    onSuccess: () => {
      if (!formId) return;
      qc.invalidateQueries({ queryKey: qk.versions(formId) });
      qc.invalidateQueries({ queryKey: qk.activeVersion(formId) });
    },
  });
  return () => publish.mutateAsync();
}

/** Rolls a past version back into the editable draft; invalidates the form body + the project trees
 *  (the draft title/updatedAt may change). Returns the new draft. */
export function useCloneDraft(
  formId: string | undefined,
): (version: number) => Promise<FormSchema> {
  const qc = useQueryClient();
  const clone = useMutation({
    mutationFn: (version: number) => api.cloneDraft(formId as string, version),
    onSuccess: () => {
      if (!formId) return;
      qc.invalidateQueries({ queryKey: qk.form(formId) });
      qc.invalidateQueries({ queryKey: qk.projects }); // prefix-invalidates every project tree
    },
  });
  return (version) => clone.mutateAsync(version);
}
