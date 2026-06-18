import { ExportOutlined } from "@ant-design/icons";
import type { DesignTokens } from "@org/form-theme";
import { Button, ColorPicker, Input, InputNumber, Segmented, Space, Typography } from "antd";

/** Compact toolbar for editing the main design tokens. Lives above the live
 *  preview so token edits are reflected immediately in the rendered form. */
export function ThemeEditor({
  tokens,
  onChange,
  onExport,
}: {
  tokens: DesignTokens;
  onChange: (next: DesignTokens) => void;
  onExport: () => void;
}) {
  return (
    <Space wrap size={[16, 8]} align="center">
      <Field label="Primary">
        <ColorPicker
          value={tokens.colors.primary}
          showText
          onChange={(_, hex) => onChange({ ...tokens, colors: { ...tokens.colors, primary: hex } })}
        />
      </Field>
      <Field label="Radius">
        <InputNumber
          min={0}
          style={{ width: 72 }}
          value={tokens.radius}
          onChange={(v) => onChange({ ...tokens, radius: v ?? 0 })}
        />
      </Field>
      <Field label="Font size">
        <InputNumber
          min={1}
          style={{ width: 72 }}
          value={tokens.typography.fontSize}
          onChange={(v) =>
            onChange({ ...tokens, typography: { ...tokens.typography, fontSize: v ?? 1 } })
          }
        />
      </Field>
      <Field label="Spacing">
        <InputNumber
          min={0}
          style={{ width: 72 }}
          value={tokens.spacing}
          onChange={(v) => onChange({ ...tokens, spacing: v ?? 0 })}
        />
      </Field>
      <Field label="Font family">
        <Input
          allowClear
          placeholder="default"
          style={{ width: 160 }}
          value={tokens.typography.fontFamily ?? ""}
          onChange={(e) => {
            const fontFamily = e.target.value.trim();
            onChange({
              ...tokens,
              typography: {
                ...tokens.typography,
                fontFamily: fontFamily === "" ? undefined : fontFamily,
              },
            });
          }}
        />
      </Field>
      <Field label="Algorithm">
        <Segmented
          options={["default", "dark"]}
          value={tokens.algorithm}
          onChange={(v) => onChange({ ...tokens, algorithm: v as DesignTokens["algorithm"] })}
        />
      </Field>
      <Button icon={<ExportOutlined />} onClick={onExport}>
        Export theme
      </Button>
    </Space>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Space size={4}>
      <Typography.Text type="secondary" style={{ whiteSpace: "nowrap" }}>
        {label}
      </Typography.Text>
      {children}
    </Space>
  );
}
