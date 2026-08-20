import { advance, createInstance, LEGACY_TOKEN_ID } from "@org/workflow-core";
import type { WorkflowDefinition, WorkflowInstance } from "@org/workflow-schema";
import { describe, expect, it } from "vitest";
import { caseBranches, selectBranch } from "./run-branches";

/** draft --submit--> F(fork) ⇉ tech, fin --approve--> J(join) --merge--> done */
const parallelDef: WorkflowDefinition = {
  workflowVersion: 1,
  id: "wf",
  title: "Parallel approval",
  start: "draft",
  nodes: [
    { id: "draft", status: "Nháp" },
    { id: "F", status: "Tách", gateway: "fork" },
    { id: "tech", status: "Kỹ thuật" },
    { id: "fin", status: "Tài chính" },
    { id: "J", status: "Gộp", gateway: "join" },
    { id: "done", status: "Hoàn tất", kind: "end" },
  ],
  transitions: [
    { id: "t1", from: "draft", to: "F", action: "submit" },
    { id: "ft", from: "F", to: "tech", action: "enterTech" },
    { id: "ff", from: "F", to: "fin", action: "enterFin" },
    { id: "at", from: "tech", to: "J", action: "approve" },
    { id: "af", from: "fin", to: "J", action: "approve" },
    { id: "tj", from: "J", to: "done", action: "merge" },
  ],
};

/** Same graph, except BOTH fork edges land on `tech` — the case really does stand twice in one
 *  place. A fork is allowed to do this, and the engine does not dedupe the two tokens. */
const sameNodeDef: WorkflowDefinition = {
  ...parallelDef,
  id: "wf-same",
  transitions: parallelDef.transitions.map((t) => (t.id === "ff" ? { ...t, to: "tech" } : t)),
};

/** Run the case through the fork with the REAL engine, so the markings under test are ones the
 *  engine can actually produce — a hand-written `tokens` array would let these pass on fiction. */
function forked(): WorkflowInstance {
  const started = createInstance(parallelDef, { id: "c1" });
  const result = advance(parallelDef, started, "submit");
  if (!result.ok) throw new Error(`fixture did not fork: ${result.reason}`);
  return result.instance;
}

const at = (inst: WorkflowInstance, node: string): string => {
  const token = inst.tokens?.find((t) => t.at === node);
  if (!token) throw new Error(`no token at ${node}: ${JSON.stringify(inst.tokens)}`);
  return token.id;
};

