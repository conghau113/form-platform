import { Input, Typography } from "antd";
import { useEffect, useRef, useState } from "react";

/** Pretty-print a model value as JSON for editing; `undefined` shows as empty. */
function stringify(value: unknown): string {
  if (value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

/** A validated JSON text editor backing the `json` setter control. Keeps the raw text as
 *  local state (invalid JSON cannot round-trip through the typed model) and only commits a
 *  parsed value when the text is valid; an error hint shows otherwise. Re-syncs the text
 *  when the external value changes identity (e.g. the property panel swaps node) so it
 *  never goes stale despite the panel not remounting. Empty text writes `undefined`. */
export function JsonEditor({
  value,
  onChange,
  rows = 4,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  rows?: number;
}) {
  const [text, setText] = useState(() => stringify(value));
  const [error, setError] = useState<string>();
  const external = useRef(value);

  useEffect(() => {
    if (value !== external.current) {
      external.current = value;
      setText(stringify(value));
      setError(undefined);
    }
  }, [value]);

  const onText = (next: string) => {
    setText(next);
    if (next.trim() === "") {
      setError(undefined);
      external.current = undefined;
      onChange(undefined);
      return;
    }
    try {
      const parsed = JSON.parse(next);
      setError(undefined);
      external.current = parsed;
      onChange(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <Input.TextArea
        rows={rows}
        value={text}
        status={error ? "error" : undefined}
        onChange={(e) => onText(e.target.value)}
        style={{ fontFamily: "monospace" }}
      />
      {error ? (
        <Typography.Text type="danger" style={{ fontSize: 12 }}>
          {error}
        </Typography.Text>
      ) : null}
    </div>
  );
}
