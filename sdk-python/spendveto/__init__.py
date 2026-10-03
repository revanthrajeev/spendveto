"""spendveto: dependency-free Python client for the SpendVeto spend-governance proxy.

Mirrors the npm `spendveto-sdk`. Agents never hold a wallet: they call these methods and the proxy runs the full
governance pipeline (freeze -> policy -> delegation caps -> human approval) before signing anything.

    from spendveto import SpendVeto, SpendVetoDenialError
    sv = SpendVeto(agent_token="tg_...")
    try:
        result = sv.pay("review")
    except SpendVetoDenialError as e:
        print(e.code, e.suggestion)      # machine-readable, self-correctable
    preview = sv.dry_run("summarize")    # zero side effects
"""
import json
import os
import urllib.error
import urllib.request

__all__ = ["SpendVeto", "SpendVetoDenialError"]
__version__ = "0.1.0"


class SpendVetoDenialError(Exception):
    def __init__(self, reason=None, code=None, suggestion=None, stage=None):
        super().__init__(f"spendveto {stage or 'policy'} denial{f' [{code}]' if code else ''}: {reason}")
        self.reason, self.code, self.suggestion, self.stage = reason, code, suggestion, stage


class SpendVeto:
    def __init__(self, proxy_url=None, server_url=None, agent_token=None, timeout=300):
        self.proxy_url = proxy_url or os.environ.get("SPENDVETO_PROXY_URL", "http://localhost:8404")
        self.server_url = server_url or os.environ.get("SPENDVETO_SERVER_URL", "http://localhost:8402")
        self.agent_token = agent_token
        self.timeout = timeout  # generous default: a call may pause for human approval

    def _request(self, url, body=None, headers=None):
        h = {"Content-Type": "application/json", **(headers or {})}
        if self.agent_token:
            h.setdefault("Authorization", f"Bearer {self.agent_token}")
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data, h, method="POST" if body is not None else "GET")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as e:  # denials come back as non-2xx with a JSON body
            try:
                return e.code, json.load(e)
            except Exception:
                return e.code, {"ok": False, "reason": f"HTTP {e.code}"}

    @staticmethod
    def _raise(data):
        d = data.get("denial") or {}
        raise SpendVetoDenialError(data.get("reason"), d.get("code"), d.get("suggestion"), data.get("stage"))

    def pay(self, tool_id, child=None, chain=None, dry_run=False, idempotency_key=None, query=None):
        """Pay for a catalog tool through the governed pipeline. Raises SpendVetoDenialError on ANY refusal,
        so a blocked spend can never be mistaken for a successful one."""
        hdr = {"Idempotency-Key": idempotency_key} if idempotency_key else None
        status, data = self._request(f"{self.proxy_url}/proxy/call",
                                     {"tool": tool_id, "child": child, "chain": chain, "dryRun": dry_run or None, "query": query}, hdr)
        if dry_run:
            return data
        if status >= 400 or not data.get("ok"):
            self._raise(data)
        return data

    def dry_run(self, tool_id, **kw):
        return self.pay(tool_id, dry_run=True, **kw)

    def chat(self, prompt, max_tokens=512, child=None, approval_timeout_ms=None):
        """Governed LLM/API spend: estimated up front, fails closed, actual cost metered into the same ledger."""
        status, data = self._request(f"{self.proxy_url}/proxy/llm",
                                     {"prompt": prompt, "maxTokens": max_tokens, "child": child, "approvalTimeoutMs": approval_timeout_ms})
        if status >= 400 or not data.get("ok"):
            self._raise(data)
        return data

    def catalog(self):
        return self._request(f"{self.server_url}/api/catalog")[1]

    def register_agent(self, label, child=None):
        status, data = self._request(f"{self.proxy_url}/proxy/agents", {"label": label, "child": child})
        if status >= 400:
            raise RuntimeError(f'could not register agent "{label}": HTTP {status}')
        return data

    def health(self):
        return self._request(f"{self.proxy_url}/proxy/health")[1]
