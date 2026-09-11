#!/bin/bash
# Builds the whole ETHOnline submission video in two automated/live passes,
# then stitches them together:
#
#   Pass 1 (fully automated, no human needed): the existing product tour
#           (scripts/demo-record.mjs --record --native) — site, playground,
#           console, pitch page. ~55-60s.
#   Pass 2 (you drive it live): Hedera settle+refuse, World ID 4.0 scan,
#           ENS resolution — scripts/record-continuity-demo.sh. ~90-120s.
#
# Total lands well under the 4-minute submission cap. Your recorded voiceover
# (see scripts/narration-script.md) gets muxed on top afterward — see the
# instructions this script prints at the end.

set -euo pipefail
cd "$(dirname "$0")/.."

TOUR_OUT="$HOME/Desktop/spendveto-tour.mp4"
CONTINUITY_OUT="$HOME/Desktop/spendveto-continuity-demo-raw.mov"
FINAL_OUT="$HOME/Desktop/spendveto-ethglobal-final.mp4"

echo "=================================================================="
echo " PASS 1 — automated product tour (no interaction needed)"
echo "=================================================================="
echo "This drives a real Chrome window and captures it natively. Leave it"
echo "alone once it starts — do not click into the window."
echo
read -p "Press Enter to start Pass 1... " _

node scripts/demo-record.mjs --record --native --out="$TOUR_OUT"

echo
echo "Pass 1 done -> $TOUR_OUT"
echo
echo "=================================================================="
echo " PASS 2 — live continuity demo (Hedera + World ID + ENS)"
echo "=================================================================="
echo "Get the Hedera terminal command, launch/worldid-demo.html tab, ENS"
echo "test terminal, and your phone ready BEFORE continuing."
echo
read -p "Press Enter when ready to start Pass 2... " _

scripts/record-continuity-demo.sh 150 "$CONTINUITY_OUT"

echo
echo "=================================================================="
echo " STITCHING"
echo "=================================================================="
echo "Pass 2 has dead air at the start/end (countdown, you getting into"
echo "position). Trim it first, THEN run this to concatenate:"
echo
echo "  ffmpeg -i \"$CONTINUITY_OUT\" -ss 00:00:05 -to 00:02:00 -c copy \"${CONTINUITY_OUT%.mov}-trimmed.mov\""
echo
echo "Then concatenate tour + trimmed continuity clip:"
echo
cat <<EOF
  printf "file '%s'\nfile '%s'\n" "$TOUR_OUT" "${CONTINUITY_OUT%.mov}-trimmed.mov" > /tmp/concat.txt
  ffmpeg -f concat -safe 0 -i /tmp/concat.txt -c:v libx264 -crf 18 -pix_fmt yuv420p "$FINAL_OUT"
EOF
echo
echo "Then add your narration (scripts/narration-script.md) as the audio"
echo "track once you've recorded yourself saying it, e.g.:"
echo
echo "  ffmpeg -i \"$FINAL_OUT\" -i your-narration.mp4 -map 0:v -map 1:a -c:v copy -shortest \"${FINAL_OUT%.mp4}-narrated.mp4\""
echo
echo "(If your narration is a facecam video with its own audio, extract the"
echo "audio first: ffmpeg -i your-narration.mp4 -vn -acodec copy narration.m4a"
echo "then use narration.m4a as -i 1 above.)"
