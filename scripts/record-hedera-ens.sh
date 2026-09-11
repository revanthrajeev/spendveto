#!/bin/bash
# Fully automated: records ONLY the Hedera (refuse+settle) and ENS segments,
# in a dedicated Terminal window, no human interaction needed. World ID is
# deliberately excluded (needs a live phone scan) — see
# scripts/record-continuity-demo.sh for that piece separately.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="$HOME/Desktop/spendveto-hedera-ens.mov"
BUDGET=75

BOUNDS=$(osascript -e '
tell application "Terminal"
  activate
  set w to do script "cd \"'"$(pwd)"'\" && clear"
  delay 1
  set bounds of front window to {60, 60, 1400, 900}
  set b to bounds of front window
end tell
return b')
X=$(echo "$BOUNDS" | cut -d, -f1 | tr -d ' ')
Y=$(echo "$BOUNDS" | cut -d, -f2 | tr -d ' ')
X2=$(echo "$BOUNDS" | cut -d, -f3 | tr -d ' ')
Y2=$(echo "$BOUNDS" | cut -d, -f4 | tr -d ' ')
W=$((X2 - X))
H=$((Y2 - Y))
REGION="$X,$Y,$W,$H"
echo "Recording region: $REGION -> $OUT (budget ${BUDGET}s)"

run() {
  osascript -e "tell application \"Terminal\" to do script \"$1\" in front window" >/dev/null
}

screencapture -v -V "$BUDGET" -x -R "$REGION" "$OUT" &
CAP_PID=$!
sleep 2

run "echo '=== HEDERA: refused — chain not in allowed scope ===' && node scripts/policy.mjs apply cautious"
sleep 3
run "SPENDVETO_MODE=testnet node client/pay-and-call.js summarize --chain=hedera-testnet"
sleep 5
run "echo '=== HEDERA: restored policy, real settlement ===' && cp data/policy.json.bak data/policy.json && cat data/policy.json"
sleep 3
run "SPENDVETO_MODE=testnet node client/pay-and-call.js review --chain=hedera-testnet"
sleep 6
run "echo '=== ENS: real mainnet resolution gating a payment ===' "
sleep 2
run "node scripts/demo-ens-live.mjs"
sleep 8

echo "Waiting for the recording budget to finish naturally (do not Ctrl+C)..."
wait "$CAP_PID"
echo "Done -> $OUT"
