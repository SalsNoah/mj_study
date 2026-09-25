#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
REMOTE="${1:-https://github.com/SalsNoah/mj_study.git}"
git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE"
git branch -M main
git push -u origin main
echo "Pushed to $REMOTE"
