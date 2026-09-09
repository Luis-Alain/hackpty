#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  printf '%s\n' 'Run this script on a Mac with Xcode installed.' >&2
  exit 1
fi
mobile_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$mobile_dir"
xcodebuild -version
npm ci
npm run check
node scripts/verify-ios-config.cjs
env -u SDKROOT xcrun --sdk macosx swift test --package-path modules/psyrec-transfer
npx --no-install expo prebuild --platform ios --no-install
npx --yes pod-install ios
printf '%s\n' \
  'Prepared ios/PsyRecCapture.xcworkspace.' \
  'Open that workspace in Xcode, select your signing team and connected iPhone, then Run.' \
  'For a self-contained phone build, set the Run scheme build configuration to Release.' \
  'The simulator build does not install on a physical iPhone.'
