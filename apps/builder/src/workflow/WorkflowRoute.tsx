import { Alert, Button, Modal, Spin } from "antd";
import { useCallback, useMemo, useRef } from "react";
import { useBlocker, useOutletContext, useParams } from "react-router-dom";
import type { WorkspaceOutletContext } from "../workspace/ProjectWorkspace";
import { useProjectTree } from "../workspace/useWorkspace";
import { useSaveWorkflow, useWorkflow } from "./useWorkflows";
import { WorkflowEditor } from "./WorkflowEditor";

/**
 * Workflow editor leaf of the project workspace (`/projects/:projectId/workflows/:workflowId/edit`).
 * Mirrors {@link EditorRoute}: loads the contract by id, embeds {@link WorkflowEditor}, and owns the
 * unsaved-changes guard — a single `useBlocker` intercepts every in-app navigation away while dirty,
 * offering Save / Discard / Cancel. The editor reports dirtiness and a stable save fn up through refs.
 * Form binding is a Select over the project's real forms (from the shared `useProjectTree` cache);
 * creating/editing a bound form happens in-place in the editor's Drawer (WF2b) — no navigation away.
 */
export function WorkflowRoute() {
  const { workflowId, projectId } = useParams<{ workflowId: string; projectId: string }>();
  const { onWorkflowSaved } = useOutletContext<WorkspaceOutletContext>();

  const { workflow, loading, error } = useWorkflow(workflowId);
  const { tree, invalidate: refreshForms } = useProjectTree(projectId);
  const saveWorkflow = useSaveWorkflow(projectId);

  const formOptions = useMemo(
    () => (tree?.forms ?? []).map((f) => ({ id: f.id, title: f.title })),
    [tree],
  );

  const dirtyRef = useRef(false);
  const saveRef = useRef<() => Promise<boolean>>(async () => true);

  const onDirtyChange = useCallback((d: boolean) => {
    dirtyRef.current = d;
  }, []);
  const provideSave = useCallback((save: () => Promise<boolean>) => {
    saveRef.current = save;
  }, []);

  const onSave = useCallback(
    async (def: Parameters<typeof saveWorkflow>[0]) => {
      await saveWorkflow(def);
      onWorkflowSaved();
    },
    [saveWorkflow, onWorkflowSaved],
  );

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirtyRef.current && currentLocation.pathname !== nextLocation.pathname,
  );

  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
        <Spin />
      </div>
    );
  }
  if (error || !workflow) {
    return (
      <div style={{ padding: 24 }}>
        <Alert type="error" showIcon message="Không tải được workflow" description={error ?? ""} />
      </div>
    );
  }

  return (
    <>
      {/* key={workflowId}: remount on workflow switch so the canvas reseeds from the new contract. */}
      <WorkflowEditor
        key={workflowId}
        definition={workflow}
        formOptions={formOptions}
        projectId={projectId}
        onSave={onSave}
        onFormsChanged={refreshForms}
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
        Workflow này đang có thay đổi chưa lưu. Bạn muốn làm gì trước khi chuyển?
      </Modal>
    </>
  );
}
