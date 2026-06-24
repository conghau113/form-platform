import { describe, expect, it } from "vitest";
import {
  allFolderKeys,
  buildTree,
  dropFolderId,
  folderKey,
  formKey,
  insertDraft,
  parseKey,
  workflowKey,
} from "./tree";
import type { FolderRecord, FormSummary, WorkflowSummary } from "./types";

const folder = (id: string, parentId: string | null, name: string, order = 0): FolderRecord => ({
  id,
  projectId: "p1",
  parentId,
  name,
  order,
  createdAt: "2026-01-01T00:00:00.000Z",
});

const form = (id: string, folderId: string | null, title: string): FormSummary => ({
  id,
  projectId: "p1",
  folderId,
  title,
  status: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const workflow = (id: string, folderId: string | null, title: string): WorkflowSummary => ({
  id,
  projectId: "p1",
  folderId,
  title,
  status: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("parseKey / key encoders", () => {
  it("round-trips folder and form keys", () => {
    expect(parseKey(folderKey("a"))).toEqual({ kind: "folder", id: "a" });
    expect(parseKey(formKey("b"))).toEqual({ kind: "form", id: "b" });
  });

  it("keeps ids containing a colon intact", () => {
    expect(parseKey(formKey("ns:id"))).toEqual({ kind: "form", id: "ns:id" });
  });

  it("round-trips workflow keys", () => {
    expect(parseKey(workflowKey("w1"))).toEqual({ kind: "workflow", id: "w1" });
  });
});

describe("buildTree", () => {
  it("nests folders by parentId and attaches forms under their folder", () => {
    const folders = [folder("root", null, "Root"), folder("child", "root", "Child")];
    const forms = [form("f1", "child", "Leaf form"), form("f2", null, "Top form")];
    const tree = buildTree(folders, forms);

    // Top level: the root folder, then the root-level form (folders before forms).
    expect(tree.map((n) => n.key)).toEqual([folderKey("root"), formKey("f2")]);

    const root = tree[0];
    expect(root.isLeaf).toBe(false);
    expect(root.children?.map((n) => n.key)).toEqual([folderKey("child")]);

    const child = root.children?.[0];
    expect(child?.children?.map((n) => n.key)).toEqual([formKey("f1")]);
    expect(child?.children?.[0].isLeaf).toBe(true);
  });

  it("sorts sibling folders by order then name", () => {
    const folders = [
      folder("b", null, "Beta", 1),
      folder("a", null, "Alpha", 1),
      folder("z", null, "Zeta", 0),
    ];
    const tree = buildTree(folders, []);
    expect(tree.map((n) => n.title)).toEqual(["Zeta", "Alpha", "Beta"]);
  });

  it("attaches workflows under their folder, listed after forms at each level", () => {
    const folders = [folder("root", null, "Root")];
    const forms = [form("f1", "root", "A form"), form("f2", null, "Top form")];
    const workflows = [workflow("w1", "root", "A workflow"), workflow("w2", null, "Top workflow")];
    const tree = buildTree(folders, forms, workflows);

    // Root level order: folder, then form, then workflow.
    expect(tree.map((n) => n.key)).toEqual([folderKey("root"), formKey("f2"), workflowKey("w2")]);
    // Inside the folder: form before workflow.
    expect(tree[0].children?.map((n) => n.key)).toEqual([formKey("f1"), workflowKey("w1")]);
    expect(tree[0].children?.[1].kind).toBe("workflow");
  });
});

describe("allFolderKeys", () => {
  it("collects folder keys recursively, skipping forms and workflows", () => {
    const folders = [folder("root", null, "Root"), folder("child", "root", "Child")];
    const forms = [form("f1", "child", "Leaf form")];
    const workflows = [workflow("w1", "root", "WF")];
    const keys = allFolderKeys(buildTree(folders, forms, workflows));
    expect(keys).toEqual([folderKey("root"), folderKey("child")]);
  });
});

describe("insertDraft", () => {
  const draft = { key: "__draft__", kind: "form" as const, id: "", title: "", isLeaf: true };

  it("appends the draft at root when parentId is null", () => {
    const tree = buildTree([folder("root", null, "Root")], []);
    const next = insertDraft(tree, null, draft);
    expect(next.map((n) => n.key)).toEqual([folderKey("root"), "__draft__"]);
  });

  it("appends the draft inside the matching folder and leaves siblings untouched", () => {
    const folders = [folder("a", null, "A"), folder("b", null, "B")];
    const tree = buildTree(folders, [form("f1", "a", "Form")]);
    const next = insertDraft(tree, "a", draft);
    const a = next.find((n) => n.id === "a");
    expect(a?.children?.map((n) => n.key)).toEqual([formKey("f1"), "__draft__"]);
    expect(next.find((n) => n.id === "b")?.children).toEqual([]);
  });

  it("does not mutate the input tree", () => {
    const tree = buildTree([folder("root", null, "Root")], []);
    insertDraft(tree, null, draft);
    expect(tree.map((n) => n.key)).toEqual([folderKey("root")]);
  });
});

describe("dropFolderId", () => {
  const folders = [folder("root", null, "Root"), folder("child", "root", "Child")];
  const forms = [form("f1", "child", "Leaf"), form("f2", null, "Top")];

  it("targets the folder itself when dropped onto a folder body", () => {
    expect(dropFolderId(folderKey("root"), true, folders, forms)).toBe("root");
  });

  it("targets the parent folder when dropped into a gap beside a folder", () => {
    expect(dropFolderId(folderKey("child"), false, folders, forms)).toBe("root");
  });

  it("targets a form's parent folder when dropped onto/next to a form", () => {
    expect(dropFolderId(formKey("f1"), true, folders, forms)).toBe("child");
    expect(dropFolderId(formKey("f2"), false, folders, forms)).toBeNull();
  });

  it("targets a workflow's parent folder when dropped onto/next to a workflow", () => {
    const workflows = [workflow("w1", "child", "WF"), workflow("w2", null, "Top WF")];
    expect(dropFolderId(workflowKey("w1"), true, folders, forms, workflows)).toBe("child");
    expect(dropFolderId(workflowKey("w2"), false, folders, forms, workflows)).toBeNull();
  });
});