describe("caseBranches", () => {
  it("reports one branch per token, in marking order", () => {
    const instance = forked();
    const branches = caseBranches(parallelDef, instance);

    expect(branches.map((b) => b.at)).toEqual(["tech", "fin"]);
    expect(branches.map((b) => b.nodeIndex)).toEqual([2, 3]);
    expect(branches.every((b) => b.tokenId.length > 0)).toBe(true);
    // `branches[0]` is what `current` names — the whole rest of the view is anchored to it.
    expect(branches[0].at).toBe(instance.current);
  });

  it("reports exactly one branch for a case written before markings existed", () => {
    // No `tokens` at all: every case running today. It must look like an ordinary single branch,
    // and the id must be one the engine will still recognise on the way back in.
    const legacy: WorkflowInstance = {
      id: "old",
      definitionId: "wf",
      definitionVersion: 1,
      current: "tech",
      data: {},
      history: [],
    };

    const branches = caseBranches(parallelDef, legacy);

    expect(branches).toHaveLength(1);
    expect(branches[0].at).toBe("tech");
    expect(branches[0].ambiguousLabel).toBe(false);
    // The synthesized id, spelled out: it is what the view would send back as `token`, and the
    // engine only recognises it because `readMarking` synthesizes the same one every time.
    expect(branches[0].tokenId).toBe(LEGACY_TOKEN_ID);
  });

  it("reports NO branches for a case whose marking was emptied", () => {
    // Out of contract, and only producible by a writer that dropped a token. Reported as the damage
    // it is rather than papered over with `current` — the caller renders an error, not a case that
    // looks healthy.
    const damaged = { ...forked(), tokens: [] } as WorkflowInstance;

    expect(caseBranches(parallelDef, damaged)).toEqual([]);
    expect(selectBranch(caseBranches(parallelDef, damaged), null)).toBeUndefined();
  });

  it("marks a branch parked on a join as a gateway", () => {
    // One branch approved, its sibling has not: the first token is now standing ON the join. The
    // Run view must not offer it the join's outgoing action — see `Branch.gateway`.
    // One instance, bound once: `forked()` mints fresh token ids on every call, so naming a token
    // from a second call would be naming one this case never had.
    const start = forked();
    const one = advance(parallelDef, start, "approve", { token: at(start, "tech") });
    if (!one.ok) throw new Error(one.reason);

    const branches = caseBranches(parallelDef, one.instance);

    expect(branches.map((b) => b.at).sort()).toEqual(["J", "fin"]);
    // The KIND matters, not just "is a gateway": a join means somebody is being waited for, a fork
    // means the definition changed underneath. The view says opposite things about them.
    expect(branches.find((b) => b.at === "J")?.gateway).toBe("join");
    expect(branches.find((b) => b.at === "fin")?.gateway).toBeUndefined();
  });

  it("reports a node the definition no longer has, without inventing anything for it", () => {
    // A definition can be edited under a running case, so this is reachable. `-1` lets the caller
    // fall back to the raw node id; a fabricated label would state something about a node nobody
    // can look up.
    const trimmed: WorkflowDefinition = {
      ...parallelDef,
      nodes: parallelDef.nodes.filter((n) => n.id !== "fin"),
    };

    const gone = caseBranches(trimmed, forked()).find((b) => b.at === "fin");

    expect(gone?.nodeIndex).toBe(-1);
    expect(gone?.gateway).toBeUndefined();
  });

  it("flags branches that share a node, and only those", () => {
    // Two tokens at ONE node, produced the way it really happens: a fork whose edges share a `to`.
    // Legal, and deliberately not deduped by the engine — so a label naming only the node prints
    // the same words twice with no way to tell which branch is which.
    const started = createInstance(sameNodeDef, { id: "c2" });
    const result = advance(sameNodeDef, started, "submit");
    if (!result.ok) throw new Error(result.reason);
    expect(result.instance.tokens?.map((t) => t.at)).toEqual(["tech", "tech"]);

    const branches = caseBranches(sameNodeDef, result.instance);

    expect(branches.map((b) => b.ambiguousLabel)).toEqual([true, true]);
    // Distinct ids are what makes the two tellable apart at all.
    expect(branches[0].tokenId).not.toBe(branches[1].tokenId);
  });
});

describe("selectBranch", () => {
  it("returns the branch whose token was selected", () => {
    const branches = caseBranches(parallelDef, forked());

    expect(selectBranch(branches, branches[1].tokenId)?.at).toBe("fin");
  });

  it("falls back to the head of the marking when nothing is selected yet", () => {
    const branches = caseBranches(parallelDef, forked());

    expect(selectBranch(branches, null)?.at).toBe("tech");
  });

  it("falls back when a JOIN has consumed the selected token", () => {
    // The scenario that makes the fallback necessary, built the only way it actually happens: an
    // ordinary move CARRIES a token's id with it, so a stale selection survives one. A join does
    // not — it consumes the branches it merges and emits a new id.
    const start = forked();
    const first = advance(parallelDef, start, "approve", { token: at(start, "tech") });
    if (!first.ok) throw new Error(first.reason);
    const finToken = at(first.instance, "fin");
    const merged = advance(parallelDef, first.instance, "approve", { token: finToken });
    if (!merged.ok) throw new Error(merged.reason);

    const branches = caseBranches(parallelDef, merged.instance);

    // Precondition: the id we were holding is really gone, or this test proves nothing.
    expect(branches.some((b) => b.tokenId === finToken)).toBe(false);
    expect(selectBranch(branches, finToken)).toBe(branches[0]);
  });
});
