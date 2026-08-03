import { BellOutlined } from "@ant-design/icons";
import { Badge, Button, Dropdown, Empty, Spin, Tooltip, Typography } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Notification } from "./client";
import { formatNotificationTime, UNREAD_BADGE_CAP } from "./notification-text";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationFeed,
  useUnreadNotificationCount,
} from "./useNotifications";

/**
 * The notification bell in the {@link NavRail} footer (product-roadmap Phase E3b).
 *
 * Rendered with `popupRender` rather than `menu.items`: a notification is two lines (what happened,
 * and when) plus a read/unread state, which a menu item cannot express without abusing `label`. The
 * panel is scrollable and capped — the bell is a "what did I miss" glance, not an archive.
 *
 * Clicking one marks it read and follows its link. Marking read is fire-and-forget on purpose: the
 * navigation must not wait on it, and a failed mark simply leaves the row bold, which is the honest
 * outcome.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const unread = useUnreadNotificationCount();
  const { items, loading } = useNotificationFeed(open);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const onOpen = (item: Notification) => {
    setOpen(false);
    if (!item.readAt) void markRead(item.id).catch(() => undefined);
    if (item.link) navigate(item.link);
  };

  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      trigger={["click"]}
      placement="topLeft"
      popupRender={() => (
        <div
          style={{
            width: 320,
            background: "var(--ant-color-bg-elevated, #fff)",
            borderRadius: 8,
            boxShadow: "0 6px 16px rgba(0, 0, 0, 0.12)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "8px 12px",
              borderBottom: "1px solid rgba(5, 5, 5, 0.06)",
            }}
          >
            <Typography.Text strong>Thông báo</Typography.Text>
            <Button
              type="link"
              size="small"
              disabled={unread === 0}
              onClick={() => {
                void markAllRead().catch(() => undefined);
              }}
            >
              Đánh dấu tất cả đã đọc
            </Button>
          </div>
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 24, textAlign: "center" }}>
                <Spin size="small" />
              </div>
            ) : items.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Chưa có thông báo"
                style={{ padding: "16px 0" }}
              />
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpen(item)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 12px",
                    border: "none",
                    borderBottom: "1px solid rgba(5, 5, 5, 0.04)",
                    background: item.readAt ? "transparent" : "rgba(22, 119, 255, 0.06)",
                    cursor: "pointer",
                  }}
                >
                  <Typography.Text strong={!item.readAt} style={{ display: "block" }}>
                    {item.title}
                  </Typography.Text>
                  {item.body ? (
                    <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                      {item.body}
                    </Typography.Text>
                  ) : null}
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {formatNotificationTime(item.createdAt)}
                  </Typography.Text>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    >
      <Tooltip title="Thông báo" placement="right">
        <Badge count={unread} overflowCount={UNREAD_BADGE_CAP} size="small" offset={[-4, 4]}>
          <BellOutlined
            role="button"
            aria-label={unread > 0 ? `Thông báo (${unread} chưa đọc)` : "Thông báo"}
            style={{ fontSize: 18, padding: 12, cursor: "pointer" }}
          />
        </Badge>
      </Tooltip>
    </Dropdown>
  );
}
