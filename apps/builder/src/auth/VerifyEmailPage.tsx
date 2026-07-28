import { useQueryClient } from "@tanstack/react-query";
import { Card, Result, Spin } from "antd";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { qk } from "../query";
import { verifyEmail } from "./client";

type State = "pending" | "ok" | "error";

/**
 * "Xác minh email" (`/verify-email?token=…`, product-roadmap A2). Public — the link may be opened
 * in any browser, signed in or not. Redeems the one-time token on mount; the `redeemed` ref keeps
 * StrictMode's double-invoked effect from burning the token twice and reporting a false failure.
 * When the visitor *is* signed in here, we refresh `/auth/me` so the "chưa xác minh" nudge clears.
 */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<State>("pending");
  const [error, setError] = useState("");
  const redeemed = useRef(false);

  useEffect(() => {
    if (redeemed.current) return;
    redeemed.current = true;
    if (!token) {
      setState("error");
      setError("Liên kết thiếu mã xác thực.");
      return;
    }
    verifyEmail(token)
      .then(() => {
        setState("ok");
        qc.invalidateQueries({ queryKey: qk.me });
      })
      .catch((e: Error) => {
        setState("error");
        setError(e.message);
      });
  }, [token, qc]);

  return (
    <div style={{ display: "grid", placeItems: "center", height: "100vh", padding: 16 }}>
      <Card style={{ width: 420 }}>
        {state === "pending" && (
          <div style={{ display: "grid", placeItems: "center", padding: 24 }}>
            <Spin tip="Đang xác minh…" />
          </div>
        )}
        {state === "ok" && (
          <Result
            status="success"
            title="Đã xác minh email"
            subTitle="Cảm ơn bạn. Địa chỉ email của tài khoản đã được xác minh."
            extra={<Link to="/projects">Vào ứng dụng</Link>}
          />
        )}
        {state === "error" && (
          <Result
            status="error"
            title="Không xác minh được"
            subTitle={`${error} Liên kết có thể đã dùng hoặc hết hạn — hãy gửi lại từ trang Cài đặt.`}
            extra={<Link to="/login">Về trang đăng nhập</Link>}
          />
        )}
      </Card>
    </div>
  );
}
