#!/bin/bash
# Records the ETHOnline "continuity" supplementary clip: Hedera settle+refuse,
# World ID 4.0 approve/refuse, ENS-gated payment. Native macOS screencapture
# (screencapture -v/-V) — Playwright's recordVideo caps out around 890kbps at
# 25fps and silently ignores deviceScaleFactor; this gives native Retina video
# at full quality instead. See memory: recording-demo-videos-on-mac.
#
# screencapture DISCARDS the file if signaled (Ctrl+C / kill). It only writes
# once its own -V<seconds> budget runs out. So: set a generous budget, let it
# finish naturally, then trim the dead air off the end with ffmpeg afterwards.
# Do not press Ctrl+C once recording starts.
#
# Usage: scripts/record-continuity-demo.sh [seconds] [outfile]

set -euo pipefail

SECONDS_BUDGET="${1:-150}"
OUT="${2:-$HOME/Desktop/spendveto-continuity-demo-raw.mov}"
REGION="0,0,1728,1117"   # full main display, in points (screencapture -R scales to the 2x pixel grid itself)

echo "=================================================================="
echo " SpendVeto continuity demo — recording setup"
echo "=================================================================="
echo
echo "This will record your ENTIRE main display for up to ${SECONDS_BUDGET}s"
echo "at native Retina quality. Output (before trimming): $OUT"
echo
echo "RUN OF SHOW — do these three things, in order, once recording starts:"
echo
echo "  1) HEDERA — real testnet settlement + a real refusal"
echo "     Terminal: SPENDVETO_MODE=testnet npm run demo:hedera   (or your"
echo "     existing curl/CLI flow that produced tx 0.0.9185802-1788804271-756194533)"
echo "     Show: one call that settles on Hedera testnet, one that's refused"
echo "     on policy. Optionally open HashScan to show the tx confirmed."
echo
echo "  2) WORLD ID 4.0 — real device-scanned proof"
echo "     Browser: open launch/worldid-demo.html, let the QR render, scan it"
echo "     with your phone. Show the approval being refused first without a"
echo "     proof (403 world_id_proof_malformed), then approved with the real"
echo "     scanned proof (200), unblocking the paused Hedera settlement."
echo
echo "  3) ENS — payee allowlist resolution"
echo "     Terminal: run the ENS resolution test/demo showing a .eth name"
echo "     (e.g. vitalik.eth) resolving and gating a payment."
echo
echo "Keep total time under ~150s so the final cut stays well inside the"
echo "4-minute submission cap once spliced with the existing footage."
echo
echo "Have every window/tab already open and arranged BEFORE you start —"
echo "screencapture cannot be interrupted or paused once running."
echo
read -p "Press Enter when everything is arranged and ready to record... " _

echo
for i in 5 4 3 2 1; do
  echo "  starting in $i..."
  sleep 1
done
echo ">>> RECORDING NOW — go. Do not press Ctrl+C. <<<"
echo

screencapture -v -V "$SECONDS_BUDGET" -x -R "$REGION" "$OUT"

echo
echo "Done. Raw file (with any dead air) written to:"
echo "  $OUT"
echo
echo "Next: trim with ffmpeg once you know the real start/end timestamps, e.g.:"
echo "  ffmpeg -i \"$OUT\" -ss 00:00:03 -to 00:01:52 -c copy \"${OUT%.mov}-trimmed.mov\""
