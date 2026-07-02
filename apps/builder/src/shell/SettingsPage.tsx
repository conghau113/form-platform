import { Card, Descriptions, Typography } from "antd";
import { useAuth } from "../auth";

/**
 * Settings section (§6.7). Minimal for now — shows the signed-in account. Tenant/edition and
 * per-tenant configuration land here from Phase B onward.
 */
export function SettingsPage() {
  const { user } = useAuth();

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Cài đặt
      </Typography.Title>
      <Card title="Tài khoản">
        <Descriptions column={1} size="small">
          <Descriptions.Item label="Email">{user?.email ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Tên hiển thị">{user?.displayName || "—"}</Descriptions.Item>
        </Descriptions>
      </Card>
      <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
        Cấu hình tổ chức và phân quyền sẽ xuất hiện ở đây khi bật các phase kế tiếp.
      </Typography.Paragraph>
    </div>
  );
}
