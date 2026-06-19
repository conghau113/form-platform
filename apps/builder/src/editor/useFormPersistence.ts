import { type FormSchema, migrate } from "@org/form-schema";
import { DEFAULT_TOKENS, type DesignTokens, migrateTheme } from "@org/form-theme";
import { message } from "antd";
import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
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

/** Owns design tokens + the saved (clean) baselines and the form/theme save/load round-trips.
 *  Extracted from `App` in refactor R3; `fetch` now lives in `./client`. Plain hook for now
 *  (the react-query swap is R5) so this stays behaviour-only. */
export function useFormPersistence({
  json,
  historyIndex,
  currentFormId,
  loadSchema,
  formId,
  onSaved,
}: FormPersistenceArgs): FormPersistence {
  const [tokens, setTokens] = useState<DesignTokens>(DEFAULT_TOKENS);
  // History cursor / tokens at the last load/save — the clean baselines for the dirty check.
  const [savedIndex, setSavedIndex] = useState(0);
  const [savedTokens, setSavedTokens] = useState<DesignTokens>(DEFAULT_TOKENS);

  /** Save form + theme. Returns true on success so the navigation guard can proceed. */
  async function onSave(): Promise<boolean> {
    try {
      const res = await postForm(json);
      const data = await res.json();
      if (!res.ok) {
        message.error(`Save failed: ${data.message ?? res.statusText}`);
        return false;
      }
      // Persist the theme alongside the form under the same id.
      const themeRes = await postTheme(data.id, tokens);
      if (!themeRes.ok) {
        const themeData = await themeRes.json().catch(() => ({}));
        message.error(`Theme save failed: ${themeData.message ?? themeRes.statusText}`);
        return false;
      }
      // Mark the current state (form + theme) as clean and refresh the workspace tree.
      setSavedIndex(historyIndex);
      setSavedTokens(tokens);
      onSaved?.();
      message.success(`Saved "${data.id}" (form + theme)`);
      return true;
    } catch (e) {
      message.error(`Save failed: ${(e as Error).message}`);
      return false;
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
