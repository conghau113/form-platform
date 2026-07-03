import { FormRenderer } from "@org/form-renderer-web";
import type { FormSchema } from "@org/form-schema";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Empty,
  Modal,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { qk } from "../query";
import { loadForm } from "../workspace/client";
import { diffForms, type FieldRef, type FormDiff, hasFormChanges } from "./diff";
import { useCloneDraft, useFormVersions, usePublishForm, useVersion } from "./useVersions";

const { Title, Text } = Typography;

/**
 * Form Versions panel (FB1b) — the governance counterpart to the editor. Publish the current draft
 * into an immutable, numbered version; browse history; preview a frozen version read-only; see what
 * the live draft changed since a published version (field-level diff); and roll a past version back
 * into the draft. The server owns the history; this view only reads it + fires the three mutations.
 */
export function VersionsRoute() {
  const { formId } = useParams<{ formId: string }>();
  if (!formId) return null;
  return <VersionsPanel formId={formId} />;
}

function VersionsPanel({ formId }: { formId: string }) {
  const { message, modal } = AntApp.useApp();
  const { versions, loading } = useFormVersions(formId);
  const publish = usePublishForm(formId);
  const cloneDraft = useCloneDraft(formId);
  const [publishing, setPublishing] = useState(false);

  // Live draft (for the diff base) + the version selected to diff against (default = latest).
  const draftQuery = useQuery({
    queryKey: qk.form(formId),
    queryFn: () => loadForm(formId),
    enabled: !!formId,
  });
  const draft = draftQuery.data as FormSchema | undefined;

  const [selected, setSelected] = useState<number | null>(null);
  const latest = versions[0]?.version ?? null;
  // Default the diff/selection to the newest version once the list loads.
  useEffect(() => {
    setSelected((s) => s ?? latest);
  }, [latest]);
  const { version: selectedVersion } = useVersion(formId, selected ?? undefined);

  const [viewing, setViewing] = useState<number | null>(null);
  const { version: viewingVersion, loading: viewLoading } = useVersion(
    formId,
    viewing ?? undefined,
  );

  const onPublish = async () => {
    setPublishing(true);
    try {
      const v = await publish();
      message.success(`Đã publish phiên bản v${v.version}`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  const onRollback = (version: number) => {
    modal.confirm({
      title: `Khôi phục phiên bản v${version}?`,
      content:
        "Nội dung của phiên bản này sẽ ghi đè bản nháp hiện tại. Hãy publish lại để kích hoạt.",
      okText: "Khôi phục",
      cancelText: "Huỷ",
      onOk: async () => {
        try {
          await cloneDraft(version);
          message.success(`Đã khôi phục v${version} vào bản nháp`);
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });
  };

  return (
    <div style={{ padding: 24, maxWidth: 820, margin: "0 auto" }}>
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Space style={{ justifyContent: "space-between", width: "100%" }}>
          <Title level={3} style={{ margin: 0 }}>
            {draft?.title ?? "Phiên bản"}
          </Title>
          <Button type="primary" loading={publishing} onClick={onPublish}>
            Publish bản nháp
          </Button>
        </Space>

        <Card title="Khác biệt: phiên bản đã chọn ↔ bản nháp" size="small">
          {draftQuery.isPending || (selected != null && !selectedVersion) ? (
            <Spin />
          ) : !draft ? (
            <Alert type="error" showIcon message="Không tải được bản nháp" />
          ) : selectedVersion ? (
            <DiffView
              diff={diffForms(selectedVersion.body, draft)}
              baseVersion={selectedVersion.version}
            />
          ) : (
            <Empty
              description="Chưa có phiên bản nào để so sánh"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
        </Card>

        <Card title={`Lịch sử (${versions.length})`} size="small">
          {loading ? (
            <Spin />
          ) : versions.length === 0 ? (
            <Empty description="Chưa publish phiên bản nào" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <Space direction="vertical" style={{ width: "100%" }}>
              {versions.map((v) => (
                <div
                  key={v.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    border: "1px solid rgba(0,0,0,0.06)",
                    borderRadius: 6,
                    background: v.version === selected ? "rgba(22,119,255,0.06)" : undefined,
                  }}
                >
                  <Space>
                    <Tag color="blue">v{v.version}</Tag>
                    <Text style={{ fontSize: 13 }}>{v.publishedBy}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {new Date(v.publishedAt).toLocaleString()}
                    </Text>
                  </Space>
                  <Space>
                    <Button size="small" type="text" onClick={() => setSelected(v.version)}>
                      So sánh
                    </Button>
                    <Button size="small" onClick={() => setViewing(v.version)}>
                      Xem
                    </Button>
                    <Button size="small" onClick={() => onRollback(v.version)}>
                      Khôi phục
                    </Button>
                  </Space>
                </div>
              ))}
            </Space>
          )}
        </Card>
      </Space>

      <Modal
        open={viewing != null}
        title={viewing != null ? `Phiên bản v${viewing}` : ""}
        footer={null}
        width={720}
        onCancel={() => setViewing(null)}
        destroyOnHidden
      >
        {viewLoading || !viewingVersion ? (
          <Spin />
        ) : (
          <FormRenderer
            schema={viewingVersion.body}
            readPretty
            hideSubmit
            locale={viewingVersion.body.defaultLocale}
          />
        )}
      </Modal>
    </div>
  );
}

/** Render a field-level form diff as Added / Removed / Changed sections. */
function DiffView({ diff, baseVersion }: { diff: FormDiff; baseVersion: number }) {
  if (!hasFormChanges(diff)) {
    return (
      <Text type="secondary">Bản nháp trùng khớp với v{baseVersion} — không có thay đổi.</Text>
    );
  }
  return (
    <Space direction="vertical" style={{ width: "100%" }} size="small">
      {diff.added.length > 0 && (
        <DiffGroup color="green" label="Thêm" items={diff.added.map(fieldLabel)} />
      )}
      {diff.removed.length > 0 && (
        <DiffGroup color="red" label="Xoá" items={diff.removed.map(fieldLabel)} />
      )}
      {diff.changed.length > 0 && (
        <DiffGroup
          color="orange"
          label="Đổi"
          items={diff.changed.map((c) => `${fieldLabel(c)} (${c.changedKeys.join(", ")})`)}
        />
      )}
    </Space>
  );
}

function DiffGroup({ color, label, items }: { color: string; label: string; items: string[] }) {
  return (
    <div>
      <Tag color={color}>
        {label} ({items.length})
      </Tag>
      <ul style={{ margin: "4px 0 0", paddingInlineStart: 24 }}>
        {items.map((it) => (
          <li key={it} style={{ fontSize: 13 }}>
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function fieldLabel(f: FieldRef): string {
  return f.label ? `${f.label} (${f.path})` : f.path;
}
