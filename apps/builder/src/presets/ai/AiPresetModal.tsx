import type { PresetDraft } from "@org/form-ai";
import { FormRenderer } from "@org/form-renderer-web";
import { FIELD_CAPABILITIES, type Preset } from "@org/form-schema";
import {
  Alert,
  Button,
  Collapse,
  Input,
  Modal,
  message,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import { useMemo, useState } from "react";
import { type AiCreds, loadAiCreds, saveAiCreds } from "../../ai/creds";
import type { GeneratePresetResult } from "./client";
import { presetFromDraft, previewFormFromDraft } from "./draft";
import { useGeneratePreset } from "./useGeneratePreset";

export interface AiPresetModalProps {
  open: boolean;
  onClose: () => void;
  /** Project context: scopes the saved preset and offers the project/global choice. */
  projectId?: string;
  /** Persist the accepted preset (the shared store's `save`). */
  onSave: (preset: Preset) => Promise<void>;
}

/** Starter prompts so the user never faces a blank box (EN + VI, the product's two locales). */
const EXAMPLE_PROMPTS = [
  "A validated Vietnam phone number field, required, with a helpful placeholder.",
  "Một ô chọn quốc gia (select) với vài lựa chọn phổ biến.",
  "An email field with email-format validation and a clear button.",
];

/** Leaf field types (presets are single fields, never containers), for the type hint. */
const LEAF_TYPES = FIELD_CAPABILITIES.filter((c) => !c.isContainer);

/**
 * "Generate a preset with AI" — one prompt designs a reusable, contract-valid field
 * (label, validation, placeholder, icon). The draft is shown as a live single-field
 * preview before it is saved into the library; the saved preset can then be dragged
 * into any form or applied across the project. BYOK creds reuse the form generator's
 * `x-ai-*` seam (blank ⇒ server env defaults). Failures stay as an inline alert.
 */
export function AiPresetModal({ open, onClose, projectId, onSave }: AiPresetModalProps) {
  const [prompt, setPrompt] = useState("");
  const [fieldType, setFieldType] = useState<string | undefined>(undefined);
  const [guidance, setGuidance] = useState("");
  const [creds, setCreds] = useState<AiCreds>(() => loadAiCreds());
  const [byokKeys, setByokKeys] = useState<string[]>([]);
  const [proposed, setProposed] = useState<GeneratePresetResult | null>(null);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"project" | "global">(projectId ? "project" : "global");
  const [saving, setSaving] = useState(false);

  const generate = useGeneratePreset();
  const error = generate.error as Error | null;

  const previewForm = useMemo(
    () => (proposed ? previewFormFromDraft({ ...proposed.preset, name }) : null),
    [proposed, name],
  );

  function reset() {
    setProposed(null);
    setPrompt("");
    setGuidance("");
    setName("");
    generate.reset();
  }

  function close() {
    reset();
    onClose();
  }

  async function onGenerate() {
    if (!prompt.trim()) return;
    try {
      const result = await generate.mutateAsync({
        input: { prompt: prompt.trim(), fieldType, guidance: guidance.trim() || undefined },
        creds,
      });
      saveAiCreds(creds);
      setProposed(result);
      setName(result.preset.name);
      // Any stripped URLs are surfaced as a tag in the review pane.
    } catch {
      // Reason shown inline via `error`; open the key section (most common cause).
      setByokKeys(["byok"]);
    }
  }

  async function onSaveDraft() {
    if (!proposed) return;
    setSaving(true);
    try {
      const draft: PresetDraft = { ...proposed.preset, name: name.trim() || proposed.preset.name };
      const scopeOpts =
        projectId && scope === "project"
          ? ({ scope: "project", projectId } as const)
          : ({ scope: "global" } as const);
      await onSave(presetFromDraft(draft, scopeOpts));
      message.success(`Saved preset "${draft.name}"`);
      close();
    } catch (e) {
      // Keep the modal open so the reviewed draft is not lost.
      message.error(`Save preset failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  const credField = (key: keyof AiCreds, placeholder: string, isSecret = false) => {
    const Field = isSecret ? Input.Password : Input;
    return (
      <Field
        placeholder={placeholder}
        value={(creds[key] as string) ?? ""}
        onChange={(e) => setCreds((c) => ({ ...c, [key]: e.target.value }))}
      />
    );
  };

  const byokSection = (
    <Collapse
      ghost
      activeKey={byokKeys}
      onChange={(k) => setByokKeys(k as string[])}
      items={[
        {
          key: "byok",
          label: "API key (optional — uses the server default if blank)",
          children: (
            <Space direction="vertical" size="small" style={{ width: "100%" }}>
              <Segmented
                block
                value={creds.provider ?? ""}
                onChange={(v) =>
                  setCreds((c) => ({ ...c, provider: (v || undefined) as AiCreds["provider"] }))
                }
                options={[
                  { label: "Server default", value: "" },
                  { label: "OpenAI-compatible", value: "openai" },
                  { label: "Anthropic", value: "anthropic" },
                ]}
              />
              {credField("apiKey", "API key (kept in your browser, sent per request)", true)}
              {credField("baseUrl", "Base URL — OpenAI-compatible only (e.g. 9router/Azure)")}
              {credField("model", "Model id (e.g. gpt-4o-mini, claude-sonnet-4-6)")}
            </Space>
          ),
        },
      ]}
    />
  );

  const errorAlert = error && (
    <Alert type="error" showIcon message="Couldn’t reach the model" description={error.message} />
  );

  const composer = (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {errorAlert}
      <Input.TextArea
        autoFocus
        rows={3}
        placeholder="Describe the reusable field, e.g. “A validated Vietnam phone number, required, with a placeholder.”"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <Space size={[8, 8]} wrap>
        <Typography.Text type="secondary">Try:</Typography.Text>
        {EXAMPLE_PROMPTS.map((ex) => (
          <Button key={ex} size="small" type="dashed" onClick={() => setPrompt(ex)}>
            {ex.length > 40 ? `${ex.slice(0, 40)}…` : ex}
          </Button>
        ))}
      </Space>
      <Select
        allowClear
        style={{ width: "100%" }}
        placeholder="Field type (optional — let the AI choose)"
        value={fieldType}
        onChange={(v) => setFieldType(v)}
        options={LEAF_TYPES.map((c) => ({ label: `${c.type} — ${c.summary}`, value: c.type }))}
      />
      <Input
        placeholder="Optional guidance (tone, language, validation rules…)"
        value={guidance}
        onChange={(e) => setGuidance(e.target.value)}
      />
      {byokSection}
    </Space>
  );

  const review = proposed && previewForm && (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {errorAlert}
      <Space size={[4, 6]} wrap>
        <Tag color="blue">{proposed.preset.fieldType}</Tag>
        {proposed.attempts > 1 && <Tag color="gold">repaired ×{proposed.attempts - 1}</Tag>}
        {proposed.strippedUrls.length > 0 && (
          <Tag color="red">removed {proposed.strippedUrls.length} unsafe URL(s)</Tag>
        )}
      </Space>
      <div>
        <Typography.Text type="secondary">Preset name</Typography.Text>
        <Input
          style={{ marginTop: 4 }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Preset name"
        />
      </div>
      {projectId && (
        <Segmented
          block
          value={scope}
          onChange={(v) => setScope(v as "project" | "global")}
          options={[
            { label: "Dự án này", value: "project" },
            { label: "Toàn cục", value: "global" },
          ]}
        />
      )}
      <div
        style={{
          padding: 16,
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 8,
        }}
      >
        <FormRenderer schema={previewForm} access={{ roles: ["admin"] }} />
      </div>
      <Button type="text" onClick={reset}>
        ↺ Start over
      </Button>
    </Space>
  );

  return (
    <Modal
      open={open}
      title={proposed ? "Review preset" : "Generate a preset with AI"}
      onCancel={close}
      destroyOnHidden
      footer={
        proposed
          ? [
              <Button key="back" onClick={reset} disabled={saving}>
                Back
              </Button>,
              <Button
                key="save"
                type="primary"
                loading={saving}
                disabled={!name.trim()}
                onClick={onSaveDraft}
              >
                Add to library
              </Button>,
            ]
          : [
              <Button key="cancel" onClick={close}>
                Cancel
              </Button>,
              <Button
                key="gen"
                type="primary"
                loading={generate.isPending}
                disabled={!prompt.trim()}
                onClick={onGenerate}
              >
                Generate
              </Button>,
            ]
      }
    >
      {generate.isPending && !proposed ? (
        <div style={{ padding: "32px 0", textAlign: "center" }}>
          <Spin size="large" />
          <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
            Designing your field and validating it against the contract. This usually takes a few
            seconds.
          </Typography.Paragraph>
        </div>
      ) : proposed ? (
        review
      ) : (
        composer
      )}
    </Modal>
  );
}
