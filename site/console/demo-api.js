// Demo backend for the public console at spendveto.com/console/.
// The real Console talks to a self-hosted SpendVeto server; this page has none,
// so fetch() is answered from snapshot.json — responses captured from a real
// local run (simulate mode), not hand-written. Buttons still work: approve,
// deny, freeze, unfreeze, revoke and policy edits change this tab's copy of
// the state, and reset on reload. Nothing here settles or signs anything.
(() => {
  const realFetch = window.fetch.bind(window);
  let snap = null;
  const load = () => (snap ??= realFetch("./snapshot.json").then((r) => r.json()).then(seed));
  const now = () => new Date().toISOString();

  function seed(s) {
    // One pending approval so the Approvals page has something to decide on.
    const addr = Object.keys(s["/api/ledger"].balances || {})[0] || "0x0000000000000000000000000000000000000000";
    s["/api/approvals"].approvals.push({ id: "demo-approval-1", status: "pending", address: addr, resource: "/api/agent/summarize", price: "0.02", createdAt: now() });
    return s;
  }

  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const pathOf = (input) => {
    const u = new URL(typeof input === "string" ? input : input.url, location.href);
    return u.pathname.replace(/^.*?(\/api\/|\/proxy\/)/, "$1") + u.search;
  };

  async function handle(path, opts = {}) {
    const s = await load();
    const method = (opts.method || "GET").toUpperCase();
    const body = opts.body ? JSON.parse(opts.body) : {};

    if (method === "GET") {
      if (path.startsWith("/api/report")) return json(s[path] || s["/api/report?days=7"]);
      if (path.startsWith("/api/trust/")) {
        // Balances are keyed lowercase, the ledger keeps checksum case — match either.
        const hit = Object.keys(s).find((k) => k.toLowerCase() === path.toLowerCase());
        const addr = path.slice("/api/trust/".length);
        return json(hit ? s[hit] : { address: addr, score: 50, grade: "C", signals: { paid: 0, blocked: 0, failed: 0, freezes: 0, frozenNow: false } });
      }
      return s[path] ? json(s[path]) : json({ error: "not in demo snapshot" }, 404);
    }

    let m;
    if ((m = path.match(/^\/api\/approvals\/([^/]+)\/decide$/))) {
      const a = s["/api/approvals"].approvals.find((x) => x.id === m[1]);
      if (a) Object.assign(a, { status: body.decision, decidedAt: now() });
      return json({ ok: true, approval: a });
    }
    if (path === "/api/freezes") {
      s["/api/freezes"].freezes.push({ id: `demo-${Date.now()}`, address: body.address, reason: body.reason, createdAt: now() });
      s["/api/stats"].frozenWallets += 1;
      return json({ ok: true });
    }
    if ((m = path.match(/^\/api\/freezes\/([^/]+)\/unfreeze$/))) {
      const f = s["/api/freezes"].freezes.find((x) => x.id === m[1]);
      if (f && !f.unfrozen) { f.unfrozen = now(); s["/api/stats"].frozenWallets -= 1; }
      return json({ ok: true });
    }
    if ((m = path.match(/^\/api\/delegations\/([^/]+)\/revoke$/))) {
      const d = s["/api/delegations"].delegations.find((x) => x.id === m[1]);
      if (d) d.revoked = now();
      return json({ ok: true });
    }
    if (path === "/api/policy" && method === "PUT") {
      Object.assign(s["/api/policy"], body);
      return json(s["/api/policy"]);
    }
    if (path === "/api/policy/apply") {
      const pack = (s["/api/policy-packs"].packs || []).find((p) => p.name === body.pack);
      if (pack) { const { name, $description, ...policy } = pack; s["/api/policy"] = { ...policy }; }
      return json({ ok: true });
    }
    return json({ error: "demo_read_only", suggestion: "This is a demo console with no server behind it. Run SpendVeto yourself to create wallets, agents and tools: see /docs.html" }, 403);
  }

  window.fetch = (input, opts) => {
    const path = pathOf(input);
    return /^\/(api|proxy)\//.test(path) ? handle(path, opts) : realFetch(input, opts);
  };
})();
