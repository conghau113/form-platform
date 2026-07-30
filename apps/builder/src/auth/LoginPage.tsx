import { GoogleOutlined } from "@ant-design/icons";
import { App as AntApp, Button, Card, Divider, Form, Input, Tabs, Typography } from "antd";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { googleSignInUrl } from "./client";
import { useAuth, useAuthProviders } from "./useAuth";

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
  const providers = useAuthProviders();
  const navigate = useNavigate();
  const target = useRedirectTarget();
  const [submitting, setSubmitting] = useState(false);
  const [params, setParams] = useSearchParams();

  // The OAuth callback bounces failures back here with `?error=oauth` (it never leaks *why*).
  // Consume the flag so a reload does not re-raise the toast. The ref is load-bearing: clearing
  // the param is asynchronous, so StrictMode's double-invoked effect would otherwise toast twice.
  const oauthFailed = params.get("error") === "oauth";
  const oauthErrorShown = useRef(false);
  useEffect(() => {
    if (!oauthFailed || oauthErrorShown.current) return;
    oauthErrorShown.current = true;
    message.error("Đăng nhập bằng Google thất bại. Vui lòng thử lại.");
    setParams({}, { replace: true });
  }, [oauthFailed, message, setParams]);

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
                  <div style={{ marginTop: 12, textAlign: "center" }}>
                    <Link to="/forgot-password">Quên mật khẩu?</Link>
                  </div>
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
        {/* Only offered when the deployment actually configured Google (A3) — a sign-in button
            that leads to a 404 is worse than no button. A real navigation, not a fetch: the
            OAuth consent screen has to own the top-level window. */}
        {providers.google && (
          <>
            <Divider plain style={{ marginBottom: 12 }}>
              hoặc
            </Divider>
            <Button
              block
              icon={<GoogleOutlined />}
              onClick={() => {
                window.location.href = googleSignInUrl;
              }}
            >
              Đăng nhập với Google
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
