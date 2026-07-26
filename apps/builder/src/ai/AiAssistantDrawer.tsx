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
  "Đơn xin việc: họ tên, email, điện thoại, tải CV và thư xin việc.",
  "Đăng ký sự kiện: họ tên, email, số điện thoại, số người tham dự, ghi chú.",
  "Khảo sát phản hồi khách hàng với thang điểm 1–5, điều làm tốt và điều cần cải thiện.",
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
      if (!match) return reject(new Error("Ảnh không hỗ trợ"));
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
      message.warning(
        `Đã loại ${result.strippedUrls.length} URL ngoài danh sách cho phép để an toàn.`,
      );
    }
  }

  async function onGenerate() {
    if (!prompt.trim()) {
      message.warning("Hãy mô tả biểu mẫu bạn muốn trước.");
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
    setTurns([turn("prompt", "Đang tinh chỉnh biểu mẫu hiện tại")]);
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
    message.success("Đã áp dụng vào canvas.");
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
          <Button>Đính kèm ảnh tham chiếu</Button>
        </Upload>
        {!image && (
          <Typography.Text type="secondary" style={{ alignSelf: "center" }}>
            hoặc dán ảnh chụp màn hình
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
      <Tooltip title="Đọc ảnh đính kèm qua hai lượt (chép lại → dựng) để chính xác hơn. Chậm hơn; chỉ ảnh hưởng yêu cầu có ảnh.">
        <Space>
          <Switch size="small" checked={twoPass} onChange={setTwoPass} disabled={!image} />
          <Typography.Text type={image ? undefined : "secondary"}>
            Đọc ảnh độ chính xác cao (chậm hơn)
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
          label: "Khóa API (tùy chọn — dùng mặc định của server nếu để trống)",
          children: (
            <Space direction="vertical" size="small" style={{ width: "100%" }}>
              <Segmented
                block
                value={creds.provider ?? ""}
                onChange={(v) =>
                  setCreds((c) => ({ ...c, provider: (v || undefined) as AiCreds["provider"] }))
                }
                options={[
                  { label: "Mặc định server", value: "" },
                  { label: "Tương thích OpenAI", value: "openai" },
                  { label: "Anthropic", value: "anthropic" },
                ]}
              />
              {credField("apiKey", "Khóa API (lưu trong trình duyệt, gửi mỗi yêu cầu)", true)}
              {credField("baseUrl", "Base URL — chỉ tương thích OpenAI (vd 9router/Azure)")}
              {credField("model", "ID model (vd gpt-4o-mini, claude-sonnet-4-6)")}
            </Space>
          ),
        },
      ]}
    />
  );

  const errorAlert = error && (
    <Alert type="error" showIcon message="Không kết nối được model" description={error.message} />
  );

  // The composer: drafting a brand-new form.
  const composer = (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {errorAlert}
      {currentHasFields && (
        <Alert
          type="info"
          showIcon
          message="Bạn đang có biểu mẫu trên canvas"
          description={
            <Button size="small" type="link" style={{ padding: 0 }} onClick={refineCurrent}>
              Tinh chỉnh biểu mẫu hiện tại bằng AI →
            </Button>
          }
        />
      )}
      <Input.TextArea
        autoFocus
        rows={4}
        placeholder="Mô tả biểu mẫu, vd “Đơn xin việc với họ tên, email, tải CV và thư xin việc.” Bạn cũng có thể dán ảnh chụp màn hình vào đây."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onPaste={onPasteImage}
      />
      <Space size={[8, 8]} wrap>
        <Typography.Text type="secondary">Thử:</Typography.Text>
        {EXAMPLE_PROMPTS.map((ex) => (
          <Button key={ex} size="small" type="dashed" onClick={() => setPrompt(ex)}>
            {ex.length > 36 ? `${ex.slice(0, 36)}…` : ex}
          </Button>
        ))}
      </Space>
      <Input
        placeholder="Hướng dẫn phong cách tùy chọn (giọng điệu, trường bắt buộc, ngôn ngữ…)"
        value={guidance}
        onChange={(e) => setGuidance(e.target.value)}
      />
      {imageControls}
      {byokSection}
      <Button type="primary" block loading={generate.isPending} onClick={onGenerate}>
        Tạo
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
            <Tag color="blue">{diff.proposedCount} trường</Tag>
            {diff.added.length > 0 && <Tag color="green">+{diff.added.length} mới</Tag>}
            {diff.kept.length > 0 && <Tag>{diff.kept.length} chung</Tag>}
            {currentHasFields && diff.removed.length > 0 && (
              <Tag color="red">Thay thế bỏ {diff.removed.length} hiện tại</Tag>
            )}
            {proposed.attempts > 1 && <Tag color="gold">đã sửa ×{proposed.attempts - 1}</Tag>}
          </Space>
        }
        description={
          currentHasFields
            ? "Thêm sẽ thêm các trường này vào biểu mẫu hiện tại (tên trùng sẽ được đổi). Thay thế đổi toàn bộ biểu mẫu sang cái này. Ngăn kéo vẫn mở để bạn tiếp tục tinh chỉnh."
            : "Xem đề xuất, áp dụng, rồi tiếp tục tinh chỉnh — canvas cập nhật trực tiếp."
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
          Thêm trường
        </Button>
        <Button
          type={currentHasFields ? "default" : "primary"}
          danger={currentHasFields}
          disabled={busy}
          onClick={() => applyForm(proposed.form)}
        >
          {currentHasFields ? "Thay biểu mẫu" : "Dùng biểu mẫu này"}
        </Button>
        <Button type="text" disabled={busy} onClick={newDraft}>
          ＋ Biểu mẫu mới
        </Button>
      </Space>

      <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 12 }}>
        <Typography.Text strong>Tinh chỉnh</Typography.Text>
        <Input.TextArea
          rows={2}
          style={{ marginTop: 8 }}
          placeholder="vd “bắt buộc email, thêm ngày sinh, gom các trường địa chỉ”"
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
            Gửi tinh chỉnh
          </Button>
          <Typography.Text type="secondary">Enter để gửi · Shift+Enter xuống dòng</Typography.Text>
        </Space>
      </div>
    </Space>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={proposed ? "Tinh chỉnh bằng AI" : "Tạo bằng AI"}
      placement="right"
      width={480}
      mask={false}
    >
      {generate.isPending && !proposed ? (
        <div style={{ padding: "48px 0", textAlign: "center" }}>
          <Spin size="large" />
          <Typography.Paragraph type="secondary" style={{ marginTop: 20 }}>
            Đang soạn biểu mẫu, kiểm tra theo hợp đồng schema và sửa nếu cần. Thường mất vài giây
            {twoPass && image ? " (hai lượt sẽ chậm hơn)" : ""}.
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
