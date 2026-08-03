import type { Submission } from "@org/form-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "../query";
import type { SubmissionSummary } from "../workspace/types";
import * as api from "./client";

/**
 * Form submission data hooks (FS1), react-query like {@link useWorkflowInstances}. The server is the
 * source of truth: it re-validates and persists, so a mutation just `invalidateQueries` and the next
 * read reflects it. `fetch` lives only in `client.ts`. The list is keyed per form, a single
 * submission by its own id.
 */

/** Lists a form's submissions (summaries); refetches when `formId` changes. */
export function useSubmissions(formId: string | undefined): {
  submissions: SubmissionSummary[];
  loading: boolean;
} {
  const query = useQuery({
    queryKey: qk.submissions(formId ?? ""),
    queryFn: () => api.listSubmissions(formId as string),
    enabled: !!formId,
  });
  return { submissions: query.data ?? [], loading: query.isPending && !!formId };
}

/** Loads a single submission by id (for the detail view). Masking is entirely the server's call
 *  (E3c) — the reader has nothing to declare, so the id alone keys the cache. */
export function useSubmission(id: string | undefined): {
  submission: Submission | null;
  loading: boolean;
  error: string | null;
} {
  const query = useQuery({
    queryKey: qk.submission(id ?? ""),
    queryFn: () => api.getSubmission(id as string),
    enabled: !!id,
  });
  return {
    submission: query.data ?? null,
    loading: query.isPending && !!id,
    error: query.error ? (query.error as Error).message : null,
  };
}

/**
 * Records a submission and invalidates the form's submission list so it appears immediately.
 * `mutateAsync` rejects on a 422 so the caller can surface the server's validation message.
 */
export function useSubmitForm(
  formId: string | undefined,
): (data: Record<string, unknown>) => Promise<Submission> {
  const qc = useQueryClient();
  const submit = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.submitForm(formId as string, data),
    onSuccess: () => {
      if (formId) qc.invalidateQueries({ queryKey: qk.submissions(formId) });
    },
  });
  return (data) => submit.mutateAsync(data);
}
