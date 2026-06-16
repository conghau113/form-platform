import "antd/dist/reset.css";
import "@xyflow/react/dist/style.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
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
    ],
  },
  { path: "*", element: <Navigate to="/projects" replace /> },
]);

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
