import { Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Link } from "react-router-dom";
import type {
  AdminFormRow,
  AdminFormVersionRow,
  AdminWorkflowInstanceRow,
  AdminWorkflowRow,
} from "./client";
import {
  useAdminForms,
  useAdminFormVersions,
  useAdminInstances,
  useAdminWorkflows,
} from "./useAdmin";

/**
 * Read-only tenant-wide admin tables (product-roadmap D2–D4). Each lists everything of one kind
 * across the caller's tenant (server-gated by `form.admin` / `workflow.admin`) and links into the
 * existing per-project editor — the admin panels observe + navigate; they never mutate here.
 */

const fmt = (iso: string): string => new Date(iso).toLocaleString("vi-VN");

const openCol = <T,>(to: (row: T) => string): ColumnsType<T>[number] => ({
  title: "",
  key: "open",
  width: 64,
  render: (_: unknown, row: T) => <Link to={to(row)}>Mở</Link>,
});

export function FormsPanel() {
  const { rows, loading } = useAdminForms(true);
  const columns: ColumnsType<AdminFormRow> = [
    { title: "Tên biểu mẫu", dataIndex: "title", key: "title" },
    { title: "Dự án", dataIndex: "projectName", key: "projectName" },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      render: (s: string | null) =>
        s ? <Tag>{s}</Tag> : <Typography.Text type="secondary">—</Typography.Text>,
    },
    { title: "Cập nhật", dataIndex: "updatedAt", key: "updatedAt", render: fmt },
    openCol<AdminFormRow>((r) => `/projects/${r.projectId}/forms/${r.id}`),
  ];
  return <Table rowKey="id" size="small" loading={loading} columns={columns} dataSource={rows} />;
}

export function WorkflowsPanel() {
  const { rows, loading } = useAdminWorkflows(true);
  const columns: ColumnsType<AdminWorkflowRow> = [
    { title: "Tên quy trình", dataIndex: "title", key: "title" },
    { title: "Dự án", dataIndex: "projectName", key: "projectName" },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      render: (s: string | null) =>
        s ? <Tag>{s}</Tag> : <Typography.Text type="secondary">—</Typography.Text>,
    },
    { title: "Cập nhật", dataIndex: "updatedAt", key: "updatedAt", render: fmt },
    openCol<AdminWorkflowRow>((r) => `/projects/${r.projectId}/workflows/${r.id}/edit`),
  ];
  return <Table rowKey="id" size="small" loading={loading} columns={columns} dataSource={rows} />;
}

export function VersionsPanel() {
  const { rows, loading } = useAdminFormVersions(true);
  const columns: ColumnsType<AdminFormVersionRow> = [
    { title: "Biểu mẫu", dataIndex: "formTitle", key: "formTitle" },
    { title: "Phiên bản", dataIndex: "version", key: "version", render: (v: number) => `v${v}` },
    { title: "Dự án", dataIndex: "projectName", key: "projectName" },
    { title: "Người publish", dataIndex: "publishedBy", key: "publishedBy" },
    { title: "Ngày publish", dataIndex: "publishedAt", key: "publishedAt", render: fmt },
    openCol<AdminFormVersionRow>((r) => `/projects/${r.projectId}/forms/${r.formId}/versions`),
  ];
  return <Table rowKey="id" size="small" loading={loading} columns={columns} dataSource={rows} />;
}

export function InstancesPanel() {
  const { rows, loading } = useAdminInstances(true);
  const columns: ColumnsType<AdminWorkflowInstanceRow> = [
    {
      title: "Case",
      key: "label",
      render: (_: unknown, r: AdminWorkflowInstanceRow) =>
        r.label ?? <Typography.Text type="secondary">{r.id}</Typography.Text>,
    },
    { title: "Quy trình", dataIndex: "workflowTitle", key: "workflowTitle" },
    {
      title: "Trạng thái",
      dataIndex: "current",
      key: "current",
      render: (c: string) => <Tag>{c}</Tag>,
    },
    { title: "Dự án", dataIndex: "projectName", key: "projectName" },
    { title: "Cập nhật", dataIndex: "updatedAt", key: "updatedAt", render: fmt },
    openCol<AdminWorkflowInstanceRow>(
      (r) => `/projects/${r.projectId}/workflows/${r.workflowId}/run/${r.id}`,
    ),
  ];
  return <Table rowKey="id" size="small" loading={loading} columns={columns} dataSource={rows} />;
}
