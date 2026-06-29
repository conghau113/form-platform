import { CloudUploadOutlined } from "@ant-design/icons";
import type { FormSchema } from "@org/form-schema";
import { Button, message, Space, Tag, Tooltip } from "antd";
import { useMemo, useState } from "react";
import { diffForms, hasFormChanges } from "./diff";
import { useActiveVersion, usePublishForm } from "./useVersions";

/**
 * Editor-header publish control (FB1b): a **Publish** button + a content-based draft-ahead badge.
 * The badge is honest about whether the *current draft* differs from the active published version —
 * it diffs the live editor `schema` against `activeVersion.body` rather than comparing timestamps
 * (publishing itself bumps the form's `updatedAt`, so a timestamp compare would false-positive).
 * Publishing first saves the editor (so the frozen snapshot matches what's on screen), then freezes.
 */
export function PublishControl({
  formId,
  schema,
  onSave,
}: {
  formId: string;
  schema: FormSchema;
  onSave: () => Promise<boolean>;
}) {
  const { active, loading } = useActiveVersion(formId);
  const publish = usePublishForm(formId);
  const [publishing, setPublishing] = useState(false);

  const draftAhead = useMemo(
    () => (active ? hasFormChanges(diffForms(active.body, schema)) : false),
    [active, schema],
  );

  const onPublish = async () => {
    setPublishing(true);
    try {
      if (!(await onSave())) return; // save failed — its own message already surfaced
      const v = await publish();
      message.success(`Đã publish phiên bản v${v.version}`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Space size={8}>
      <PublishBadge loading={loading} version={active?.version ?? null} draftAhead={draftAhead} />
      <Tooltip title="Đóng băng bản nháp hiện tại thành một phiên bản đã publish">
        <Button icon={<CloudUploadOutlined />} loading={publishing} onClick={onPublish}>
          Publish
        </Button>
      </Tooltip>
    </Space>
  );
}

/** The publish-state chip: never-published / up-to-date / draft-ahead. */
function PublishBadge({
  loading,
  version,
  draftAhead,
}: {
  loading: boolean;
  version: number | null;
  draftAhead: boolean;
}) {
  if (loading) return null;
  if (version == null) return <Tag color="default">Chưa publish</Tag>;
  if (draftAhead) return <Tag color="orange">Bản nháp chưa publish</Tag>;
  return <Tag color="green">Đã publish v{version}</Tag>;
}
