# Agent charters

A **charter** is the L1 (normative) mandate of a subagent: what it may do, the evidence it
must produce, its capability tier, and the **isolation argument** that justifies it being an
agent at all (rather than a skill). Charters are governance; the actual `.claude/agents/<name>.md`
files are **L3 bindings** that regenerate FROM a charter and must trace to it (the charter-vs-binding
split; constitution §2, blueprint Phase 4). Change the mandate here; the binding follows in E5 (T5.2.1).

**Roster is fixed and minimal** (ADR-0011 Option C, Accepted): an agent exists **only where isolation
itself is the value**; every other lifecycle capability is a skill that shares the main session's
already-paid context. A new agent requires a **new** isolation argument (ADR-0011 `new_agent_rule`).
Model/tier assignments come from [`knowledge/registries/model-registry.yaml`](../../knowledge/registries/model-registry.yaml).

| Charter | Tier | Isolation argument | Binding |
|---|---|---|---|
| [explorer](explorer.md) | recall (haiku) | disposable broad discovery — spend tokens in a throwaway context | `.claude/agents/explorer.md` |
| [reviewer](reviewer.md) | judgment (opus) | objective review — a context that did not watch the implementation | `.claude/agents/reviewer.md` |
