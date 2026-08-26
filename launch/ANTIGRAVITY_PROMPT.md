# Antigravity asset prompts — SpendVeto landing page (reference-matched)

The landing page (`site/index.html`, serve with `npm run site` → :8403) is already
rebuilt in the reference design language. What code can't produce is **photoreal 3D
renders and illustrations** — that's this file. Paste blocks one at a time into
Antigravity. The user's reference files are on the Desktop: `1.mp4` (monochrome
web3 banking — huge caps type, metallic card, particle mountain, floating chips),
`2.mp4` (Vaultly — editorial fintech, glowing gauge, stat cards), `3.mp4`
(NextWare — dark green glow, centered phone console, floating ticker chips),
`4.webp` (DailyBank — robotic claw gripping a bank card, ghost wordmark),
`5.mp4` (Awsmd wallet — isometric glass 3D feature cards, planet glow). Watch
them first; match their quality bar.

## Design system (include with every prompt)

```
Brand: SpendVeto — spend governance for AI agents. "Your agents can spend.
SpendVeto decides." Mission-control-for-money aesthetic: precise, financial,
quietly futuristic. Dark-first.

Palette (exact):
  page (light matte frame)   #e4e6e1
  canvas background          #070a08
  panel                      #0b100c
  text                       #eef3ed
  muted                      #93a094
  PRIMARY green (allowed)    #46d68c
  deep green                 #1f7a52
  copper (blocked/held)      #e0a05c
  rust (frozen/danger)       #e0644a

Type: Space Grotesk (display), system sans (body), monospace (data).
Existing visual language on the page: dark canvas framed on light gray, giant
uppercase headline, a centered "governed wallet" console with floating status
chips and a green under-glow, particle gate animation, glass feature cards,
gauge dial, ghost outlined SPENDVETO wordmark over a planet-arc glow.
```

## 1 · Hero object render — "the grip" (from 4.webp, reinterpreted)

> Photoreal 3D render, PNG with transparent background, ~1600×1600: a precision
> robotic gripper/claw — dark gunmetal with subtle green (#46d68c) accent
> lighting on its joints — firmly holding a matte-black payment card that has a
> faint circuit pattern and a small glowing green chip. Studio lighting on dark,
> slight bottom under-glow in green. Composition reads as "machine money, under
> control". No text on the card except an embossed "SPENDVETO".
> Save: `site/assets/hero-grip.png`.
> Integration: absolutely position it behind/right of the hero console
> (`.console-stage`) at ~40% opacity fading into the background, or replace the
> Three.js scene's center on mobile. Keep the floating chips on top.

## 2 · Particle terrain band (from 1.mp4's mountain)

> Ultra-wide render (2400×900, PNG or JPG, dark): a monochrome DARK GREEN
> low-poly / particle-scan mountain terrain made of thousands of tiny glowing
> dots (#46d68c on #070a08), sparse and elegant, horizon glow along the ridge.
> It will sit behind the "Why now" market-stats section at low opacity.
> Save: `site/assets/terrain.png`; add as a `background-image` on `#market`
> with `background-size: cover; background-blend-mode: screen; opacity` via a
> ::before layer at 0.25.

## 3 · Eight isometric glass objects (from 5.mp4's cards)

> Eight small isometric 3D illustrations, PNG transparent, ~600×600 each, one
> per feature card — glassy dark objects with green rim-light and soft glow,
> consistent camera angle and scale across all eight:
> 1. shield of translucent glass with a check mark core        (policy)
> 2. a hovering hand above a glowing pause button              (approvals)
> 3. three stacked vaults connected by light threads, tree-like (budgets)
> 4. a key inside angle brackets ⟨key⟩                          (scoping)
> 5. a hexagonal emergency stop button, slightly pressed        (kill switch)
> 6. two chips joined by a glowing bridge/plug                  (MCP)
> 7. a receipt scroll with a waveform signature line            (receipts)
> 8. a bell with tiny ascending bar-chart bars                  (alerts)
> Save: `site/assets/obj/01-policy.png` … `08-alerts.png`.
> Integration: replace each card's `.glyph` SVG with
> `<img src="./assets/obj/0N-name.png" alt="" style="width:96px">` — keep the
> mini-chips and copy untouched.

## 4 · OG / social card

> 1200×630 PNG, `site/assets/og.png`. Dark #070a08, faint grid, the robotic
> gripper + card from block 1 on the right third, left side: "SPENDVETO_" small
> wordmark top, huge Space Grotesk caps "YOUR AGENTS CAN SPEND. SPENDVETO
> DECIDES." with the second line in #46d68c, bottom mono line: "spend governance
> for AI agents · x402 + MCP · open source". Add `<meta property="og:image">`
> etc. to site/index.html head.

## 5 · Logo mark + favicon

> Geometric mark: two vertical pylon strokes with one thin luminous crossbar
> slightly ajar — a gate that reads as a "T". Must survive at 16px. Deliver
> `site/assets/logo.svg` (currentColor) and `site/assets/favicon.svg` (green on
> transparent); wire `<link rel="icon">` and put the mark before the nav
> wordmark at 18px.

## 6 · Hero loop video (optional, highest effort)

> 8-second seamless loop, 1920×1080 WebM (VP9, <4MB, no audio): camera drifts
> slowly over the block-2 particle terrain at night; thousands of micro
> particles stream toward a thin vertical green light-gate; ~1 in 8 deflects
> copper. Film grain. Export poster JPG. Save `site/assets/hero-loop.webm` +
> `hero-poster.jpg`. Layer UNDER the Three.js canvas at 35% opacity with
> `prefers-reduced-motion` showing the poster only.

---

# WAVE 2 — assets for launch week (blocks 1–5 delivered ✓, integrated)

The site now has three pages: `index.html` (landing), `pitch.html` (investor
deck, 11 slides), `docs.html` (documentation). Same design system as above.

## 7 · Social / profile kit

> Using the established SpendVeto design system and the existing gripper render:
> a) **GitHub social preview** 1280×640 PNG — dark #070a08, faint grid, gate
>    logo + "SPENDVETO_" top-left, one-line "Spend governance for AI agents",
>    small mono footer "x402 + MCP · open source · 280 verified checks".
>    Save `site/assets/social/github.png`.
> b) **X/Twitter banner** 1500×500 PNG — terrain render as the base, headline
>    "Your agents can spend. SpendVeto decides." left-aligned.
>    Save `site/assets/social/x-banner.png`.
> c) **Avatar** 800×800 PNG — the gate glyph, green on #070a08, centered,
>    comfortable padding. Save `site/assets/social/avatar.png`.

