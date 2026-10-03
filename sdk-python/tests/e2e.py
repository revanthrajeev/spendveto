"""Run by scripts/verify.mjs against the live proxy. Prints one JSON line of results; side-effect-free except one governed denial."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from spendveto import SpendVeto, SpendVetoDenialError
sv = SpendVeto(proxy_url=os.environ["SV_PROXY"], server_url=os.environ["SV_SERVER"])
out = {}
out["catalog"] = any(t["id"] == "review" for t in sv.catalog()["tools"])
d = sv.dry_run("summarize", child="sdk test")
out["dry"] = d.get("dryRun") is True and d.get("decision") in ("would_pay", "would_pause_for_approval")
out["health"] = bool(sv.health())
# Denial path against a local mock proxy (a live blocked call would add a ledger entry the suite counts exactly).
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
class M(BaseHTTPRequestHandler):
    def do_POST(self):
        self.rfile.read(int(self.headers.get("content-length", 0)))
        b = json.dumps({"ok": False, "stage": "delegation", "reason": "cap exhausted", "denial": {"code": "delegation_cap", "suggestion": "ask for a larger grant"}}).encode()
        self.send_response(403); self.send_header("content-type", "application/json"); self.end_headers(); self.wfile.write(b)
    def log_message(self, *a): pass
srv = HTTPServer(("127.0.0.1", 0), M); threading.Thread(target=srv.serve_forever, daemon=True).start()
try:
    SpendVeto(proxy_url=f"http://127.0.0.1:{srv.server_port}").pay("review"); out["denial"] = False
except SpendVetoDenialError as e:
    out["denial"] = e.code == "delegation_cap" and e.suggestion == "ask for a larger grant" and e.stage == "delegation"
print(json.dumps(out))
