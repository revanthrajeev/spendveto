# Antigravity visual asset brief — SpendVeto

You (Antigravity) generate the raster assets described below and drop them into
**`site/assets/generated/`** (create the folder). Claude then fetches them and
wires them into the site. One asset per spec, exact filename, exact dimensions.

This is a **security / spend-governance** product for AI agents that pay for
things. The whole brand is *"evidence, not adjectives."* Every visual must read
as serious developer infrastructure (think Stripe / Vercel / HashiCorp), **not**
consumer-AI hype.

## Non-negotiable rules (apply to EVERY asset)

- **Palette only** (the site's real tokens):
  - background `#070a08` (near-black, green-tinted) and `#0b100c`
  - primary accent / green `#46d68c`, deep green `#1f7a52`
  - secondary accent / copper `#e0a05c` (use sparingly, for "blocked/warning")
  - text `#eef3ed`, dim text `#93a094`, faint `#5c675e`
- **Dark, restrained, high-contrast.** Lots of negative space. Flat / subtle
  gradients and fine line-work, not glossy 3D or lens flares.
- **Wordmark:** the literal string `SPENDVETO` followed by a green underscore
  `_` (the cursor tick). Uppercase, tight tracking, geometric sans
  (Space Grotesk feel). Optional glyph: a minimal "spendveto/turnstile" mark —
  two vertical bars with two horizontal arms, single stroke, green.
- **NO hard numbers, prices, or metrics baked into the image.** (The verified
  check-count, market sizes, and prices change and are synced from code — a PNG
  can't be a source of truth.) Use words like *"verified in public"* instead.
- **NO external brand names, logos, or model names** (no "GPT", "OpenAI",
  "Claude", chain logos, etc.). Implying an affiliation we don't have is a
  credibility/legal problem for a payments product.
- **NO space / cosmic / galaxy / planet imagery, no stock-photo people, no
  generic "glowing AI brain / neural net" clichés.** These are the exact
  hype-signals this product must avoid.
- Output **PNG** (transparent where noted), sRGB. Keep each file **< 300 KB**
  (compress). Provide @1x; if trivial, also @2x with `-2x` suffix.

---

## Asset 1 — `og-default.png`  (1200 × 630, opaque)

Primary social/link-preview card for the homepage.

**Prompt:** A 1200×630 dark hero card, background `#070a08` with a very subtle
radial vignette toward `#0b100c`. Left-aligned composition. Large wordmark
`SPENDVETO_` in `#eef3ed` with the trailing `_` in green `#46d68c`. Beneath it,
one line of dim `#93a094` text: *"The spend-governance layer for AI agents."*
Lower-left, a small green pill/badge reading *"x402 + MCP · open source ·
verified in public."* Right third: a minimal single-stroke line diagram of a
payment passing through a gate — a chip/coin glyph on the left, a vertical
turnstile "gate" in the center (green), and a checkmark on the far side; a faint
second attempt hitting the gate and bouncing back in copper `#e0a05c` (the
"blocked" path). Thin, technical, blueprint-like line-work. No photorealism, no
glow bloom.

## Asset 2 — `og-playground.png`  (1200 × 630, opaque)

Share card for the interactive playground page (the site's centerpiece).

**Prompt:** Same frame, palette, and wordmark lockup as Asset 1, but the headline
line reads *"Try the live governance playground."* Right two-thirds: a stylized,
flat abstract of the playground UI — three horizontal "policy" sliders in green,
and three small outcome chips stacked: one green (`paid`), one copper
(`pending / blocked`), one outline. Keep it schematic and iconographic, **not** a
literal screenshot. Fine line-work, generous dark space.

## Asset 3 — `texture-gate.png`  (2400 × 1200, transparent PNG)

Optional ambient background texture for section headers — must sit *behind* text
at very low opacity.

**Prompt:** A seamless, very-low-contrast abstract texture on transparent
background: faint topographic contour lines and a sparse technical grid,
evoking a "gate / checkpoint" survey map, in near-black greens (`#0b100c` over
transparent) with occasional single hairlines in `#1f7a52` at ~8% opacity. No
focal point, no imagery, no text — this is wallpaper that must never compete
with foreground copy. Tileable horizontally.

---

## What Claude is building as CODE instead (do NOT generate these)

- The **interactive trust-graph visualization** (real `/api/trust/graph` data —
  wallets as nodes, delegations as edges, org rollups) — inline SVG + JS.
- The **architecture diagram** (agent → policy → approval/freeze → rail) —
  inline SVG, editable, claim-accurate.
- All **UI motion** (animated gate, reveals) — CSS / Web Animations.

These carry product truth and live numbers, so they stay in code, not baked art.

## Drop location & handoff

Put finished files in `site/assets/generated/`. When done, list the filenames so
Claude can fetch, sanity-check (dimensions, file size, palette, no baked
numbers, no banned imagery), and wire them into the pages' `<meta og:image>` and
CSS.
