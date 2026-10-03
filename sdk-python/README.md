# spendveto (Python)

Dependency-free Python client for the [SpendVeto](https://github.com/revanthrajeev/spendveto) spend-governance proxy. Same surface as the npm `spendveto-sdk`: agents never hold a wallet; the proxy runs freeze -> policy -> delegation caps -> human approval before anything is signed.

```bash
pip install ./sdk-python        # PyPI publish pending
```

```python
from spendveto import SpendVeto, SpendVetoDenialError

sv = SpendVeto(agent_token="tg_...")      # token from sv.register_agent("my-agent")
try:
    result = sv.pay("review")
    print(result["data"]["settlement"]["receiptId"])
except SpendVetoDenialError as e:
    print(e.code, "->", e.suggestion)     # self-correctable denial

sv.dry_run("summarize")                   # zero side effects
sv.chat("summarize this ...")             # governed LLM spend
```

Needs a running proxy (`npm run proxy`) and server (`npm run server`). Env: `SPENDVETO_PROXY_URL`, `SPENDVETO_SERVER_URL`.
