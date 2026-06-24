import type { Preset } from "@org/form-schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { qk } from "../query";
import { loadForm, saveForm } from "../workspace/client";
import { appendLinkedField } from "./apply";

/**
 * useApplyPreset — batch "apply a preset across the project" (Track B / P2).
 *
 * For each selected form it loads the body, appends the preset as a linked field
 * (`appendLinkedField`), and saves it back. Saving carries **no placement** so the
 * form keeps its existing project/folder (passing `projectId` without `folderId`
 * would move it to the project root — see api `forms.service.resolvePlacement`).
 * Each form is independent: one failure is reported, not fatal to the rest. On
 * completion the affected form caches + the project tree are invalidated.
 */
export interface ApplyPresetReport {
  /** Ids of forms the preset was successfully appended to. */
  applied: string[];
  /** Forms that failed, with the reason. */
  failed: { id: string; error: string }[];
}

export function useApplyPreset(projectId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      preset,
      formIds,
    }: {
      preset: Preset;
      formIds: string[];
    }): Promise<ApplyPresetReport> => {
      const applied: string[] = [];
      const failed: ApplyPresetReport["failed"] = [];
      for (const id of formIds) {
        try {
          const form = await loadForm(id);
          await saveForm(appendLinkedField(form, preset));
          applied.push(id);
        } catch (e) {
          failed.push({ id, error: (e as Error).message });
        }
      }
      return { applied, failed };
    },
    onSuccess: (report) => {
      for (const id of report.applied) {
        void qc.invalidateQueries({ queryKey: qk.form(id) });
      }
      if (projectId) void qc.invalidateQueries({ queryKey: qk.projectTree(projectId) });
    },
  });
}
