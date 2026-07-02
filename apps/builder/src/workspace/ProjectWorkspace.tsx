import { useState } from "react";
import { Outlet, useMatch, useParams } from "react-router-dom";
import { useWorkflows } from "../workflow/useWorkflows";
import { ExplorerRail } from "./ExplorerRail";
import { useProjects, useProjectTree } from "./useWorkspace";

/** Context the project shell provides to its editor leaves (`EditorRoute`, `WorkflowRoute`). */
export interface WorkspaceOutletContext {
  projectId: string;
  /** Refetch the tree (form titles refresh after a save). */
  onFormSaved: () => void;
  /** Refetch the workflow list (workflow titles refresh after a save). */
  onWorkflowSaved: () => void;
  explorerCollapsed: boolean;
  setExplorerCollapsed: (collapsed: boolean) => void;
}

/**
 * Project workspace shell (master–detail). Left: the persistent {@link ExplorerRail}; right: the
 * routed `<Outlet/>` (empty state or the embedded editor). Owns the tree data so a save in the
 * editor can refresh form titles via `onFormSaved`. The active form (highlighted in the rail) is
 * read from the child route match.
 */
export function ProjectWorkspace() {
  const { projectId } = useParams<{ projectId: string }>();
  const { projects } = useProjects();
  const { tree, loading, error, invalidate } = useProjectTree(projectId);
  const { workflows, invalidate: invalidateWorkflows } = useWorkflows(projectId);
  const activeFormId = useMatch("/projects/:projectId/forms/:formId")?.params.formId;
  const activeWorkflowId = useMatch("/projects/:projectId/workflows/:workflowId/edit")?.params
    .workflowId;

  const [explorerCollapsed, setExplorerCollapsed] = useState(false);

  if (!projectId) return null;

  // A single invalidate refreshes both the folder/form tree and the workflow list — cheap and keeps
  // the rail's CRUD callers (which call one `invalidate`) honest after any kind of mutation.
  const refresh = async () => {
    await Promise.all([invalidate(), invalidateWorkflows()]);
  };

  const context: WorkspaceOutletContext = {
    projectId,
    onFormSaved: invalidate,
    onWorkflowSaved: invalidateWorkflows,
    explorerCollapsed,
    setExplorerCollapsed,
  };

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      <ExplorerRail
        projectId={projectId}
        projects={projects}
        tree={tree}
        workflows={workflows}
        loading={loading}
        error={error}
        invalidate={refresh}
        activeFormId={activeFormId}
        activeWorkflowId={activeWorkflowId}
        collapsed={explorerCollapsed}
      />
      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <Outlet context={context} />
      </div>
    </div>
  );
}
