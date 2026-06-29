import { FormRenderer } from "@org/form-renderer-web";
import type { FormSchema } from "@org/form-schema";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Empty, message, Select, Space, Spin, Typography } from "antd";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { qk } from "../query";
import { loadForm } from "../workspace/client";
import { formRoles } from "./form-roles";
import { useSubmission, useSubmissions, useSubmitForm } from "./useSubmissions";

const { Title, Text } = Typography;

/** "Acting as" role picker (FS2). The operator declares the domain roles they act in; the server
 *  masks/strips fields they can't view. Defaults to all roles (`value ?? roles`), so nothing is
 *  hidden until the operator narrows it. Hidden when the form gates no field on a role. */
function ActingAsPicker({
  roles,
  value,
  onChange,
}: {
  roles: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  if (roles.length === 0) return null;
  return (
    <Space>
      <Text type="secondary" style={{ fontSize: 13 }}>
        Đang thao tác với vai trò:
      </Text>
      <Select
        mode="multiple"
        allowClear
        size="small"
        style={{ minWidth: 220 }}
        placeholder="(không vai trò nào)"
        value={value}
        onChange={onChange}
        options={roles.map((r) => ({ label: r, value: r }))}
      />
    </Space>
  );
}

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
  const roles = useMemo(() => (form ? formRoles(form) : []), [form]);
  const [actingRoles, setActingRoles] = useState<string[] | null>(null);
  const effectiveRoles = actingRoles ?? roles; // default = all roles until the operator narrows it

  const onSubmit = async (values: Record<string, unknown>) => {
    try {
      await submit(values, effectiveRoles);
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

        <ActingAsPicker roles={roles} value={effectiveRoles} onChange={setActingRoles} />

        <Card title="Câu trả lời mới" size="small">
          {formQuery.isPending ? (
            <Spin />
          ) : form ? (
            <FormRenderer
              key={
                `${submissions.length}:${effectiveRoles.join(",")}` /* reset on submit / role change */
              }
              schema={form}
              onSubmit={onSubmit}
              access={{ roles: effectiveRoles }}
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
  // The role menu comes from the (live) form; masking itself uses the submission's pinned snapshot
  // server-side. Loading the form first lets the picker default to all roles BEFORE the submission
  // is fetched, so the detail opens unmasked rather than flashing project-role masking.
  const formQuery = useQuery({
    queryKey: qk.form(formId ?? ""),
    queryFn: () => loadForm(formId as string),
    enabled: !!formId,
  });
  const form = formQuery.data as FormSchema | undefined;
  const roles = useMemo(() => (form ? formRoles(form) : []), [form]);
  const [actingRoles, setActingRoles] = useState<string[] | null>(null);
  const effectiveRoles = actingRoles ?? roles;
  const { submission, loading, error } = useSubmission(form ? id : undefined, effectiveRoles);
  const back = () => navigate(`/projects/${projectId}/forms/${formId}/submissions`);

  if (formQuery.isPending || loading) {
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
        <ActingAsPicker roles={roles} value={effectiveRoles} onChange={setActingRoles} />
        <Card size="small">
          <FormRenderer
            schema={submission.schemaSnapshot}
            initialValues={submission.data}
            access={{ roles: effectiveRoles }}
            readPretty
            hideSubmit
            locale={submission.schemaSnapshot.defaultLocale}
          />
        </Card>
      </Space>
    </div>
  );
}
