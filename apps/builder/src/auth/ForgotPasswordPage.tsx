import { App as AntApp, Button, Card, Form, Input, Result, Typography } from "antd";
import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "./client";

/**
 * "Quên mật khẩu" (`/forgot-password`, product-roadmap A2). Public: the visitor has no session.
 * The server answers identically for known and unknown addresses (no account enumeration), so the
 * success panel is deliberately vague about whether an account exists.
 */
export function ForgotPasswordPage() {
  const { message } = AntApp.useApp();
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async ({ email }: { email: string }) => {
    setSubmitting(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "grid", placeItems: "center", height: "100vh", padding: 16 }}>
      <Card style={{ width: 420 }}>
        {sent ? (
          <Result
            status="success"
            title="Đã gửi email"
            subTitle="Nếu địa chỉ này có tài khoản, chúng tôi vừa gửi liên kết đặt lại mật khẩu. Hãy kiểm tra hộp thư của bạn."
            extra={<Link to="/login">Về trang đăng nhập</Link>}
          />
        ) : (
          <>
            <Typography.Title level={4} style={{ marginTop: 0 }}>
              Quên mật khẩu
            </Typography.Title>
            <Typography.Paragraph type="secondary">
              Nhập email của bạn, chúng tôi sẽ gửi liên kết đặt lại mật khẩu.
            </Typography.Paragraph>
            <Form layout="vertical" onFinish={onSubmit} requiredMark={false}>
              <Form.Item
                name="email"
                label="Email"
                rules={[{ required: true, type: "email", message: "Nhập email hợp lệ" }]}
              >
                <Input autoComplete="email" placeholder="you@example.com" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={submitting}>
                Gửi liên kết đặt lại
              </Button>
            </Form>
            <div style={{ marginTop: 12, textAlign: "center" }}>
              <Link to="/login">Về trang đăng nhập</Link>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
