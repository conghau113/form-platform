import {
  App as AntApp,
  AutoComplete,
  Button,
  List,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import { useState } from "react";
import {
  useAddCaseParticipant,
  useCaseParticipants,
  useRemoveCaseParticipant,
} from "./useCaseParticipants";

const { Text, Paragraph } = Typography;

/** Matches `AddParticipantDto` — stop before the 400 does. */
const ROLE_CODE_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/;

/** Mirrors the server's `RESERVED_ROLE_CODES`: rows the platform owns, which nobody may cast or
 *  remove (`creator` in particular is written once by `start()` and cannot be put back). Duplicated
 *  here only so the button is absent rather than a guaranteed 400 — the server is the boundary. */
const RESERVED_ROLE_CODES = ["owner", "editor", "viewer", "assignee", "creator"];

/**
 * Who is on this case, in what capacity (Phase E3a) — the replacement for the old "Đang đóng vai"
 * picker, which let the operator TELL the server which roles they held.
 *
 * That distinction is the whole point, so the panel states it plainly: "Vai trò của bạn" is
 * read-only, because it is the server's verdict — the roles the engine checks `transition.role`
 * against and that decide which gated fields come back unmasked. The only way to change it is to be
 * cast into a role, which is an explicit, audited act someone with run access performs.
 *
 * `canRun` mirrors the server split (read = `viewer`, change = run access), so a reader sees the
 * cast without controls that would only earn them a 403. Hiding them is UX; the boundary is the API.
 */
export function CaseParticipants({
  instanceId,
  canRun,
  roleOptions,
  nameOf,
  members,
}: {
  instanceId: string;
  canRun: boolean;
  /** Suggested role codes — the roles this workflow gates transitions on. Free text is allowed too:
   *  a form's `viewRoles` can name a role the graph never mentions. */
  roleOptions: string[];
  nameOf: (userId: string | null | undefined) => string | null;
  members: { id: string; email: string; displayName: string | null }[];
}) {
  const { message } = AntApp.useApp();
  const { cast, loading, error } = useCaseParticipants(instanceId);
  const addParticipant = useAddCaseParticipant(instanceId);
  const removeParticipant = useRemoveCaseParticipant(instanceId);
  const [roleCode, setRoleCode] = useState("");
  const [userId, setUserId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const code = roleCode.trim();
  const canSubmit = ROLE_CODE_PATTERN.test(code) && !!userId;

  const add = async () => {
    if (!canSubmit || !userId) return;
    setBusy(true);
    try {
      await addParticipant({ roleCode: code, userId });
      setRoleCode("");
      setUserId(undefined);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (participantId: string) => {
    try {
      await removeParticipant(participantId);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <div>
      <Space size="small" wrap style={{ marginBottom: 12 }}>
        <Text type="secondary">Vai trò của bạn:</Text>
        {loading ? (
          <Spin size="small" />
        ) : cast.myRoles.length === 0 ? (
          <Tag>Không có vai trò nào</Tag>
        ) : (
          cast.myRoles.map((role) => (
            <Tag key={role} color="blue">
              {role}
            </Tag>
          ))
        )}
      </Space>

      <Text strong>Người tham gia</Text>
      {loading ? (
        <div style={{ padding: 16, textAlign: "center" }}>
          <Spin size="small" />
        </div>
      ) : error ? (
        <Paragraph type="danger" style={{ marginTop: 8 }}>
          {error}
        </Paragraph>
      ) : cast.participants.length === 0 ? (
        <Paragraph type="secondary" style={{ marginTop: 8 }}>
          Chưa cử ai vào vai trò nào.
        </Paragraph>
      ) : (
        <List
          size="small"
          dataSource={cast.participants}
          renderItem={(p) => (
            <List.Item
              key={p.id}
              actions={
                canRun && !RESERVED_ROLE_CODES.includes(p.roleCode)
                  ? [
                      <Button key="remove" size="small" danger onClick={() => void remove(p.id)}>
                        Xóa
                      </Button>,
                    ]
                  : undefined
              }
            >
              <Space size="small" wrap>
                <Tag>{p.roleCode}</Tag>
                {/* Names resolve through the workspace member list, which needs `workflow.run`;
                    without it we show nothing rather than a raw user id. */}
                <Text>{nameOf(p.userId) ?? "—"}</Text>
              </Space>
            </List.Item>
          )}
        />
      )}

      {canRun && (
        <Space size={8} wrap style={{ marginTop: 12 }}>
          <AutoComplete
            size="small"
            style={{ width: 180 }}
            aria-label="Mã vai trò"
            placeholder="Mã vai trò (vd: manager)"
            value={roleCode}
            onChange={setRoleCode}
            options={roleOptions.map((r) => ({ value: r }))}
            filterOption={(input, option) =>
              (option?.value ?? "").toLowerCase().includes(input.toLowerCase())
            }
          />
          <Select
            showSearch
            size="small"
            style={{ width: 220 }}
            aria-label="Thành viên"
            placeholder="Chọn thành viên"
            value={userId}
            onChange={setUserId}
            optionFilterProp="label"
            options={members.map((m) => ({ label: m.displayName || m.email, value: m.id }))}
          />
          <Button
            type="primary"
            size="small"
            loading={busy}
            disabled={!canSubmit}
            onClick={() => void add()}
          >
            Cử vào vai
          </Button>
        </Space>
      )}
    </div>
  );
}
