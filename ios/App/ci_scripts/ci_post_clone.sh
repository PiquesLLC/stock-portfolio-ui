#!/bin/bash
# Xcode Cloud post-clone script for Nala Portfolio App
# This script runs after Xcode Cloud clones the repository.
# It installs Node.js, npm dependencies, builds the web app,
# and runs Capacitor sync so the iOS project has the latest web assets.

set -euo pipefail

echo "=== Nala: Xcode Cloud Post-Clone Script ==="
echo "Current directory: $(pwd)"
echo "CI workspace: ${CI_WORKSPACE:-not set}"

# Navigate to the project root (Xcode Cloud clones into CI_WORKSPACE)
# The iOS project is at ios/App/, so the repo root is two levels up
cd "$CI_WORKSPACE"
echo "Working directory: $(pwd)"

# ── Install Node.js via Homebrew ──
echo "=== Installing Node.js ==="
brew install node
echo "Node version: $(node --version)"
echo "npm version: $(npm --version)"

# ── Install npm dependencies ──
echo "=== Installing npm dependencies ==="
npm ci

# ── Build the web app for Capacitor ──
echo "=== Building web app (Capacitor mode) ==="
npm run build:cap

# ── Sync web assets to iOS project ──
echo "=== Running Capacitor sync ==="
npx cap sync ios

echo "=== Post-clone script complete ==="
echo "Web assets synced to ios/App/App/public/"
