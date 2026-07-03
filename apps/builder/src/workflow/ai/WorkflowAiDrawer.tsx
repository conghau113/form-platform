import type { WorkflowDefinition } from "@org/workflow-schema";
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
  Tag,
  Typography,
} from "antd";
import { useMemo, useState } from "react";
import { type AiCreds, loadAiCreds, saveAiCreds } from "../../ai/creds";
import type { GenerateWorkflowInput, GenerateWorkflowResult, RefineWorkflowInput } from "./client";
import { diffWorkflows } from "./diff";
import { useGenerateWorkflow, useRefineWorkflow } from "./useWorkflowAi";

export interface WorkflowAiDrawerProps {
  open: boolean;
  onClose: () => void;
  /** The working workflow — used to diff a proposal and as the base for "refine the current one". */
  currentWorkflow: WorkflowDefinition;
  /** Accept the proposal into the canvas (replaces the graph; the editor keeps the persisted id). */
  onApply: (next: WorkflowDefinition) => void;
}

/** Starter prompts so the user never faces a blank box (EN + VI, the product's two locales). */
const EXAMPLE_PROMPTS = [
  "A 3-level leave-approval flow: employee submits, manager approves, then HR approves.",
  "Quy trình duyệt mua sắm: nhân viên đề xuất → quản lý duyệt → kế toán thanh toán.",
  "An expense claim: draft → submitted → (approved | rejected back to draft).",
];

/** One line of the conversation log shown above the proposal. */
interface Turn {
  id: string;
  kind: "prompt" | "refine";
  text: string;
}

function turn(kind: Turn["kind"], text: string): Turn {
  return { id: crypto.randomUUID(), kind, text };
}

/**
 * "Generate with AI" for workflows — the non-blocking, conversational surface, mirroring the
 * form `AiAssistantDrawer`. A right-side Drawer (`mask=false`) so the real canvas stays visible
 * while you iterate. A prompt becomes a contract- AND graph-valid `WorkflowDefinition` via the
 * headless endpoint; the proposal shows as a structured preview + a state-level diff BEFORE it
 * touches the canvas.
 *
 * After the first generation the bottom input turns into a **Refine** box: each instruction
 * ("add a rejection branch, require a manager role on approve") edits the latest proposal via
 * `POST /ai/workflows/refine`. Apply REPLACES the canvas graph (a workflow is one cohesive state
 * machine — there is no "append") as one editor change, leaving the Drawer open so the user keeps
 * refining. On an existing workflow you can also seed the conversation from it and refine directly.
 *
 * Failures surface as a persistent inline error (not a vanishing toast) so the reason — most often
 * a missing API key — stays readable.
 */
