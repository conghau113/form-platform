import { useQueryClient } from "@tanstack/react-query";
import {
  App as AntApp,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Space,
  Tag,
  Typography,
} from "antd";
import { useState } from "react";
import { changePassword, resendVerification, useAuth } from "../auth";
import { qk } from "../query";

interface ChangePasswordValues {
  currentPassword: string;
  newPassword: string;
  confirm: string;
}

/**
 * Settings section (§6.7). Shows the signed-in account, its email-verification state (A2 — a nudge,
 * never a gate) and the change-password form. Tenant/edition configuration lands here later.
 */
export function SettingsPage() {
  const { message } = AntApp.useApp();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form] = Form.useForm<ChangePasswordValues>();
  const [resending, setResending] = useState(false);
  const [changing, setChanging] = useState(false);

  const onResend = async () => {
    setResending(true);
    try {
      await resendVerification();
      message.success("Đã gửi lại email xác minh. Hãy kiểm tra hộp thư của bạn.");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setResending(false);
    }
  };

  const onChangePassword = async (values: ChangePasswordValues) => {
    setChanging(true);
    try {
      const updated = await changePassword(values.currentPassword, values.newPassword);
      // The server re-issued this session's cookies; keep the cached profile in step.
      qc.setQueryData(qk.me, updated);
      form.resetFields();
      message.success("Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất.");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setChanging(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Cài đặt
      </Typography.Title>
      <Card title="Tài khoản">
        <Descriptions column={1} size="small">
          <Descriptions.Item label="Email">{user?.email ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Tên hiển thị">{user?.displayName || "—"}</Descriptions.Item>
          <Descriptions.Item label="Xác minh email">
            {user?.emailVerifiedAt ? (
              <Tag color="success">Đã xác minh</Tag>
            ) : (
              <Space>
                <Tag color="warning">Chưa xác minh</Tag>
                <Button size="small" loading={resending} onClick={onResend}>
                  Gửi lại email xác minh
                </Button>
              </Space>
            )}
          </Descriptions.Item>
        </Descriptions>
      </Card>
      <Card title="Đổi mật khẩu" style={{ marginTop: 16 }}>
        <Form form={form} layout="vertical" onFinish={onChangePassword} requiredMark={false}>
          <Form.Item
            name="currentPassword"
            label="Mật khẩu hiện tại"
            rules={[{ required: true, message: "Nhập mật khẩu hiện tại" }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="Mật khẩu mới"
            rules={[{ required: true, min: 8, message: "Ít nhất 8 ký tự" }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="Nhập lại mật khẩu mới"
            dependencies={["newPassword"]}
            rules={[
              { required: true, message: "Nhập lại mật khẩu mới" },
              ({ getFieldValue }) => ({
                validator: (_, value) =>
                  !value || value === getFieldValue("newPassword")
                    ? Promise.resolve()
                    : Promise.reject(new Error("Hai mật khẩu không khớp")),
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={changing}>
            Đổi mật khẩu
          </Button>
        </Form>
      </Card>
      <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
        Cấu hình tổ chức và phân quyền sẽ xuất hiện ở đây khi bật các phase kế tiếp.
      </Typography.Paragraph>
    </div>
  );
}
