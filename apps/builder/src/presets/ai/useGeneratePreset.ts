import { useMutation } from "@tanstack/react-query";
import type { AiCreds } from "../../ai/creds";
import * as api from "./client";

/**
 * Mutation wrapper for AI preset generation. The endpoint is stateless (it persists
 * nothing — saving is a separate `POST /presets`), so there is no cache to invalidate;
 * the component reads `mutateAsync`/`isPending`/`error` and saves the accepted draft itself.
 */
export function useGeneratePreset() {
  return useMutation({
    mutationFn: ({ input, creds }: { input: api.GeneratePresetInput; creds: AiCreds }) =>
      api.generatePreset(input, creds),
  });
}
