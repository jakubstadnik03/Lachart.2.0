#!/bin/sh
# Xcode Cloud — post-clone script
# Runs after the repo is cloned. Installs JS deps, builds the web app,
# syncs Capacitor, and installs CocoaPods so the Xcode build can proceed.
set -e

echo "=== LaChart CI: post-clone ==="

# ── Node / npm ────────────────────────────────────────────────────────────────
# Xcode Cloud uses its own Node; make sure Homebrew's node is also on PATH
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Resolve the client directory relative to the repo root
REPO_ROOT="$CI_PRIMARY_REPOSITORY_PATH"
CLIENT_DIR="$REPO_ROOT/client"

echo "→ Installing npm dependencies…"
cd "$CLIENT_DIR"
npm ci --legacy-peer-deps

echo "→ Building web app…"
npm run build

echo "→ Syncing Capacitor…"
npx cap sync ios --no-build

# ── CocoaPods ─────────────────────────────────────────────────────────────────
echo "→ Installing CocoaPods…"
cd "$CLIENT_DIR/ios/App"

# Force UTF-8 encoding (required by CocoaPods)
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# Use the system gem's pod if Homebrew's isn't available
if command -v pod > /dev/null 2>&1; then
  pod install --repo-update
else
  gem install cocoapods --no-document
  pod install --repo-update
fi

echo "=== LaChart CI: post-clone complete ==="
