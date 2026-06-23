import { FormRenderer } from "@org/form-renderer-web";
import type { FormSchema } from "@org/form-schema";
import {
  Alert,
  Button,
  Collapse,
  Input,
  Modal,
  message,
  Space,
  Tag,
  Typography,
  Upload,
} from "antd";
import { useMemo, useState } from "react";
import type { GenerateFormInput, GenerateFormResult } from "./client";
import { type AiCreds, loadAiCreds, saveAiCreds } from "./creds";
import { appendForms, diffForms } from "./diff";
import { useGenerateForm } from "./useGenerateForm";

export interface AiGenerateModalProps {
  open: boolean;
  onClose: () => void;
  /** The working form, used to diff the proposal and to append onto. */
  currentSchema: FormSchema;
  /** Accept the (possibly merged) form into the canvas as one undoable step. */
  onApply: (next: FormSchema) => void;
}

/** Read an uploaded image into the `{ base64, mediaType }` shape the endpoint wants. */
function readImage(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const match = /^data:(.+?);base64,(.*)$/.exec(String(reader.result));
      if (!match) return reject(new Error("Unsupported image"));
      resolve({ mediaType: match[1], base64: match[2] });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * "Generate with AI" — the human-in-the-loop surface. A prompt (and optional
 * reference image) is turned into a contract-valid form by the headless
 * endpoint; the proposal is shown as a live preview plus a field-level diff
 * BEFORE it touches the canvas. Accepting applies it as a single undoable step
 * (Replace) or appends its fields (Append), so the existing history/undo and the
 * unsaved-changes guard cover it for free.
 */
export function AiGenerateModal({ open, onClose, currentSchema, onApply }: AiGenerateModalProps) {
  const [prompt, setPrompt] = useState("");
  const [guidance, setGuidance] = useState("");
  const [image, setImage] = useState<{ base64: string; mediaType: string; name: string } | null>(
    null,
  );
  const [creds, setCreds] = useState<AiCreds>(() => loadAiCreds());
  const [proposed, setProposed] = useState<GenerateFormResult | null>(null);
  const generate = useGenerateForm();

  const diff = useMemo(
    () => (proposed ? diffForms(currentSchema, proposed.form) : null),
    [proposed, currentSchema],
  );

  function reset() {
    setProposed(null);
    generate.reset();
  }

  function close() {
    reset();
    onClose();
  }

  async function onGenerate() {
    if (!prompt.trim()) {
      message.warning("Describe the form you want first.");
      return;
    }
    const input: GenerateFormInput = {
      prompt: prompt.trim(),
      guidance: guidance.trim() || undefined,
      images: image ? [{ base64: image.base64, mediaType: image.mediaType }] : undefined,
    };
    try {
      const result = await generate.mutateAsync({ input, creds });
      saveAiCreds(creds);
      setProposed(result);
      if (result.strippedUrls.length) {
        message.warning(`Removed ${result.strippedUrls.length} off-allowlist URL(s) for safety.`);
      }
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  function apply(next: FormSchema) {
    onApply(next);
    close();
  }

  const credBag = (key: keyof AiCreds, placeholder: string, isSecret = false) => {
    const Field = isSecret ? Input.Password : Input;
    return (
      <Field
        placeholder={placeholder}
        value={(creds[key] as string) ?? ""}
        onChange={(e) => setCreds((c) => ({ ...c, [key]: e.target.value }))}
      />
    );
  };

  const footer = proposed
    ? [
        <Button key="cancel" onClick={close}>
          Cancel
        </Button>,
        <Button key="regen" onClick={reset}>
          Start over
        </Button>,
        <Button key="append" onClick={() => apply(appendForms(currentSchema, proposed.form))}>
          Append fields
        </Button>,
        <Button key="replace" type="primary" onClick={() => apply(proposed.form)}>
          Replace form
        </Button>,
      ]
    : [
        <Button key="cancel" onClick={close}>
          Cancel
        </Button>,
        <Button key="gen" type="primary" loading={generate.isPending} onClick={onGenerate}>
          Generate
        </Button>,
      ];

  return (
    <Modal open={open} onCancel={close} title="Generate with AI" width={720} footer={footer}>
      {!proposed && (
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Input.TextArea
            autoFocus
            rows={4}
            placeholder="Describe the form, e.g. “A job application with name, email, a résumé upload and a cover letter.”"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <Input
            placeholder="Optional house-style guidance (tone, required fields, language…)"
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
          />
          <Space>
            <Upload
              accept="image/*"
              showUploadList={false}
              beforeUpload={(file) => {
                readImage(file)
                  .then((img) => setImage({ ...img, name: file.name }))
                  .catch((e) => message.error((e as Error).message));
                return false; // handle locally; never POST from Upload
              }}
            >
              <Button>Attach reference image</Button>
            </Upload>
            {image && (
              <Tag closable onClose={() => setImage(null)}>
                {image.name}
              </Tag>
            )}
          </Space>
          <Collapse
            ghost
            items={[
              {
                key: "byok",
                label: "API key (optional — uses the server default if blank)",
                children: (
                  <Space direction="vertical" size="small" style={{ width: "100%" }}>
                    {credBag("apiKey", "x-ai-api-key (your key)", true)}
                    {credBag("baseUrl", "Base URL — OpenAI-compatible (e.g. 9router/Azure)")}
                    {credBag("model", "Model id (e.g. gpt-4o-mini, claude-sonnet-4-6)")}
                  </Space>
                ),
              },
            ]}
          />
        </Space>
      )}

      {proposed && diff && (
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Alert
            type={diff.removed.length ? "warning" : "info"}
            message={
              <Space size={[4, 4]} wrap>
                <Typography.Text strong>{proposed.form.title || proposed.form.id}</Typography.Text>
                <Tag color="blue">{diff.proposedCount} fields</Tag>
                {diff.added.length > 0 && <Tag color="green">+{diff.added.length} new</Tag>}
                {diff.kept.length > 0 && <Tag>{diff.kept.length} shared</Tag>}
                {diff.removed.length > 0 && (
                  <Tag color="red">Replace drops {diff.removed.length} current</Tag>
                )}
              </Space>
            }
            description="Review the proposal below. Replace swaps in the new form; Append adds its fields to your current one (colliding names are renamed)."
          />
          <div
            style={{
              maxHeight: 360,
              overflow: "auto",
              padding: 16,
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 8,
            }}
          >
            <FormRenderer schema={proposed.form} access={{ roles: ["admin"] }} />
          </div>
        </Space>
      )}
    </Modal>
  );
}