## 8 · Architecture diagram (docs + deck)

> A clean horizontal architecture diagram, SVG preferred (currentColor lines,
> green/copper accents), transparent background, ~1400×520:
> [ Agent: CLI · child wallet · Claude/MCP ] → [ SPENDVETO: freeze check →
> policy → delegation chain → human approval ] → [ Rail: x402/USDC today ·
> AP2 / Stripe MPP next ] → [ Signed receipt + ledger + alerts ].
> Blocked paths exit downward in copper at the SpendVeto stage. Style: thin
> lines, HUD brackets, mono labels — matches the site, NOT a generic flowchart.
> Save `site/assets/architecture.svg`; embed in docs.html under "Governance
> model" and keep it legible at 700px wide.

## 9 · Deck slide renders (pitch.html backgrounds)

> Three wide renders, 1800×900, dark, same language as terrain/gripper, to sit
> at 20% opacity behind deck slides:
> a) `deck-vaults.png` — a branching tree of small dark vaults with green fill
>    bars, one branch capped in copper (for the product slide).
> b) `deck-rings.png` — three concentric luminous rings labeled-ready (TAM /
>    SAM / SOM composition, no text baked in) for the market slide.
> c) `deck-gate-wide.png` — the light-gate from far away with particle streams,
>    cinematic, for the title and ask slides.
> Save under `site/assets/deck/`; integrate as CSS backgrounds with a dark
> gradient overlay so text stays AAA-readable.

## 10 · Product Hunt / listing gallery

> Five 1270×760 PNGs framed on the brand background (grid + glow, consistent
> margins): 1) hero statement card; 2) a REAL screenshot of the dashboard at
> http://localhost:8402 (run `npm run server`, seed with two `npm run call`s,
> a delegation, and one pending approval first); 3) a REAL terminal screenshot
> of `npm run verify` ending in "ALL CHECKS PASSED"; 4) the budget-tree +
> kill-switch area of the dashboard; 5) closing CTA card with the quickstart
> commands. Save `site/assets/gallery/01…05.png`. Real screenshots framed —
> do not mock the product UI.

## Hard constraints (repeat to the agent)

- Fully local assets only — no CDN/external URLs anywhere in `site/`.
- Don't change the verified copy/claims (280 checks, prices, market numbers).
- Keep `prefers-reduced-motion` fallbacks and the floating-chip mobile fallback.
- Test with `npm run site` → http://localhost:8403 before finishing.
- Leave changes staged (git add), never commit.
