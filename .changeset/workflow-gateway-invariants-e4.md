---
"@org/workflow-schema": minor
"@org/workflow-core": minor
---

Workflow gateways: static rules in `validateGraph`, and a gateway can no longer be fired by hand

`validateGraph` gains five codes, every one of them keyed off `node.gateway`. A definition that uses
no gateway therefore gets exactly the answer it got before — which matters, because these errors gate
saving in the editor, starting a case (422) and the AI repair loop all at once:

- `start-is-fork` — `start` names a fork. The engine copes with this (it settles before choosing a
  token, so the fork runs on the first action), but the product does not: the token id the case was
  stored with has already been consumed by that settle, so a client passing `token` gets
  `unknown-token`, and the Run view offers no action for a branch parked on a gateway. A start
  **join** is not the same defect and is not flagged: a root-scoped token has no siblings to wait
  for, so it simply passes through.
- `fork-single-outgoing` — a fork with fewer than two ways out.
- `join-not-one-outgoing` — a join without exactly one way out. Note this makes a **terminal join**
  invalid: put an `end` node after the join rather than ending on it.
- `fork-edge-gated` / `join-edge-gated` — an edge leaving a gateway carries a `guard` or `role`. The
  engine follows those edges itself (every edge out of a fork; a join's single edge out once its last
  sibling arrives) and never consults either, so such a gate stops nobody while reading exactly like
  one that works. `ref` is the gateway; the edge is named in the message.

All but `start-is-fork` are the static twins of `invalid-gateway` refusals in the engine, and a
table-driven test now pins each pair so the two rule sets cannot drift apart. There is deliberately
**no** static rule against a fork cycle: the engine refuses one at run time, but statically it is an
ordinary loop, and loops are supported.

`join-edge-gated` also closes a hole this release would otherwise have opened. A `guard`/`role` on a
join's exit edge was only ever evaluated on one path — a person firing the join's transition by hand
— and that path is exactly what the change below removes. Without the new rule the restriction would
have become inert in every code path while still looking enforced.

**Behaviour change — `advance`.** A token standing on a gateway is no longer allowed to fire a
transition. Previously a branch waiting at a join could be walked straight through it by hand: the
merge never happened, the fork run stayed in `scopes`, and whichever sibling arrived next waited on a
count that could never be reached again. Both halves of that were silent. The new refusal reason is
`waiting-on-join`, ranked above `unknown-state` (a branch waiting at a join is a live position
someone is working in; `unknown-state` is a ghost left by an edit) and qualified by the action, so an
action nobody could fire anywhere still answers `no-transition`.

**Behaviour change — `scope-overflow`.** A case may now carry at most 256 open fork runs. A run is
retired only by the join that closes it, so a graph looping back into a fork without passing its join
minted one scope per lap forever, growing the stored case body with every action a user took. Notes
on the bound: it stops unbounded growth, it does not control body size (256 scopes is tens of KB); it
is checked when a run is created, not on load, so a case already over the line keeps advancing until
it next forks; and a case that does trip it has no recovery path, since editing the graph does not
shrink stored `scopes`. Likewise, after this change a genuinely deadlocked join has no manual escape
— the way out is to fix the definition.

**Who this can break.** A definition using no gateway is unaffected — every new rule is keyed off
`node.gateway`, and all fourteen workflow definitions in the development database still validate
clean. But a stored definition that *does* carry a malformed gateway previously saved fine and
started fine, failing only on the advance that reached it; it now hard-fails in the editor's save
gate and with a 422 on case start. Four of the five are repairable in the editor today — edges and
their `guard`/`role` are ordinary edits; only `start-is-fork` needs a change the editor cannot make,
since there is no gateway authoring UI until E6.

One rule can also freeze an already-running case: a case stored parked at a gated join now refuses
every action on every branch, because `advance` settles before selecting a token. Removing the gate
unfreezes it — the definition is reloaded on each advance. No case in the development database is in
that state (none is parked on a gateway, none carries a live fork run) and all fourteen stored
definitions validate clean, but a deployment with hand-written definitions should check first.

Known cosmetic gap: with `start` on a **join**, the Run view still labels the first branch "waiting
for another branch" until the first advance settles it through. Harmless, and not worth an
engine-level special case.

⚠️ Enforcement only exists where the code runs. A deployment still serving a build from before this
release will keep accepting a hand-fired gateway against the same database.
