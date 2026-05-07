#!/bin/sh
# Xcode Cloud — post-clone script
# Runs after the repo is cloned. Installs JS deps, builds the web app,
# syncs Capacitor, and installs CocoaPods so the Xcode build can proceed.
set -e

echo "=== LaChart CI: post-clone ==="

# ── Encoding (required by CocoaPods / Ruby 4.x) ──────────────────────────────
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
export RUBYOPT="-E UTF-8:UTF-8"

# ── Node / npm ────────────────────────────────────────────────────────────────
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:$PATH"

if ! command -v node > /dev/null 2>&1; then
  echo "→ Node not found — installing via Homebrew…"
  brew install node
  export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$PATH"
else
  echo "→ Node found: $(node --version)"
fi

echo "→ npm version: $(npm --version)"

REPO_ROOT="$CI_PRIMARY_REPOSITORY_PATH"
CLIENT_DIR="$REPO_ROOT/client"

echo "→ Installing npm dependencies…"
cd "$CLIENT_DIR"
npm ci --legacy-peer-deps

echo "→ Building web app…"
# CI=true makes react-scripts treat warnings as errors — disable that
CI=false npm run build

echo "→ Syncing Capacitor…"
npx cap sync ios

# ── CocoaPods ─────────────────────────────────────────────────────────────────
echo "→ Installing CocoaPods…"
cd "$CLIENT_DIR/ios/App"

# Prefer Ruby 3.x via rbenv if available (avoids Ruby 4.0 CocoaPods bug)
if command -v rbenv > /dev/null 2>&1; then
  RUBY3=$(rbenv versions --bare 2>/dev/null | grep '^3\.' | tail -1)
  if [ -n "$RUBY3" ]; then
    echo "→ Switching to Ruby $RUBY3 via rbenv"
    rbenv local "$RUBY3"
    export PATH="$(rbenv prefix)/bin:$PATH"
  fi
fi

echo "→ Ruby version: $(ruby --version)"

if command -v pod > /dev/null 2>&1; then
  pod install --repo-update
else
  gem install cocoapods --no-document
  pod install --repo-update
fi

echo "=== LaChart CI: post-clone complete ==="
