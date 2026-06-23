import { useMutation } from "@tanstack/react-query";
import * as api from "./client";
import type { AiCreds } from "./creds";

/**
 * Mutation wrappers for AI form generation and refinement. Both endpoints are
 * stateless (they persist nothing), so there is no cache to invalidate — the
 * component reads `mutateAsync`/`isPending`/`error` and applies the result to the
 * editor itself.
 */
export function useGenerateForm() {
  return useMutation({
    mutationFn: ({ input, creds }: { input: api.GenerateFormInput; creds: AiCreds }) =>
      api.generateForm(input, creds),
  });
}

export function useRefineForm() {
  return useMutation({
    mutationFn: ({ input, creds }: { input: api.RefineFormInput; creds: AiCreds }) =>
      api.refineForm(input, creds),
  });
}
