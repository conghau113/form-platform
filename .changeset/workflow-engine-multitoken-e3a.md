---
"@org/workflow-schema": minor
"@org/workflow-core": minor
---

E3a — the workflow engine executes `gateway` nodes, so a case can genuinely stand
in several places at once. `gateway` and the marking (`tokens`/`scopes`) landed as
CONTRACT in E2 with nothing reading them; this is the phase that makes them run.

`advance` now works from the marking (`readMarking`) instead of `instance.current`:

- A token landing on `gateway: "fork"` is consumed and one token per outgoing edge
  is created, all tagged with a fresh scope recording that fork RUN. A fork's
  outgoing edges are structural — every one is taken — so their `guard`/`role` are
  not consulted, and a fork carrying one is refused rather than executed with a
  gate that stops nobody.
- A token landing on `gateway: "join"` parks until every sibling of the SAME fork
  run has arrived, then one token continues carrying the parent scope. Counting per
  (join, scope) rather than per join is what lets a loop traverse a fork twice, and
  nested forks settle independently, without the rounds counting toward each other.
- `AdvanceContext.token` picks WHICH token moves. Omitted, the engine moves the only
  token that can fire the action and reports `ambiguous-token` rather than guessing
  when several could — the textbook fork is two people firing the same action in
  parallel. A token id that is not in the live marking is refused (`unknown-token`):
  it is matched against the marking, never trusted as a position.
- New failure reasons: `unknown-token`, `ambiguous-token`, `invalid-gateway`,
  `gateway-overflow`. All are `ok: false` results, never thrown, so a definition
  edited under a running case yields a 422 with a reason instead of a 500.
- `historyEntrySchema` gains `token?` — which BRANCH an entry belongs to, including
  the steps the engine took through a gateway on its own.
- `nodeProgress` reports every node a token is parked on, not just the one
  `current` names.

Additive: `workflowVersion` is NOT bumped and old definitions/instances keep
parsing. A case with one token — every case on a graph without gateways, and every
case stored before markings existed — behaves exactly as before, reason for reason.

⚠️ ONE-WAY DOOR. Every case now carries a marking — written by `createInstance` when
it is started and rewritten by every advance, alongside `current`. A build that PREDATES this change
writes `current` while preserving the stored `tokens` untouched, and every reader
here believes `tokens` over `current` — so an older writer touching the same
database makes cases report the wrong node, silently, on graphs with no gateway at
all, and the Run view's progress card paints the wrong row. Migrate and deploy
together, and rebuild any long-running API container sharing the database before
this ships.

NOT in this change: optimistic concurrency on the instance write (two people
advancing two branches at once can still overwrite each other — E3b), `token` over
HTTP (E3c), and the list/filter semantics of "where is this case" (E5).

⚠️ Because `token` has no route through HTTP until E3c, a forked case whose branches
offer the SAME action cannot be advanced through the API at all in the meantime: the
engine correctly refuses to guess and returns `ambiguous-token` every time. That is
the textbook parallel case, so do not put one in front of users before E3c lands.
