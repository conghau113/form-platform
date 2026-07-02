import "antd/dist/reset.css";
import "@xyflow/react/dist/style.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AuthProvider, LoginPage, RequireAuth } from "./auth/index.js";
import { createQueryClient } from "./query/index.js";
import { AppShell, SettingsPage } from "./shell/index.js";
import { SubmissionsRoute } from "./submissions/index.js";
import { VersionsRoute } from "./versions/index.js";
import { WorkflowRoute, WorkflowRunRoute } from "./workflow/index.js";
import { EditorRoute } from "./workspace/EditorRoute.js";
import { EmptyEditorState } from "./workspace/EmptyEditorState.js";
import { ProjectsPage } from "./workspace/ProjectsPage.js";
import { ProjectWorkspace } from "./workspace/ProjectWorkspace.js";

// Data router (createBrowserRouter) — required for `useBlocker` (the editor's unsaved-changes
// guard). `/login` is public; everything else sits behind `RequireAuth` (production-hardening 2B),
// which bounces anonymous visitors to `/login`. Behind it sits the `AppShell` layout route (§6.7):
// a persistent nav rail + the routed section. The project workspace is itself a layout route: a
// persistent Explorer rail + a nested editor.
// Serve under an env-driven base path (Phase 0). Vite injects the resolved `base` as `BASE_URL`
// (default "/"); react-router wants the basename without a trailing slash.
const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

const router = createBrowserRouter(
  [
    { path: "/login", element: <LoginPage /> },
    {
      element: <RequireAuth />,
      children: [
        {
          element: <AppShell />,
          children: [
            { path: "/", element: <Navigate to="/projects" replace /> },
            { path: "/projects", element: <ProjectsPage /> },
            { path: "/settings", element: <SettingsPage /> },
            {
              path: "/projects/:projectId",
              element: <ProjectWorkspace />,
              children: [
                { index: true, element: <EmptyEditorState /> },
                { path: "forms/:formId", element: <EditorRoute /> },
                { path: "forms/:formId/submissions", element: <SubmissionsRoute /> },
                { path: "forms/:formId/submissions/:submissionId", element: <SubmissionsRoute /> },
                { path: "forms/:formId/versions", element: <VersionsRoute /> },
                { path: "workflows/:workflowId/edit", element: <WorkflowRoute /> },
                { path: "workflows/:workflowId/run", element: <WorkflowRunRoute /> },
                { path: "workflows/:workflowId/run/:instanceId", element: <WorkflowRunRoute /> },
              ],
            },
            { path: "*", element: <Navigate to="/projects" replace /> },
          ],
        },
      ],
    },
  ],
  { basename },
);

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

const queryClient = createQueryClient();

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </StrictMode>,
);
