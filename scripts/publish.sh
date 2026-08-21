#!/usr/bin/env bash
# One-shot publish: creates the GitHub repo, pushes, and swaps every <repo>
# placeholder in the docs/site for the real URL. Usage: ./scripts/publish.sh [name]
set -euo pipefail
cd "$(dirname "$0")/.."
NAME="${1:-spendveto}"
gh auth status
gh repo create "$NAME" --public --source=. --push
URL=$(gh repo view --json url -q .url)
echo "Published: $URL — swapping placeholders…"
grep -rl '<repo>' README.md CHANGELOG.md site launch 2>/dev/null | while read -r f; do
  sed -i '' "s|<repo>|$URL|g" "$f"
done
git add -A && git commit -m "docs: real repository URL" && git push
echo "Done. Next: deploy site/ (netlify deploy --dir=site), then launch/SHOW_HN.md."
