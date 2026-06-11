import { type FormSchema, migrate } from "@org/form-schema";
import { Alert, Button, Input } from "antd";
import { useEffect, useRef, useState } from "react";

/* ----------------------------------------------------------------------------
 * JsonEditor — the two-way JSON view (F3). It owns a local text buffer so
 * invalid typing never reverts or crashes the canvas: edits are debounced,
 * JSON.parse'd and run through `migrate` (version lift + Zod validation).
 * Valid → `onApply(schema)` (App records a history step); invalid → the
 * issues render inline and the designer tree stays untouched.
 * ------------------------------------------------------------------------- */

const PARSE_DEBOUNCE_MS = 400;

/** Flatten a thrown migrate/Zod error into displayable lines. */
function describeError(e: unknown): string[] {
  const issues = (e as { issues?: { path: (string | number)[]; message: string }[] }).issues;
  if (Array.isArray(issues)) {
    return issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
  }
  return [e instanceof Error ? e.message : String(e)];
}

export function JsonEditor({
  json,
  onApply,
}: {
  /** Canonical JSON serialized from the designer tree. */
  json: string;
  /** Receives the validated schema for every distinct valid edit. */
  onApply: (schema: FormSchema) => void;
}) {
  const [text, setText] = useState(json);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [focused, setFocused] = useState(false);
  // The last text we applied or synced — anything else is an unapplied draft.
  const committedRef = useRef(json);
  // Mirror of `text` so effects can read the draft without depending on it
  // (a `text` dep would re-run the resync on every keystroke).
  const textRef = useRef(text);
  textRef.current = text;

  // Tree changed elsewhere (canvas edit, undo, load): refresh an idle editor
  // with the canonical serialization (an applied edit is re-formatted here once
  // the editor blurs — intentional). A focused editor or an unapplied draft
  // (mid-typing, invalid) is kept.
  useEffect(() => {
    if (focused || textRef.current !== committedRef.current) return;
    committedRef.current = json;
    setErrors(null);
    setText(json);
  }, [json, focused]);

  // Debounced validation of drafts. `onApply` is intentionally read fresh per
  // run but excluded from deps so re-renders don't restart the debounce.
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;
  useEffect(() => {
    if (text === committedRef.current) return;
    const timer = setTimeout(() => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        setErrors([`JSON: ${(e as Error).message}`]);
        return;
      }
      try {
        const schema = migrate(parsed);
        committedRef.current = text;
        setErrors(null);
        onApplyRef.current(schema);
      } catch (e) {
        setErrors(describeError(e));
      }
    }, PARSE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {errors && (
        <Alert
          type="error"
          showIcon
          message="Schema errors — the canvas keeps the last valid version"
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {errors.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          }
          action={
            <Button
              size="small"
              onClick={() => {
                committedRef.current = json;
                setErrors(null);
                setText(json);
              }}
            >
              Revert
            </Button>
          }
          style={{ borderRadius: 0 }}
        />
      )}
      <Input.TextArea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        spellCheck={false}
        aria-label="Form schema JSON"
        status={errors ? "error" : undefined}
        style={{
          flex: 1,
          fontFamily: "monospace",
          fontSize: 13,
          border: "none",
          borderRadius: 0,
          resize: "none",
        }}
      />
    </div>
  );
}
