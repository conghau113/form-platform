import { FormRenderer } from "@org/form-renderer-web";
import type { FormSchema } from "@org/form-schema";
import {
  Alert,
  App as AntApp,
  Button,
  Collapse,
  Drawer,
  Input,
  Segmented,
  Space,
  Spin,
  Switch,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from "antd";
import { useMemo, useState } from "react";
import type { GenerateFormInput, GenerateFormResult, RefineFormInput } from "./client";
import { type AiCreds, loadAiCreds, saveAiCreds } from "./creds";
import { appendForms, diffForms } from "./diff";
import { useGenerateForm, useRefineForm } from "./useGenerateForm";

export interface AiAssistantDrawerProps {
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

interface AttachedImage {
  base64: string;
  mediaType: string;
  name: string;
}

/** One line of the conversation log shown above the proposal. */
interface Turn {
  id: string;
  kind: "prompt" | "refine";
  text: string;
}

/** A conversation turn with a stable key for the log. */
function turn(kind: Turn["kind"], text: string): Turn {
  return { id: crypto.randomUUID(), kind, text };
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
 * "Generate with AI" — the non-blocking, conversational surface. A right-side
 * Drawer (`mask=false`) so the real canvas stays visible AND interactive while
 * you iterate. A prompt (and optional reference image) becomes a contract-valid
 * form via the headless endpoint; the proposal shows as a live preview + a
 * field-level diff BEFORE it touches the canvas.
 *
 * After the first generation the bottom input turns into a **Refine** box: each
 * instruction ("make email required, add a birthday") edits the latest proposal
 * via `POST /ai/forms/refine`, keeping field names stable. Apply (Append/Replace)
 * pushes to the canvas as one undoable step and leaves the Drawer open, so the
 * user keeps refining from the applied state. On a non-empty canvas you can also
 * seed the conversation from the current form and refine it directly.
 *
 * Failures surface as a persistent inline error (not a vanishing toast) so the
 * reason — most often a missing API key — stays readable.
 */
export function AiAssistantDrawer({
  open,
  onClose,
  currentSchema,
  onApply,
}: AiAssistantDrawerProps) {
  const { message } = AntApp.useApp();
  const [prompt, setPrompt] = useState("");
  const [guidance, setGuidance] = useState("");
  const [image, setImage] = useState<AttachedImage | null>(null);
  const [twoPass, setTwoPass] = useState(false);
  const [creds, setCreds] = useState<AiCreds>(() => loadAiCreds());
  const [byokKeys, setByokKeys] = useState<string[]>([]);
  const [proposed, setProposed] = useState<GenerateFormResult | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [refineText, setRefineText] = useState("");

  const generate = useGenerateForm();
  const refine = useRefineForm();
  const busy = generate.isPending || refine.isPending;
  const error = (refine.error ?? generate.error) as Error | null;

  const currentHasFields = currentSchema.fields.length > 0;
  const diff = useMemo(
    () => (proposed ? diffForms(currentSchema, proposed.form) : null),
    [proposed, currentSchema],
  );

  function imagePayload(): GenerateFormInput["images"] {
    return image ? [{ base64: image.base64, mediaType: image.mediaType }] : undefined;
  }
  const imageStrategy = twoPass ? ("two-pass" as const) : ("single" as const);

  function noteStripped(result: GenerateFormResult) {
    if (result.strippedUrls.length) {
      message.warning(`Removed ${result.strippedUrls.length} off-allowlist URL(s) for safety.`);
    }
  }

  async function onGenerate() {
    if (!prompt.trim()) {
      message.warning("Describe the form you want first.");
      return;
    }
    const input: GenerateFormInput = {
      prompt: prompt.trim(),
      guidance: guidance.trim() || undefined,
      images: imagePayload(),
      imageStrategy,
    };
    try {
      const result = await generate.mutateAsync({ input, creds });
      saveAiCreds(creds);
      setProposed(result);
      setTurns([turn("prompt", prompt.trim())]);
      noteStripped(result);
    } catch {
      // Reason shown inline via `error`; open the key section so the most common
      // cause (a missing/invalid key) is one click away.
      setByokKeys(["byok"]);
    }
  }

  async function onRefine() {
    if (!proposed || !refineText.trim()) return;
    const input: RefineFormInput = {
      baseForm: proposed.form,
      instruction: refineText.trim(),
      guidance: guidance.trim() || undefined,
      images: imagePayload(),
      imageStrategy,
    };
    try {
      const result = await refine.mutateAsync({ input, creds });
      saveAiCreds(creds);
      setProposed(result);
      setTurns((t) => [...t, turn("refine", refineText.trim())]);
      setRefineText("");
      noteStripped(result);
    } catch {
      setByokKeys(["byok"]);
    }
  }

  /** Seed the conversation from the current canvas form so it can be refined directly. */
  function refineCurrent() {
    setProposed({ form: currentSchema, attempts: 0, strippedUrls: [] });
    setTurns([turn("prompt", "Refining your current form")]);
  }

  /** Back to the composer to draft a fresh form (keeps prompt/guidance/image). */
  function newDraft() {
    setProposed(null);
    setTurns([]);
    generate.reset();
    refine.reset();
  }

  function applyForm(next: FormSchema) {
    onApply(next);
    message.success("Applied to the canvas.");
  }

  /** Read a File into the reference image, shared by the Upload button and paste. */
  function attachImage(file: File) {
    readImage(file)
      .then((img) => setImage({ ...img, name: file.name || "pasted-image.png" }))
      .catch((e) => message.error((e as Error).message));
  }

  /** Accept a screenshot pasted (Ctrl/Cmd+V) into a text box as the reference image. */
  function onPasteImage(e: React.ClipboardEvent) {
    const file = Array.from(e.clipboardData.items)
      .find((i) => i.type.startsWith("image/"))
      ?.getAsFile();
    if (!file) return; // let normal text paste through
    e.preventDefault();
    attachImage(file);
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

  const imageControls = (
    <Space direction="vertical" size="small" style={{ width: "100%" }}>
      <Space align="start" wrap>
        <Upload
          accept="image/*"
          showUploadList={false}
          beforeUpload={(file) => {
            attachImage(file);
            return false; // handle locally; never POST from Upload
          }}
        >
          <Button>Attach reference image</Button>
        </Upload>
        {!image && (
          <Typography.Text type="secondary" style={{ alignSelf: "center" }}>
            or paste a screenshot
          </Typography.Text>
        )}
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
      <Tooltip title="Reads an attached image in two passes (transcribe → build) for higher fidelity. Slower; only affects image-based requests.">
        <Space>
          <Switch size="small" checked={twoPass} onChange={setTwoPass} disabled={!image} />
          <Typography.Text type={image ? undefined : "secondary"}>
            High-fidelity image read (slower)
          </Typography.Text>
        </Space>
      </Tooltip>
    </Space>
  );

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

  // The composer: drafting a brand-new form.
  const composer = (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {errorAlert}
      {currentHasFields && (
        <Alert
          type="info"
          showIcon
          message="You have a form on the canvas"
          description={
            <Button size="small" type="link" style={{ padding: 0 }} onClick={refineCurrent}>
              Refine the current form with AI instead →
            </Button>
          }
        />
      )}
      <Input.TextArea
        autoFocus
        rows={4}
        placeholder="Describe the form, e.g. “A job application with name, email, a résumé upload and a cover letter.” You can also paste a screenshot here."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onPaste={onPasteImage}
      />
      <Space size={[8, 8]} wrap>
        <Typography.Text type="secondary">Try:</Typography.Text>
        {EXAMPLE_PROMPTS.map((ex) => (
          <Button key={ex} size="small" type="dashed" onClick={() => setPrompt(ex)}>
            {ex.length > 36 ? `${ex.slice(0, 36)}…` : ex}
          </Button>
        ))}
      </Space>
      <Input
        placeholder="Optional house-style guidance (tone, required fields, language…)"
        value={guidance}
        onChange={(e) => setGuidance(e.target.value)}
      />
      {imageControls}
      {byokSection}
      <Button type="primary" block loading={generate.isPending} onClick={onGenerate}>
        Generate
      </Button>
    </Space>
  );

  // The proposal review + conversational refine.
  const review = proposed && diff && (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {errorAlert}
      <Space size={[4, 6]} wrap>
        {turns.map((t) => (
          <Tag key={t.id} color={t.kind === "prompt" ? "blue" : "geekblue"}>
            {t.kind === "refine" ? "↳ " : ""}
            {t.text.length > 48 ? `${t.text.slice(0, 48)}…` : t.text}
          </Tag>
        ))}
      </Space>

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
            ? "Append adds these fields to your current form (colliding names are renamed). Replace swaps your whole form for this one. The drawer stays open so you can keep refining."
            : "Review the proposal, apply it, then keep refining — the canvas updates live."
        }
      />

      <div
        style={{
          maxHeight: 320,
          overflow: "auto",
          padding: 16,
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 8,
        }}
      >
        <FormRenderer schema={proposed.form} access={{ roles: ["admin"] }} />
      </div>

      <Space wrap>
        <Button
          type={currentHasFields ? "primary" : "default"}
          disabled={busy}
          onClick={() => applyForm(appendForms(currentSchema, proposed.form))}
        >
          Append fields
        </Button>
        <Button
          type={currentHasFields ? "default" : "primary"}
          danger={currentHasFields}
          disabled={busy}
          onClick={() => applyForm(proposed.form)}
        >
          {currentHasFields ? "Replace form" : "Use this form"}
        </Button>
        <Button type="text" disabled={busy} onClick={newDraft}>
          ＋ New form
        </Button>
      </Space>

      <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 12 }}>
        <Typography.Text strong>Refine</Typography.Text>
        <Input.TextArea
          rows={2}
          style={{ marginTop: 8 }}
          placeholder="e.g. “make email required, add a date of birth, group the address fields”"
          value={refineText}
          onChange={(e) => setRefineText(e.target.value)}
          onPaste={onPasteImage}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              void onRefine();
            }
          }}
        />
        <Space style={{ marginTop: 8 }} wrap>
          <Button
            type="primary"
            loading={refine.isPending}
            disabled={!refineText.trim()}
            onClick={onRefine}
          >
            Send refinement
          </Button>
          <Typography.Text type="secondary">
            Enter to send · Shift+Enter for newline
          </Typography.Text>
        </Space>
      </div>
    </Space>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={proposed ? "Refine with AI" : "Generate with AI"}
      placement="right"
      width={480}
      mask={false}
    >
      {generate.isPending && !proposed ? (
        <div style={{ padding: "48px 0", textAlign: "center" }}>
          <Spin size="large" />
          <Typography.Paragraph type="secondary" style={{ marginTop: 20 }}>
            Drafting your form, validating it against the contract, and repairing if needed. This
            usually takes a few seconds{twoPass && image ? " (two-pass is slower)" : ""}.
          </Typography.Paragraph>
        </div>
      ) : proposed ? (
        review
      ) : (
        composer
      )}
    </Drawer>
  );
}
