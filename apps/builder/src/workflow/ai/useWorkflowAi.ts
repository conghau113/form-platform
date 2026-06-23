import { useMutation } from "@tanstack/react-query";
import type { AiCreds } from "../../ai/creds";
import * as api from "./client";

/**
 * Mutation wrappers for AI workflow generation and refinement. Both endpoints are
 * stateless (they persist nothing), so there is no cache to invalidate — the
 * component reads `mutateAsync`/`isPending`/`error` and applies the result to the
 * editor itself (saving is a separate, explicit step).
 */
export function useGenerateWorkflow() {
  return useMutation({
    mutationFn: ({ input, creds }: { input: api.GenerateWorkflowInput; creds: AiCreds }) =>
      api.generateWorkflow(input, creds),
  });
}

export function useRefineWorkflow() {
  return useMutation({
    mutationFn: ({ input, creds }: { input: api.RefineWorkflowInput; creds: AiCreds }) =>
      api.refineWorkflow(input, creds),
  });
}
