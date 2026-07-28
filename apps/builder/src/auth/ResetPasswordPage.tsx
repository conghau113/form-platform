import { App as AntApp, Button, Card, Form, Input, Result, Typography } from "antd";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPassword } from "./client";

interface ResetValues {
  password: string;
  confirm: string;
}

/**
 * "Đặt lại mật khẩu" (`/reset-password?token=…`, product-roadmap A2). Public — the visitor arrives
 * from the emailed link with no session. A successful reset revokes every session server-side, so
 * we send the user to `/login` to sign in with the new password.
 */
export function ResetPasswordPage() {
  const { message } = AntApp.useApp();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async ({ password }: ResetValues) => {
    setSubmitting(true);
    try {
      await resetPassword(token, password);
      message.success("Đã đặt lại mật khẩu. Hãy đăng nhập lại.");
      navigate("/login", { replace: true });
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "grid", placeItems: "center", height: "100vh", padding: 16 }}>
      <Card style={{ width: 420 }}>
        {token ? (
          <>
            <Typography.Title level={4} style={{ marginTop: 0 }}>
              Đặt lại mật khẩu
            </Typography.Title>
            <Form layout="vertical" onFinish={onSubmit} requiredMark={false}>
              <Form.Item
                name="password"
                label="Mật khẩu mới"
                rules={[{ required: true, min: 8, message: "Ít nhất 8 ký tự" }]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <Form.Item
                name="confirm"
                label="Nhập lại mật khẩu"
                dependencies={["password"]}
                rules={[
                  { required: true, message: "Nhập lại mật khẩu" },
                  ({ getFieldValue }) => ({
                    validator: (_, value) =>
                      !value || value === getFieldValue("password")
                        ? Promise.resolve()
                        : Promise.reject(new Error("Hai mật khẩu không khớp")),
                  }),
                ]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={submitting}>
                Đặt lại mật khẩu
              </Button>
            </Form>
          </>
        ) : (
          <Result
            status="error"
            title="Liên kết không hợp lệ"
            subTitle="Liên kết đặt lại mật khẩu thiếu mã xác thực. Hãy yêu cầu gửi lại."
            extra={<Link to="/forgot-password">Gửi lại liên kết</Link>}
          />
        )}
      </Card>
    </div>
  );
}
