import { useState } from "react";
import { Outlet, useMatch, useParams } from "react-router-dom";
import { ExplorerRail } from "./ExplorerRail";
import { useProjects, useProjectTree } from "./useWorkspace";

/** Context the project shell provides to its editor leaf (`EditorRoute`). */
export interface WorkspaceOutletContext {
  projectId: string;
  /** Refetch the tree (form titles refresh after a save). */
  onFormSaved: () => void;
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
  const { tree, loading, error, reload } = useProjectTree(projectId);
  const activeFormId = useMatch("/projects/:projectId/forms/:formId")?.params.formId;

  const [explorerCollapsed, setExplorerCollapsed] = useState(false);

  if (!projectId) return null;

  const context: WorkspaceOutletContext = {
    projectId,
    onFormSaved: reload,
    explorerCollapsed,
    setExplorerCollapsed,
  };

  return (
    <div style={{ display: "flex", height: "100vh", minHeight: 0 }}>
      <ExplorerRail
        projectId={projectId}
        projects={projects}
        tree={tree}
        loading={loading}
        error={error}
        reload={reload}
        activeFormId={activeFormId}
        collapsed={explorerCollapsed}
      />
      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <Outlet context={context} />
      </div>
    </div>
  );
}
