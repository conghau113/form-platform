import { App as AntApp, Button, Input, List, Space, Spin, Typography } from "antd";
import { useState } from "react";
import { useAddCaseComment, useCaseComments } from "./useWorkOrders";

const { Text, Paragraph } = Typography;

/** Matches `AddCommentDto`'s `@MaxLength(2000)` — stop before the 400 does. */
const MAX_LENGTH = 2000;

/**
 * The discussion thread on one case (Phase E2), shown beside the machine-generated history in the
 * Run view.
 *
 * Lives in `operate/` rather than `workflow/` for the same reason `assignCase` does: who is
 * responsible and what people said about it are the work-order feature's concerns, while `workflow/`
 * stays the pure runtime (start / load / advance).
 *
 * `canWrite` mirrors the server split — reading a thread only needs `viewer`, writing needs run
 * access — so a reader sees the conversation without a composer that would only earn them a 403.
 */
export function CaseComments({ instanceId, canWrite }: { instanceId: string; canWrite: boolean }) {
  const { message } = AntApp.useApp();
  const { comments, loading, error } = useCaseComments(instanceId);
  const addComment = useAddCaseComment(instanceId);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      await addComment(body);
      setDraft("");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <Text strong>Bình luận</Text>
      {loading ? (
        <div style={{ padding: 16, textAlign: "center" }}>
          <Spin size="small" />
        </div>
      ) : error ? (
        <Paragraph type="danger" style={{ marginTop: 8 }}>
          {error}
        </Paragraph>
      ) : comments.length === 0 ? (
        <Paragraph type="secondary" style={{ marginTop: 8 }}>
          Chưa có bình luận nào.
        </Paragraph>
      ) : (
        <List
          size="small"
          dataSource={comments}
          renderItem={(c) => (
            <List.Item key={c.id}>
              <Space direction="vertical" size={2} style={{ width: "100%" }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {c.authorName} · {new Date(c.createdAt).toLocaleString()}
                </Text>
                {/* Plain text, newlines preserved — never interpreted as markup. */}
                <Text style={{ whiteSpace: "pre-wrap" }}>{c.body}</Text>
              </Space>
            </List.Item>
          )}
        />
      )}

      {canWrite && (
        <Space direction="vertical" size={8} style={{ width: "100%", marginTop: 12 }}>
          <Input.TextArea
            rows={2}
            maxLength={MAX_LENGTH}
            placeholder="Viết bình luận…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button
            type="primary"
            size="small"
            loading={sending}
            disabled={draft.trim().length === 0}
            onClick={() => void send()}
          >
            Gửi
          </Button>
        </Space>
      )}
    </div>
  );
}
