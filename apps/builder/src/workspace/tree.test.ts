import { describe, expect, it } from "vitest";
import { buildTree, dropFolderId, folderKey, formKey, parseKey } from "./tree";
import type { FolderRecord, FormSummary } from "./types";

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

describe("parseKey / key encoders", () => {
  it("round-trips folder and form keys", () => {
    expect(parseKey(folderKey("a"))).toEqual({ kind: "folder", id: "a" });
    expect(parseKey(formKey("b"))).toEqual({ kind: "form", id: "b" });
  });

  it("keeps ids containing a colon intact", () => {
    expect(parseKey(formKey("ns:id"))).toEqual({ kind: "form", id: "ns:id" });
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
});