export function WorkflowAiDrawer({
  open,
  onClose,
  currentWorkflow,
  onApply,
}: WorkflowAiDrawerProps) {
  const { message } = AntApp.useApp();
  const [prompt, setPrompt] = useState("");
  const [guidance, setGuidance] = useState("");
  const [creds, setCreds] = useState<AiCreds>(() => loadAiCreds());
  const [byokKeys, setByokKeys] = useState<string[]>([]);
  const [proposed, setProposed] = useState<GenerateWorkflowResult | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [refineText, setRefineText] = useState("");

  const generate = useGenerateWorkflow();
  const refine = useRefineWorkflow();
  const busy = generate.isPending || refine.isPending;
  const error = (refine.error ?? generate.error) as Error | null;

  const diff = useMemo(
    () => (proposed ? diffWorkflows(currentWorkflow, proposed.workflow) : null),
    [proposed, currentWorkflow],
  );

  async function onGenerate() {
    if (!prompt.trim()) {
      message.warning("Describe the process you want first.");
      return;
    }
    const input: GenerateWorkflowInput = {
      prompt: prompt.trim(),
      guidance: guidance.trim() || undefined,
    };
    try {
      const result = await generate.mutateAsync({ input, creds });
      saveAiCreds(creds);
      setProposed(result);
      setTurns([turn("prompt", prompt.trim())]);
    } catch {
      // Reason shown inline via `error`; open the key section so the most common cause
      // (a missing/invalid key) is one click away.
      setByokKeys(["byok"]);
    }
  }

  async function onRefine() {
    if (!proposed || !refineText.trim()) return;
    const input: RefineWorkflowInput = {
      currentWorkflow: proposed.workflow,
      instruction: refineText.trim(),
      guidance: guidance.trim() || undefined,
    };
    try {
      const result = await refine.mutateAsync({ input, creds });
      saveAiCreds(creds);
      setProposed(result);
      setTurns((t) => [...t, turn("refine", refineText.trim())]);
      setRefineText("");
    } catch {
      setByokKeys(["byok"]);
    }
  }

  /** Seed the conversation from the current canvas workflow so it can be refined directly. */
  function refineCurrent() {
    setProposed({ workflow: currentWorkflow, attempts: 0 });
    setTurns([turn("prompt", "Refining your current workflow")]);
  }

  /** Back to the composer to draft a fresh workflow (keeps prompt/guidance). */
  function newDraft() {
    setProposed(null);
    setTurns([]);
    generate.reset();
    refine.reset();
  }

  function applyWorkflow(next: WorkflowDefinition) {
    onApply(next);
    message.success("Applied to the canvas.");
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

  // The composer: drafting a brand-new workflow.
  const composer = (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {errorAlert}
      <Alert
        type="info"
        showIcon
        message="You already have a workflow on the canvas"
        description={
          <Button size="small" type="link" style={{ padding: 0 }} onClick={refineCurrent}>
            Refine the current workflow with AI instead →
          </Button>
        }
      />
      <Input.TextArea
        autoFocus
        rows={4}
        placeholder="Describe the process, e.g. “A 3-level leave-approval flow: employee submits, manager approves, then HR approves.”"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
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
        placeholder="Optional house-style guidance (roles, naming, language…)"
        value={guidance}
        onChange={(e) => setGuidance(e.target.value)}
      />
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
        type={diff.removedStates.length ? "warning" : "info"}
        message={
          <Space size={[4, 4]} wrap>
            <Typography.Text strong>
              {proposed.workflow.title || proposed.workflow.id}
            </Typography.Text>
            <Tag color="blue">{diff.proposedStateCount} states</Tag>
            <Tag color="purple">{diff.proposedTransitionCount} transitions</Tag>
            {diff.addedStates.length > 0 && <Tag color="green">+{diff.addedStates.length} new</Tag>}
            {diff.removedStates.length > 0 && (
              <Tag color="red">Replaces {diff.removedStates.length} current</Tag>
            )}
            {proposed.attempts > 1 && <Tag color="gold">repaired ×{proposed.attempts - 1}</Tag>}
          </Space>
        }
        description="Applying replaces the whole graph on the canvas (a workflow is one state machine). The drawer stays open so you can keep refining."
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
        <WorkflowSummaryView workflow={proposed.workflow} />
      </div>

      <Space wrap>
        <Button type="primary" disabled={busy} onClick={() => applyWorkflow(proposed.workflow)}>
          Use this workflow
        </Button>
        <Button type="text" disabled={busy} onClick={newDraft}>
          ＋ New workflow
        </Button>
      </Space>

      <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 12 }}>
        <Typography.Text strong>Refine</Typography.Text>
        <Input.TextArea
          rows={2}
          style={{ marginTop: 8 }}
          placeholder="e.g. “add a rejection branch back to draft, require the manager role on approve”"
          value={refineText}
          onChange={(e) => setRefineText(e.target.value)}
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
      title={proposed ? "Refine workflow with AI" : "Generate workflow with AI"}
      placement="right"
      width={480}
      mask={false}
    >
      {generate.isPending && !proposed ? (
        <div style={{ padding: "48px 0", textAlign: "center" }}>
          <Spin size="large" />
          <Typography.Paragraph type="secondary" style={{ marginTop: 20 }}>
            Drafting your workflow, validating its graph against the contract, and repairing if
            needed. This usually takes a few seconds.
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

/** Read-only structured preview of a proposed workflow: its start, states (with any bound form),
 *  and transitions (from →[action]→ to, with role/guard badges). The full graph appears on the
 *  real canvas the moment the user applies it; this just conveys the shape beforehand. */
function WorkflowSummaryView({ workflow }: { workflow: WorkflowDefinition }) {
  const statusOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of workflow.nodes) m.set(n.id, n.status);
    return (id: string) => m.get(id) ?? id;
  }, [workflow.nodes]);

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          States
        </Typography.Text>
        <Space direction="vertical" size={4} style={{ width: "100%", marginTop: 4 }}>
          {workflow.nodes.map((n) => (
            <Space key={n.id} size={6} wrap>
              <Typography.Text strong>{n.status || "(unnamed)"}</Typography.Text>
              {n.id === workflow.start && <Tag color="green">start</Tag>}
              {n.formId && <Tag color="blue">form: {n.formId}</Tag>}
            </Space>
          ))}
        </Space>
      </div>
      {workflow.transitions.length > 0 && (
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Transitions
          </Typography.Text>
          <Space direction="vertical" size={4} style={{ width: "100%", marginTop: 4 }}>
            {workflow.transitions.map((t) => (
              <Space key={t.id} size={6} wrap>
                <Typography.Text>
                  {statusOf(t.from)} <Typography.Text type="secondary">→</Typography.Text>{" "}
                  {statusOf(t.to)}
                </Typography.Text>
                <Tag>{t.action}</Tag>
                {t.role && <Tag color="geekblue">role: {t.role}</Tag>}
                {t.guard && <Tag color="orange">guard</Tag>}
              </Space>
            ))}
          </Space>
        </div>
      )}
    </Space>
  );
}
