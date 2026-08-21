# Antigravity prompt — SpendVeto pitch deck, Slide 4 flow diagram replacement

Generate ONE image and drop it in `site/assets/generated/` as
**`deck-flow-diagram.png`**. This replaces the incomplete AI-generated flow
diagram on Slide 4 of the SpendVeto pitch deck (the one currently missing
stages / merging boxes incorrectly).

## Exact spec — do not deviate from the stage count or order

A **horizontal sequential flow diagram**, flat vector line-art style,
**exactly six labeled boxes in this exact order, left to right**, connected by
thin arrows:

1. **Agent Initiates**
2. **Frozen Check**
3. **Policy Gate**
4. **Human Approval**
5. **Payment Settles**
6. **Ledgered**

All six boxes must be the same size and same visual weight — do not merge,
skip, combine, or drop any of the six. This is a strict requirement: count the
boxes before finishing and confirm there are six.

## Style

- Each box: a rounded rectangle, thin 1.5px outline stroke, label centered
  inside in a clean geometric sans-serif (Space Grotesk or similar), one line
  of text per box.
- Thin arrow connectors between each consecutive box, pointing left to right.
- **Boxes 1–4 and box 6** ("Agent Initiates," "Frozen Check," "Policy Gate,"
  "Human Approval," "Ledgered"): neutral dark-grey fill (`#1a1f1c`) with a
  light grey outline (`#5c675e`) and white/off-white text (`#eef3ed`).
- **Box 5, "Payment Settles," only**: filled with the accent green
  (`#46d68c`) background and near-black text (`#070a08`) for contrast — this
  is the one visually distinct "money moves here" moment, the only box in the
  whole diagram using color.
- Background: transparent, OR solid near-black (`#070a08`) if transparency
  isn't supported — either works since the deck's slide background is already
  that same near-black.
- No icons, no illustration, no clipart inside the boxes — text-only labels
  in clean boxes, nothing decorative.
- No gradients, no drop shadows, no glow effects, no photorealism.

## Dimensions

**1920×480px**, PNG, landscape/banner aspect ratio (wide and short, matching
a horizontal flow-diagram slot). Keep file size reasonable (under 300KB);
compress if needed.

## Why these constraints

This is for a pitch deck whose whole positioning is "every claim is a passing
test, not marketing" — the diagram needs to precisely match the six-stage
flow described in the deck's own caption text (Agent → Frozen check → Policy
check → Human approval → Payment settles → Ledgered) with no simplification,
because a mismatch between the visual and the written claim undermines the
deck's credibility. Exactness over artistic flourish.

## After generation

Confirm the file is `deck-flow-diagram.png`, 1920×480, and — critically —
visually count six distinct boxes with the six labels above before calling it
done. Report back the filename so it can be dropped into the pitch deck
replacing the current Slide 4 diagram.
