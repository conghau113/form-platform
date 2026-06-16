import { Button, Modal } from "antd";
import { useCallback, useRef } from "react";
import { useBlocker, useOutletContext, useParams } from "react-router-dom";
import { App } from "../App";
import type { WorkspaceOutletContext } from "./ProjectWorkspace";

/**
 * Editor leaf of the project workspace (`/projects/:projectId/forms/:formId`). Embeds the existing
 * builder ({@link App}) and owns the **unsaved-changes guard**: a single `useBlocker` intercepts
 * EVERY in-app navigation away (form switch, project switch, Back) while the editor is dirty, and
 * offers Save / Discard / Cancel. The editor reports its dirty state and a stable save fn up through
 * refs (no stale closures). `App` stays standalone-renderable — `useBlocker` lives only here, inside
 * the data router. Hard refresh / tab close is handled by App's own `beforeunload` listener.
 */
export function EditorRoute() {
  const { formId, projectId } = useParams<{ formId: string; projectId: string }>();
  const { onFormSaved } = useOutletContext<WorkspaceOutletContext>();

  const dirtyRef = useRef(false);
  const saveRef = useRef<() => Promise<boolean>>(async () => true);

  const onDirtyChange = useCallback((d: boolean) => {
    dirtyRef.current = d;
  }, []);
  const provideSave = useCallback((save: () => Promise<boolean>) => {
    saveRef.current = save;
  }, []);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirtyRef.current && currentLocation.pathname !== nextLocation.pathname,
  );

  return (
    <>
      {/* No key={formId}: the editor stays mounted across form switches so global data
          (presets, theme gallery) isn't refetched each time. App's `[formId]` effect reloads
          the form (history.reset → fresh undo) when the route param changes. */}
      <App
        formId={formId}
        projectId={projectId}
        onSaved={onFormSaved}
        onDirtyChange={onDirtyChange}
        provideSave={provideSave}
      />
      <Modal
        open={blocker.state === "blocked"}
        title="Thay đổi chưa lưu"
        onCancel={() => blocker.reset?.()}
        footer={[
          <Button key="cancel" onClick={() => blocker.reset?.()}>
            Huỷ
          </Button>,
          <Button key="discard" danger onClick={() => blocker.proceed?.()}>
            Bỏ thay đổi
          </Button>,
          <Button
            key="save"
            type="primary"
            onClick={async () => {
              if (await saveRef.current()) blocker.proceed?.();
            }}
          >
            Lưu rồi chuyển
          </Button>,
        ]}
      >
        Form này đang có thay đổi chưa lưu. Bạn muốn làm gì trước khi chuyển?
      </Modal>
    </>
  );
}
