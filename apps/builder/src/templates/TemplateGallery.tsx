import { DeleteOutlined } from "@ant-design/icons";
import type { FormSchema } from "@org/form-schema";
import { Button, Card, Col, Empty, Input, Modal, Row, Space, Typography } from "antd";
import { useState } from "react";
import { BUILTIN_TEMPLATES, type Template } from "./templates";

/* ----------------------------------------------------------------------------
 * TemplateGallery — Phase I. A modal launched from the header: pick a starter
 * (built-in preset or a user-saved template) to replace the current form, or
 * save the current form as a reusable template. Pure presentation — the schema
 * and the user-template store are owned by App and threaded in.
 * ------------------------------------------------------------------------- */

function TemplateCard({
  template,
  onUse,
  onDelete,
}: {
  template: Template;
  onUse: () => void;
  onDelete?: () => void;
}) {
  return (
    <Card
      size="small"
      title={template.title}
      extra={
        onDelete && (
          <Button
            type="text"
            size="small"
            aria-label={`Delete ${template.title}`}
            icon={<DeleteOutlined />}
            onClick={onDelete}
          />
        )
      }
      actions={[
        <Button key="use" type="link" onClick={onUse}>
          Use
        </Button>,
      ]}
    >
      <Typography.Paragraph type="secondary" style={{ margin: 0, minHeight: 44 }}>
        {template.description}
      </Typography.Paragraph>
    </Card>
  );
}

export function TemplateGallery({
  open,
  onClose,
  onUse,
  userTemplates,
  onSaveCurrent,
  onDeleteUser,
}: {
  open: boolean;
  onClose: () => void;
  /** Apply a template's schema to the canvas, then close. */
  onUse: (schema: FormSchema) => void;
  userTemplates: Template[];
  onSaveCurrent: (title: string) => void;
  onDeleteUser: (id: string) => void;
}) {
  const [name, setName] = useState("");

  const use = (schema: FormSchema) => {
    onUse(schema);
    onClose();
  };

  const grid = (templates: Template[], deletable: boolean) => (
    <Row gutter={[12, 12]}>
      {templates.map((t) => (
        <Col key={t.id} xs={24} sm={12} md={8}>
          <TemplateCard
            template={t}
            onUse={() => use(t.schema)}
            onDelete={deletable ? () => onDeleteUser(t.id) : undefined}
          />
        </Col>
      ))}
    </Row>
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Templates"
      width={760}
      footer={null}
      destroyOnHidden
    >
      <Typography.Title level={5}>Starters</Typography.Title>
      {grid(BUILTIN_TEMPLATES, false)}

      <Typography.Title level={5} style={{ marginTop: 24 }}>
        Your templates
      </Typography.Title>
      {userTemplates.length > 0 ? (
        grid(userTemplates, true)
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Save the current form below to reuse it later."
        />
      )}

      <Space.Compact style={{ marginTop: 24, width: "100%" }}>
        <Input
          placeholder="Template name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onPressEnter={() => {
            if (!name.trim()) return;
            onSaveCurrent(name);
            setName("");
          }}
        />
        <Button
          type="primary"
          disabled={!name.trim()}
          onClick={() => {
            onSaveCurrent(name);
            setName("");
          }}
        >
          Save current form as template
        </Button>
      </Space.Compact>
    </Modal>
  );
}
