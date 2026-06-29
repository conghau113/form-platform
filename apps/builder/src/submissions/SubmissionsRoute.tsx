import { FormRenderer } from "@org/form-renderer-web";
import type { FormSchema } from "@org/form-schema";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Empty, message, Space, Spin, Typography } from "antd";
import { useNavigate, useParams } from "react-router-dom";
import { qk } from "../query";
import { loadForm } from "../workspace/client";
import { useSubmission, useSubmissions, useSubmitForm } from "./useSubmissions";

const { Title, Text } = Typography;

/**
 * Form Submissions view (FS1) — the runtime counterpart to the form editor. Two modes share one
 * route: with no `submissionId` it submits a new answer + lists past ones; with one it shows a
 * read-only detail rendered from the submission's PINNED schema snapshot (so an old answer always
 * reads as the form was when submitted, regardless of later edits). The server is authoritative:
 * submitting POSTs `{data}` and `@org/form-core` re-validates — a failure surfaces as the 422 message.
 */
export function SubmissionsRoute() {
  const { projectId, formId, submissionId } = useParams<{
    projectId: string;
    formId: string;
    submissionId?: string;
  }>();

  return submissionId ? (
    <SubmissionDetail key={submissionId} projectId={projectId} formId={formId} id={submissionId} />
  ) : (
    <SubmissionLauncher projectId={projectId} formId={formId as string} />
  );
}

/** Mode A — submit a new answer + browse past submissions. */
function SubmissionLauncher({
  projectId,
  formId,
}: {
  projectId: string | undefined;
  formId: string;
}) {
  const navigate = useNavigate();
  const formQuery = useQuery({
    queryKey: qk.form(formId),
    queryFn: () => loadForm(formId),
    enabled: !!formId,
  });
  const form = formQuery.data as FormSchema | undefined;
  const { submissions, loading } = useSubmissions(formId);
  const submit = useSubmitForm(formId);

  const onSubmit = async (values: Record<string, unknown>) => {
    try {
      await submit(values);
      message.success("Đã ghi nhận câu trả lời");
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Title level={3} style={{ margin: 0 }}>
          {form?.title ?? "Submissions"}
        </Title>

        <Card title="Câu trả lời mới" size="small">
          {formQuery.isPending ? (
            <Spin />
          ) : form ? (
            <FormRenderer
              key={submissions.length /* reset the fields after a successful submit */}
              schema={form}
              onSubmit={onSubmit}
              locale={form.defaultLocale}
            />
          ) : (
            <Alert type="error" showIcon message="Không tải được form" />
          )}
        </Card>

        <Card title={`Đã gửi (${submissions.length})`} size="small">
          {loading ? (
            <Spin />
          ) : submissions.length === 0 ? (
            <Empty description="Chưa có câu trả lời nào" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <Space direction="vertical" style={{ width: "100%" }}>
              {submissions.map((s) => (
                <Button
                  key={s.id}
                  block
                  style={{ textAlign: "left", height: "auto", padding: "8px 12px" }}
                  onClick={() =>
                    navigate(`/projects/${projectId}/forms/${formId}/submissions/${s.id}`)
                  }
                >
                  <Space style={{ justifyContent: "space-between", width: "100%" }}>
                    <Text style={{ fontSize: 13 }}>{s.submittedBy}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {new Date(s.submittedAt).toLocaleString()}
                    </Text>
                  </Space>
                </Button>
              ))}
            </Space>
          )}
        </Card>
      </Space>
    </div>
  );
}

/** Mode B — read one submission, rendered from its pinned schema snapshot. */
function SubmissionDetail({
  projectId,
  formId,
  id,
}: {
  projectId: string | undefined;
  formId: string | undefined;
  id: string;
}) {
  const navigate = useNavigate();
  const { submission, loading, error } = useSubmission(id);
  const back = () => navigate(`/projects/${projectId}/forms/${formId}/submissions`);

  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
        <Spin />
      </div>
    );
  }
  if (error || !submission) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="error"
          showIcon
          message="Không tải được câu trả lời"
          description={error ?? ""}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Space>
          <Button onClick={back}>← Danh sách</Button>
          <div>
            <Title level={4} style={{ margin: 0 }}>
              {submission.schemaSnapshot.title}
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {submission.submittedBy} · {new Date(submission.submittedAt).toLocaleString()}
            </Text>
          </div>
        </Space>
        <Card size="small">
          <FormRenderer
            schema={submission.schemaSnapshot}
            initialValues={submission.data}
            readPretty
            hideSubmit
            locale={submission.schemaSnapshot.defaultLocale}
          />
        </Card>
      </Space>
    </div>
  );
}
