import { type FormSchema, migrate } from "@org/form-schema";
import { DEFAULT_TOKENS, type DesignTokens, migrateTheme } from "@org/form-theme";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { App as AntApp } from "antd";
import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { qk } from "../query";
import { getForm, getTheme, postForm, postTheme } from "./client";

export interface FormPersistenceArgs {
  /** Serialized current schema — the body of a form save. */
  json: string;
  /** History cursor; a successful save marks this index as the clean baseline. */
  historyIndex: number;
  /** Default id for `onLoad()` with no argument (the current form's id). */
  currentFormId: string;
  /** Replace the whole document (reset history + clear selection). */
  loadSchema: (next: FormSchema) => void;
  /** When set (the `/forms/:formId` leaf), load that form + theme once on mount. */
  formId?: string;
  /** Fired after a successful save (lets the workspace rail refresh form titles). */
  onSaved?: () => void;
}

export interface FormPersistence {
  tokens: DesignTokens;
  setTokens: Dispatch<SetStateAction<DesignTokens>>;
  /** Tokens at the last load/save — the clean theme baseline for the dirty check. */
  savedTokens: DesignTokens;
  /** History index at the last load/save — the clean form baseline for the dirty check. */
  savedIndex: number;
  /** Save form + theme. Returns true on success so the navigation guard can proceed. */
  onSave: () => Promise<boolean>;
  /** Load a form (+ its theme) by id; defaults to the current form's id. */
  onLoad: (id?: string) => Promise<void>;
}

/** What a successful save commits: the server id plus the form/theme snapshot taken at save time
 *  (so the clean baselines reflect exactly what was persisted, not a later edit). */
interface SaveResult {
  id: string;
  savedIndex: number;
  savedTokens: DesignTokens;
}

/** Owns design tokens + the saved (clean) baselines and the form/theme save/load round-trips.
 *  Extracted from `App` in R3. R5: the save round-trip is a react-query `useMutation` that
 *  invalidates the saved form/theme cache entries on success; `fetch` lives only in `./client`.
 *  Load stays imperative — it resets editor history, which a passive cached query must not do. */
export function useFormPersistence({
  json,
  historyIndex,
  currentFormId,
  loadSchema,
  formId,
  onSaved,
}: FormPersistenceArgs): FormPersistence {
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const [tokens, setTokens] = useState<DesignTokens>(DEFAULT_TOKENS);
  // History cursor / tokens at the last load/save — the clean baselines for the dirty check.
  const [savedIndex, setSavedIndex] = useState(0);
  const [savedTokens, setSavedTokens] = useState<DesignTokens>(DEFAULT_TOKENS);

  const saveMutation = useMutation<SaveResult, Error>({
    mutationFn: async () => {
      // Snapshot the state being persisted so the clean baselines match it exactly.
      const snapshotIndex = historyIndex;
      const snapshotTokens = tokens;
      const res = await postForm(json);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Save failed: ${data.message ?? res.statusText}`);
      // Persist the theme alongside the form under the same id.
      const themeRes = await postTheme(data.id, snapshotTokens);
      if (!themeRes.ok) {
        const themeData = await themeRes.json().catch(() => ({}));
        throw new Error(`Theme save failed: ${themeData.message ?? themeRes.statusText}`);
      }
      return { id: data.id, savedIndex: snapshotIndex, savedTokens: snapshotTokens };
    },
    onSuccess: ({ id, savedIndex: index, savedTokens: themeSnapshot }) => {
      // Mark the persisted state clean, drop any stale cached reads of this form/theme, and let
      // the workspace rail refresh its titles (the tree invalidation lives behind `onSaved`).
      setSavedIndex(index);
      setSavedTokens(themeSnapshot);
      qc.invalidateQueries({ queryKey: qk.form(id) });
      qc.invalidateQueries({ queryKey: qk.theme(id) });
      onSaved?.();
      message.success(`Saved "${id}" (form + theme)`);
    },
    onError: (error) => {
      // Tagged failures (`Save failed` / `Theme save failed`) already read well; anything else
      // (e.g. a network reject) gets the same `Save failed:` prefix the inline version used.
      const msg = error.message;
      const tagged = msg.startsWith("Save failed") || msg.startsWith("Theme save failed");
      message.error(tagged ? msg : `Save failed: ${msg}`);
    },
  });

  /** Save form + theme. Returns true on success so the navigation guard can proceed. */
  async function onSave(): Promise<boolean> {
    try {
      await saveMutation.mutateAsync();
      return true;
    } catch {
      return false; // `onError` already surfaced the message.
    }
  }

  async function onLoad(id: string = currentFormId): Promise<void> {
    try {
      const res = await getForm(id);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(`Load failed: ${data.message ?? res.statusText}`);
        return;
      }
      loadSchema(migrate(data));
      // A fresh load resets history to cursor 0 → that is the clean baseline.
      setSavedIndex(0);
      // Reapply the saved theme if one exists; a missing theme is not an error.
      const themeRes = await getTheme(data.id);
      const nextTokens = themeRes.ok ? migrateTheme(await themeRes.json()) : DEFAULT_TOKENS;
      setTokens(nextTokens);
      setSavedTokens(nextTokens);
      message.success(`Loaded "${data.id}"`);
    } catch (e) {
      message.error(`Load failed: ${(e as Error).message}`);
    }
  }

  // When mounted as the `/projects/:projectId/forms/:formId` leaf, load that form (+ theme) once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: load is keyed on formId only.
  useEffect(() => {
    if (formId) void onLoad(formId);
  }, [formId]);

  return { tokens, setTokens, savedTokens, savedIndex, onSave, onLoad };
}
