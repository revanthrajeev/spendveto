# Contributing

One rule governs everything: **every public claim must be an assertion in `npm run verify`.** New feature → new assertion(s) → update the count everywhere it appears. Never add a control that pretends (unimplementable features ship as slots that refuse honestly — see `rails/index.js`).

Dev loop: `npm install --legacy-peer-deps` → `npm run server` (:8402) → change things → `npm run verify` (must end ALL CHECKS PASSED; free ports 8402/8404/8499 first). See `CLAUDE.md` for the full map and the port-kill gotcha.
