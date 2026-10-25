#!/bin/bash
# Builds the signed Android app (Trusted Web Activity over the hosted PWA) with Bubblewrap:
# app-release-bundle.aab and app-release-signed.apk in apps/web/android/. README → "Android".
#
# Needs ANDROID_KEYSTORE (path), ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS and
# ANDROID_KEYSTORE_SHA256 (the keystore's SHA-256 fingerprint) in `.env`; without them it
# skips with a warning. HOSTED_WEB_URL (https://…) overrides the host in twa-manifest.json.
#
#   pnpm build:android

set -uo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then
  set -a; source .env; set +a
fi

warn() { printf '\033[33mskipped:\033[0m %s\n' "$*" >&2; }

missing=""
for v in ANDROID_KEYSTORE ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEYSTORE_SHA256; do
  [ -z "${!v:-}" ] && missing="$missing $v"
done
if [ -n "$missing" ]; then
  warn "Android build — set$missing in .env (README → Android)"
  exit 0
fi
if [ ! -f "$ANDROID_KEYSTORE" ]; then
  warn "Android build — keystore not found at $ANDROID_KEYSTORE"
  exit 0
fi
for t in jq npx; do
  command -v "$t" >/dev/null || { warn "Android build — $t not installed"; exit 0; }
done

keystore=$(cd "$(dirname "$ANDROID_KEYSTORE")" && pwd)/$(basename "$ANDROID_KEYSTORE")
cd apps/web

# Web host: HOSTED_WEB_URL when set, else whatever twa-manifest.json already has.
manifest=$(cat twa-manifest.json)
if [ -n "${HOSTED_WEB_URL:-}" ]; then
  case $HOSTED_WEB_URL in
    https://*) ;;
    *) warn "Android build — HOSTED_WEB_URL must start with https://"; exit 0 ;;
  esac
  host=${HOSTED_WEB_URL#https://}; host=${host%%/*}
  manifest=$(jq --arg h "$host" '.host = $h
    | .iconUrl = "https://\($h)/icon-512.png"
    | .maskableIconUrl = "https://\($h)/icon-maskable-512.png"
    | .webManifestUrl = "https://\($h)/manifest.webmanifest"' <<<"$manifest")
fi
printf '%s\n' "$manifest" | jq --arg k "$keystore" --arg a "$ANDROID_KEY_ALIAS" \
  '.signingKey = {path: $k, alias: $a}' > twa-manifest.json.tmp || exit 1

# Digital Asset Links: tie the web origin to the app's signing key (deploy the web after this).
pkg=$(jq -r .packageId twa-manifest.json.tmp)
jq -n --arg pkg "$pkg" --arg fp "$ANDROID_KEYSTORE_SHA256" '[{
  relation: ["delegate_permission/common.handle_all_urls"],
  target: {namespace: "android_app", package_name: $pkg, sha256_cert_fingerprints: [$fp]}
}]' > public/.well-known/assetlinks.json.tmp \
  && mv public/.well-known/assetlinks.json.tmp public/.well-known/assetlinks.json || exit 1

mkdir -p android
mv twa-manifest.json.tmp android/twa-manifest.json
cd android
export BUBBLEWRAP_KEYSTORE_PASSWORD=$ANDROID_KEYSTORE_PASSWORD BUBBLEWRAP_KEY_PASSWORD=${ANDROID_KEY_PASSWORD:-$ANDROID_KEYSTORE_PASSWORD}
# First run generates the Android project from the manifest; later runs only update it.
if [ -f build.gradle ]; then
  npx --yes @bubblewrap/cli update --manifest=twa-manifest.json --skipVersionUpgrade || exit 1
else
  npx --yes @bubblewrap/cli init --manifest="$(jq -r .webManifestUrl twa-manifest.json)" || exit 1
fi
npx --yes @bubblewrap/cli build --manifest=twa-manifest.json || exit 1
echo "built: $(pwd)/app-release-bundle.aab and app-release-signed.apk"
