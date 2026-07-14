import { App as AntApp, Button, Card, Form, Input, Tabs, Typography } from "antd";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth";

interface LoginValues {
  email: string;
  password: string;
}
interface RegisterValues extends LoginValues {
  displayName?: string;
}

/** Where to send the user after auth — the route they were bounced from, or the projects home. */
function useRedirectTarget(): string {
  const location = useLocation();
  return (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/projects";
}

/**
 * Login / register page (`/login`, production-hardening 2B). Self-managed email+password auth with
 * two tabs. On success the server sets the HttpOnly cookie and {@link useAuth} flips to `authed`, so
 * we just navigate onward. An already-authenticated visitor is redirected away immediately.
 */
export function LoginPage() {
  const { message } = AntApp.useApp();
  const { status, login, register } = useAuth();
  const navigate = useNavigate();
  const target = useRedirectTarget();
  const [submitting, setSubmitting] = useState(false);

  if (status === "authed") return <Navigate to={target} replace />;

  const run = (action: () => Promise<void>) => async () => {
    setSubmitting(true);
    try {
      await action();
      navigate(target, { replace: true });
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const onLogin = (v: LoginValues) => run(() => login(v.email, v.password))();
  const onRegister = (v: RegisterValues) =>
    run(() => register(v.email, v.password, v.displayName))();

  return (
    <div style={{ display: "grid", placeItems: "center", height: "100vh", padding: 16 }}>
      <Card style={{ width: 380 }}>
        <Typography.Title level={3} style={{ marginTop: 0, textAlign: "center" }}>
          Form Platform
        </Typography.Title>
        <Tabs
          centered
          defaultActiveKey="login"
          items={[
            {
              key: "login",
              label: "Đăng nhập",
              children: (
                <Form layout="vertical" onFinish={onLogin} requiredMark={false}>
                  <Form.Item
                    name="email"
                    label="Email"
                    rules={[{ required: true, type: "email", message: "Nhập email hợp lệ" }]}
                  >
                    <Input autoComplete="email" placeholder="you@example.com" />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    label="Mật khẩu"
                    rules={[{ required: true, message: "Nhập mật khẩu" }]}
                  >
                    <Input.Password autoComplete="current-password" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" block loading={submitting}>
                    Đăng nhập
                  </Button>
                </Form>
              ),
            },
            {
              key: "register",
              label: "Tạo tài khoản",
              children: (
                <Form layout="vertical" onFinish={onRegister} requiredMark={false}>
                  <Form.Item name="displayName" label="Tên hiển thị (tùy chọn)">
                    <Input autoComplete="name" placeholder="Tên của bạn" />
                  </Form.Item>
                  <Form.Item
                    name="email"
                    label="Email"
                    rules={[{ required: true, type: "email", message: "Nhập email hợp lệ" }]}
                  >
                    <Input autoComplete="email" placeholder="you@example.com" />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    label="Mật khẩu"
                    rules={[{ required: true, min: 8, message: "Ít nhất 8 ký tự" }]}
                  >
                    <Input.Password autoComplete="new-password" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" block loading={submitting}>
                    Tạo tài khoản
                  </Button>
                </Form>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
