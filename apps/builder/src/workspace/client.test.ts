import type { FormSchema } from "@org/form-schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createProject,
  deleteFolder,
  grantMember,
  listForms,
  listMembers,
  listProjects,
  moveForm,
  revokeMember,
  saveForm,
  updateMemberRole,
} from "./client";
import { API_BASE } from "./config";

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fn = vi
    .fn()
    .mockResolvedValue({ ok: true, statusText: "OK", json: async () => ({}), ...response });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Auth now rides the same-origin HttpOnly cookie (2B), so workspace requests carry no extra headers.
const ownerHeader: Record<string, string> = {};

describe("workspace client", () => {
  it("listProjects GETs /projects with the owner header", async () => {
    const fetchFn = mockFetch({ json: async () => [] });
    await listProjects();
    expect(fetchFn).toHaveBeenCalledWith(`${API_BASE}/projects`, { headers: ownerHeader });
  });

  it("createProject POSTs json with owner + content-type headers", async () => {
    const fetchFn = mockFetch({ json: async () => ({ id: "p1" }) });
    await createProject({ name: "HR" });
    expect(fetchFn).toHaveBeenCalledWith(`${API_BASE}/projects`, {
      method: "POST",
      headers: { "content-type": "application/json", ...ownerHeader },
      body: JSON.stringify({ name: "HR" }),
    });
  });

  it("listForms encodes projectId and folderId query params", async () => {
    const fetchFn = mockFetch({ json: async () => [] });
    await listForms("p1", "fld");
    expect(fetchFn).toHaveBeenCalledWith(`${API_BASE}/forms?projectId=p1&folderId=fld`, {
      headers: ownerHeader,
    });
  });

  it("saveForm appends placement query params when provided", async () => {
    const fetchFn = mockFetch({ json: async () => ({}) });
    const body = { formVersion: 3, id: "f1", title: "T", fields: [] } as unknown as FormSchema;
    await saveForm(body, { projectId: "p1", folderId: "fld" });
    expect(fetchFn).toHaveBeenCalledWith(`${API_BASE}/forms?projectId=p1&folderId=fld`, {
      method: "POST",
      headers: { "content-type": "application/json", ...ownerHeader },
      body: JSON.stringify(body),
    });
  });

  it("moveForm PATCHes /forms/:id/move with the target folderId", async () => {
    const fetchFn = mockFetch({ json: async () => ({}) });
    await moveForm("f1", null);
    expect(fetchFn).toHaveBeenCalledWith(`${API_BASE}/forms/f1/move`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...ownerHeader },
      body: JSON.stringify({ folderId: null }),
    });
  });

  it("deleteFolder adds ?cascade=true only when requested", async () => {
    const fetchFn = mockFetch({});
    await deleteFolder("fld", true);
    expect(fetchFn).toHaveBeenCalledWith(`${API_BASE}/folders/fld?cascade=true`, {
      method: "DELETE",
      headers: ownerHeader,
    });
  });

  it("throws with the server message on a non-OK response", async () => {
    mockFetch({ ok: false, statusText: "Bad", json: async () => ({ message: "boom" }) });
    await expect(createProject({ name: "x" })).rejects.toThrow("boom");
  });

  it("listMembers GETs /projects/:id/members with the owner header", async () => {
    const fetchFn = mockFetch({ json: async () => ({ ownerId: "u1", members: [] }) });
    await listMembers("p1");
    expect(fetchFn).toHaveBeenCalledWith(`${API_BASE}/projects/p1/members`, {
      headers: ownerHeader,
    });
  });

  it("grantMember POSTs the userId + role", async () => {
    const fetchFn = mockFetch({ json: async () => ({}) });
    await grantMember("p1", "bob", "viewer");
    expect(fetchFn).toHaveBeenCalledWith(`${API_BASE}/projects/p1/members`, {
      method: "POST",
      headers: { "content-type": "application/json", ...ownerHeader },
      body: JSON.stringify({ userId: "bob", role: "viewer" }),
    });
  });

  it("updateMemberRole PATCHes /members/:userId with the new role", async () => {
    const fetchFn = mockFetch({ json: async () => ({}) });
    await updateMemberRole("p1", "bob", "editor");
    expect(fetchFn).toHaveBeenCalledWith(`${API_BASE}/projects/p1/members/bob`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...ownerHeader },
      body: JSON.stringify({ role: "editor" }),
    });
  });

  it("revokeMember DELETEs /members/:userId, encoding the user id", async () => {
    const fetchFn = mockFetch({});
    await revokeMember("p1", "a/b");
    expect(fetchFn).toHaveBeenCalledWith(`${API_BASE}/projects/p1/members/a%2Fb`, {
      method: "DELETE",
      headers: ownerHeader,
    });
  });
});
