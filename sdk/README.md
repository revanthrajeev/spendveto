# spendveto-sdk

Thin, dependency-free client for the [SpendVeto](https://github.com/revanthrajeev/spendveto)
spend-governance proxy. Agents never hold a wallet — they call these methods,
and the proxy runs the full governance pipeline (freeze → policy → delegation
caps → human approval) before signing anything.

```bash
npm install spendveto-sdk
```

```js
import { SpendVeto, SpendVetoDenialError } from "spendveto-sdk";

const tg = new SpendVeto({ agentToken: "tg_..." }); // token from registerAgent()

// Pay for a governed tool — throws if any gate refuses.
try {
  const result = await tg.pay("review");
  console.log(result.settlement.receiptId);
} catch (e) {
  if (e instanceof SpendVetoDenialError) {
    console.log(e.code, "→", e.suggestion); // machine-readable, self-correctable
  }
}

// Preview a spend with zero side effects.
const preview = await tg.dryRun("summarize"); // { decision: "would_pause_for_approval", ... }

// Marketplace tools take per-call input via `query` — the one channel a paid GET-behind-x402
// call has for per-call data. Forwarded as query params onto the tool's own upstream request.
const matched = await tg.pay("basis-match", { query: { opinion: "rates fall this year" } });
console.log(matched.data.result.text);

// Governed LLM/API spend — estimated up front, fails closed if over budget.
const reply = await tg.chat("summarize this doc…");
```

Every refusal is a typed `SpendVetoDenialError` carrying a machine-readable
`code` and a concrete `suggestion`, so an agent adjusts instead of crashing or
retry-looping.

Requires a running SpendVeto proxy (`npm run proxy`) and server (`npm run
server`) — see the [main repo](https://github.com/revanthrajeev/spendveto).

Apache-2.0.
