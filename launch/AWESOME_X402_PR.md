# Ecosystem listings (submit after the repo is public)

## awesome-x402 PR

Repo: search GitHub for the current canonical list (`awesome-x402`) — the x402
Foundation README links it. Add under a "Governance / Tooling" section (create the
section if it doesn't exist; that in itself makes the buyer-side gap visible):

```markdown
- [SpendVeto](https://github.com/<user>/spendveto) — Buyer-side spend governance for
  x402 agents: policy engine (per-call / hourly / delegated budget caps), human-in-the-loop
  approvals that fail closed, runaway-loop auto-freeze + kill switch, and an MCP server
  that gates any paid tool call behind the full pipeline. Simulate mode (zero setup) or
  Base Sepolia via the public facilitator. Apache-2.0.
```

PR description: one paragraph, note that everything listed is covered by a
271-assertion end-to-end suite (`npm run verify`).

## MCP server registries

Same one-liner, MCP-first phrasing:

> **SpendVeto** — spend governance for agents that pay for tools. Exposes a paid x402
> tool catalog to any MCP client; every call runs policy → human approval → payment
> before executing, and blocked calls return as tool errors naming the gate. Includes
> budgets delegated per sub-agent and an automatic runaway-loop kill switch.

Targets (verify current submission process at launch time):
- `modelcontextprotocol/servers` community list (PR)
- mcp.so / PulseMCP / Smithery (web submission forms)
- x402 Foundation Discord `#showcase` — post the 90-second demo video

## One-line positioning (keep identical everywhere)

> Payment rails move an agent's money. SpendVeto decides whether the agent should be
> allowed to move it.
