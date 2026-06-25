import { describe, expect, it } from "vitest";
import { usedForms } from "./used-forms";

const n = (id: string, status: string, formId?: string) => ({ id, status, formId });
const opts = [
  { id: "f1", title: "Leave request" },
  { id: "f2", title: "Manager review" },
];

describe("usedForms", () => {
  it("returns no forms and no unbound states for an empty graph", () => {
    const view = usedForms([], opts);
    expect(view.forms).toEqual([]);
    expect(view.unbound).toEqual([]);
  });

  it("groups distinct bound forms in first-appearance order", () => {
    const view = usedForms([n("a", "Draft", "f1"), n("b", "Review", "f2")], opts);
    expect(view.forms.map((f) => f.formId)).toEqual(["f1", "f2"]);
    expect(view.forms[0].title).toBe("Leave request");
    expect(view.forms[0].missing).toBe(false);
  });

  it("collects every state that binds the same form", () => {
    const view = usedForms([n("a", "Draft", "f1"), n("b", "Resubmit", "f1")], opts);
    expect(view.forms).toHaveLength(1);
    expect(view.forms[0].states).toEqual([
      { id: "a", status: "Draft" },
      { id: "b", status: "Resubmit" },
    ]);
  });

  it("flags a bound form that no longer exists in the project as missing, titled by id", () => {
    const view = usedForms([n("a", "Draft", "ghost")], opts);
    expect(view.forms[0]).toMatchObject({ formId: "ghost", title: "ghost", missing: true });
  });

  it("lists states with no bound form under unbound", () => {
    const view = usedForms([n("a", "Draft", "f1"), n("b", "Done")], opts);
    expect(view.forms.map((f) => f.formId)).toEqual(["f1"]);
    expect(view.unbound).toEqual([{ id: "b", status: "Done" }]);
  });
});
