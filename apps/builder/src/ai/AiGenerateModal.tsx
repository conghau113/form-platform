import { FormRenderer } from "@org/form-renderer-web";
import type { FormSchema } from "@org/form-schema";
import {
  Alert,
  Button,
  Collapse,
  Input,
  Modal,
  message,
  Segmented,
  Space,
  Spin,
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

/** Starter prompts so the user never faces a blank box (EN + VI, the product's two locales). */
const EXAMPLE_PROMPTS = [
  "A job application: full name, email, phone, résumé upload and a cover letter.",
  "Đăng ký sự kiện: họ tên, email, số điện thoại, số người tham dự, ghi chú.",
  "A customer feedback survey with a 1–5 rating, what we did well and what to improve.",
];

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
 *
 * The modal has three visible states: the input form, an in-place "generating…"
 * state (the call can take several seconds), and the proposal review. Failures
 * surface as a persistent inline error (not a vanishing toast) so the user can
 * read the reason — most often a missing API key — and fix it without retyping.
 */
export function AiGenerateModal({ open, onClose, currentSchema, onApply }: AiGenerateModalProps) {
  const [prompt, setPrompt] = useState("");
  const [guidance, setGuidance] = useState("");
  const [image, setImage] = useState<{ base64: string; mediaType: string; name: string } | null>(
    null,
  );
  const [creds, setCreds] = useState<AiCreds>(() => loadAiCreds());
  const [byokKeys, setByokKeys] = useState<string[]>([]);
  const [proposed, setProposed] = useState<GenerateFormResult | null>(null);
  const generate = useGenerateForm();

  const diff = useMemo(
    () => (proposed ? diffForms(currentSchema, proposed.form) : null),
    [proposed, currentSchema],
  );
  const currentHasFields = (diff?.currentCount ?? 0) > 0;

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
    } catch {
      // The reason is shown inline via `generate.error`; open the key section so
      // the most common cause (a missing/invalid key) is one click away.
      setByokKeys(["byok"]);
    }
  }

  function apply(next: FormSchema) {
    onApply(next);
    close();
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

  const cancelBtn = (
    <Button key="cancel" onClick={close}>
      Cancel
    </Button>
  );

  let footer: React.ReactNode[];
  if (generate.isPending) {
    footer = [cancelBtn];
  } else if (proposed) {
    const back = (
      <Button key="back" onClick={reset}>
        ← Edit request
      </Button>
    );
    const append = (
      <Button
        key="append"
        type={currentHasFields ? "primary" : "default"}
        onClick={() => proposed && apply(appendForms(currentSchema, proposed.form))}
      >
        Append fields
      </Button>
    );
    const replace = (
      <Button
        key="replace"
        type={currentHasFields ? "default" : "primary"}
        danger={currentHasFields}
        onClick={() => proposed && apply(proposed.form)}
      >
        {currentHasFields ? "Replace form" : "Use this form"}
      </Button>
    );
    // Keep the safer action as the rightmost primary: Append when the canvas
    // already has fields, otherwise Use/Replace (nothing to lose on an empty form).
    footer = currentHasFields ? [back, replace, append] : [back, append, replace];
  } else {
    footer = [
      cancelBtn,
      <Button key="gen" type="primary" loading={generate.isPending} onClick={onGenerate}>
        Generate
      </Button>,
    ];
  }

  return (
    <Modal open={open} onCancel={close} title="Generate with AI" width={720} footer={footer}>
      {generate.isPending && (
        <div style={{ padding: "48px 0", textAlign: "center" }}>
          <Spin size="large" />
          <div style={{ marginTop: 20 }}>
            <Typography.Text strong>Generating your form…</Typography.Text>
          </div>
          <Typography.Paragraph
            type="secondary"
            style={{ marginTop: 8, maxWidth: 420, margin: "8px auto 0" }}
          >
            The model drafts a schema, then it’s validated against the form contract and repaired if
            needed. This usually takes a few seconds.
          </Typography.Paragraph>
        </div>
      )}

      {!generate.isPending && !proposed && (
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          {generate.isError && (
            <Alert
              type="error"
              showIcon
              message="Couldn’t generate the form"
              description={(generate.error as Error)?.message}
            />
          )}
          <Input.TextArea
            autoFocus
            rows={4}
            placeholder="Describe the form, e.g. “A job application with name, email, a résumé upload and a cover letter.”"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <Space size={[8, 8]} wrap>
            <Typography.Text type="secondary">Try:</Typography.Text>
            {EXAMPLE_PROMPTS.map((ex) => (
              <Button key={ex} size="small" type="dashed" onClick={() => setPrompt(ex)}>
                {ex.length > 42 ? `${ex.slice(0, 42)}…` : ex}
              </Button>
            ))}
          </Space>
          <Input
            placeholder="Optional house-style guidance (tone, required fields, language…)"
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
          />
          <Space align="start">
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
              <Space>
                <img
                  src={`data:${image.mediaType};base64,${image.base64}`}
                  alt={image.name}
                  style={{
                    height: 32,
                    width: 32,
                    objectFit: "cover",
                    borderRadius: 4,
                    border: "1px solid rgba(0,0,0,0.1)",
                  }}
                />
                <Tag closable onClose={() => setImage(null)}>
                  {image.name}
                </Tag>
              </Space>
            )}
          </Space>
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
                        setCreds((c) => ({
                          ...c,
                          provider: (v || undefined) as AiCreds["provider"],
                        }))
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
        </Space>
      )}

      {!generate.isPending && proposed && diff && (
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Alert
            type={currentHasFields && diff.removed.length ? "warning" : "info"}
            message={
              <Space size={[4, 4]} wrap>
                <Typography.Text strong>{proposed.form.title || proposed.form.id}</Typography.Text>
                <Tag color="blue">{diff.proposedCount} fields</Tag>
                {diff.added.length > 0 && <Tag color="green">+{diff.added.length} new</Tag>}
                {diff.kept.length > 0 && <Tag>{diff.kept.length} shared</Tag>}
                {currentHasFields && diff.removed.length > 0 && (
                  <Tag color="red">Replace drops {diff.removed.length} current</Tag>
                )}
                {proposed.attempts > 1 && <Tag color="gold">repaired ×{proposed.attempts - 1}</Tag>}
              </Space>
            }
            description={
              currentHasFields
                ? "Append adds these fields to your current form (colliding names are renamed). Replace swaps your whole form for this one."
                : "Review the proposal below, then use it as your form."
            }
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
