# Antigravity prompt — wallet logo assets for the connect modal

Paste everything below into Antigravity. When it finishes, tell Claude "logos ready" and Claude wires them into `site/wallet-modal.js` (with monogram fallback for any that are missing).

---

You are working in the repo at `~/Desktop/spendveto`. The marketing site (`site/`) is strictly self-contained — every asset must be a local file, never hotlinked.

**TASK: collect official wallet logos into `site/assets/wallets/` with EXACTLY these filenames:**

`metamask.png, brave.png, coinbase.png, binance.png, trust.png, okx.png, rabby.png, safepal.png, bitget.png, tokenpocket.png, uniswap.png, phantom.png, zerion.png, fireblocks.png, imtoken.png, exodus.png, ledger.png, frame.png, walletconnect.png`

Rules:
1. **Official sources only** — each project's press kit / brand page, official GitHub organization avatar (`https://github.com/<org>.png?size=128`), or official website icon. Do NOT redraw, restyle, or generate lookalike logos; these are trademarks used nominatively to indicate wallet compatibility (the same way every WalletConnect/Reown modal shows them).
2. **Format**: square, exactly 128×128, PNG (convert/resize with `sips -z 128 128 <file>` on macOS). Transparent or the brand's own background — no added borders or effects.
3. **Verify every file**: `file <name>.png` must report PNG image data, size must be > 1 KB, and open each one to confirm it's actually the right logo (not a 404 page saved as .png — that's what broke the last attempt).
4. Anything you genuinely cannot source officially: skip it and list it at the end — do NOT substitute something close.
5. Touch nothing outside `site/assets/wallets/`. Do not edit any HTML/JS/MD — Claude does the wiring.
6. Finish with a manifest: one line per file — filename, source URL, pixel size, bytes.

**OPTIONAL, if you have time** (from `launch/ANTIGRAVITY_PROMPT.md` wave-2, still open): the social/OG image kit and the architecture SVG. Same rules: no invented claims, the number that appears anywhere is **272 verified checks**.
