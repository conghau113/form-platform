import "antd/dist/reset.css";
import "@xyflow/react/dist/style.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { createQueryClient } from "./query/index.js";
import { SubmissionsRoute } from "./submissions/index.js";
import { WorkflowRoute, WorkflowRunRoute } from "./workflow/index.js";
import { EditorRoute } from "./workspace/EditorRoute.js";
import { EmptyEditorState } from "./workspace/EmptyEditorState.js";
import { ProjectsPage } from "./workspace/ProjectsPage.js";
import { ProjectWorkspace } from "./workspace/ProjectWorkspace.js";

// Data router (createBrowserRouter) — required for `useBlocker` (the editor's unsaved-changes
// guard). The project workspace is a layout route: a persistent Explorer rail + a nested editor.
const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/projects" replace /> },
  { path: "/projects", element: <ProjectsPage /> },
  {
    path: "/projects/:projectId",
    element: <ProjectWorkspace />,
    children: [
      { index: true, element: <EmptyEditorState /> },
      { path: "forms/:formId", element: <EditorRoute /> },
      { path: "forms/:formId/submissions", element: <SubmissionsRoute /> },
      { path: "forms/:formId/submissions/:submissionId", element: <SubmissionsRoute /> },
      { path: "workflows/:workflowId/edit", element: <WorkflowRoute /> },
      { path: "workflows/:workflowId/run", element: <WorkflowRunRoute /> },
      { path: "workflows/:workflowId/run/:instanceId", element: <WorkflowRunRoute /> },
    ],
  },
  { path: "*", element: <Navigate to="/projects" replace /> },
]);

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

const queryClient = createQueryClient();

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </StrictMode>,
);
