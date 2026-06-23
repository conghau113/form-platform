import { useMutation } from "@tanstack/react-query";
import * as api from "./client";
import type { AiCreds } from "./creds";

/**
 * Mutation wrapper for AI form generation. Generation is stateless (the endpoint
 * persists nothing), so there is no cache to invalidate — the component reads
 * `mutateAsync`/`isPending`/`error` and applies the result to the editor itself.
 */
export function useGenerateForm() {
  return useMutation({
    mutationFn: ({ input, creds }: { input: api.GenerateFormInput; creds: AiCreds }) =>
      api.generateForm(input, creds),
  });
}
