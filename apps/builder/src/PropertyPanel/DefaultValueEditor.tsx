import { Checkbox, Form, Input, InputNumber } from "antd";
import { describeField } from "../field-registry";
import { prop } from "./helpers";
import type { AuthoredField, Patch } from "./types";

/** A small "Default value" editor whose control follows the registry descriptor's
 *  `defaultValueKind`. Date/time types declare "none" (value shape is platform-specific). */
export function DefaultValueEditor({
  field,
  set,
}: {
  field: AuthoredField;
  set: (patch: Patch) => void;
}) {
  const { defaultValueKind } = describeField(field.type);
  if (defaultValueKind === "none") return null;
  const dv = prop(field, "defaultValue");
  const setDefault = (value: unknown) => set({ defaultValue: value } as Patch);
  return (
    <Form.Item label="Giá trị mặc định">
      {defaultValueKind === "boolean" ? (
        <Checkbox checked={!!dv} onChange={(e) => setDefault(e.target.checked || undefined)} />
      ) : defaultValueKind === "number" ? (
        <InputNumber
          style={{ width: "100%" }}
          value={(dv as number | null) ?? null}
          onChange={(v) => setDefault(v ?? undefined)}
        />
      ) : (
        <Input
          value={(dv as string) ?? ""}
          onChange={(e) => setDefault(e.target.value || undefined)}
        />
      )}
    </Form.Item>
  );
}
