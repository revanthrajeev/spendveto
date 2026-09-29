// Copies the real Console (dashboard/) into site/console/ for the public demo
// at spendveto.com/console/. Same HTML, CSS and JS — only three edits: load
// demo-api.js first (answers fetch() from snapshot.json), show a demo banner,
// and point the localhost links at the public site. Re-run after changing
// dashboard/ so the demo never drifts from the product.
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";

const src = new URL("../dashboard/", import.meta.url);
const out = new URL("../site/console/", import.meta.url);

copyFileSync(new URL("style.css", src), new URL("style.css", out));
copyFileSync(new URL("app.js", src), new URL("app.js", out));

let html = readFileSync(new URL("index.html", src), "utf8");
html = html
  .replace("<title>SpendVeto Console</title>", "<title>SpendVeto Console Demo</title>\n<meta name=\"robots\" content=\"noindex\" />")
  .replace('href="http://localhost:8403/docs.html"', 'href="/docs.html"')
  .replace('href="http://localhost:8403"', 'href="/"')
  .replace('href="/api/export.csv"', 'href="#ledger" title="CSV export needs a running server"')
  .replace(
    '<script src="./app.js"></script>',
    '<script src="./demo-api.js"></script>\n<script src="./app.js"></script>',
  )
  .replace(
    '<div class="shell">',
    '<div class="demo-banner">Demo console — real data captured from a local SpendVeto run, no server behind this page. Clicks change this tab only. <a href="/playground.html">Playground</a> · <a href="/docs.html">Run your own</a></div>\n<div class="shell">',
  );
if (!html.includes("demo-api.js") || !html.includes("demo-banner")) throw new Error("dashboard/index.html changed shape — update build-console-demo.mjs");
writeFileSync(new URL("index.html", out), html);

const css = readFileSync(new URL("style.css", out), "utf8");
writeFileSync(new URL("style.css", out), css + `
.demo-banner { position: sticky; top: 0; z-index: 50; padding: 8px 16px; font-size: 13px; text-align: center; background: #46d68c; color: #06120b; }
.demo-banner a { color: inherit; font-weight: 600; }
`);
console.log("site/console/ rebuilt from dashboard/");
