#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: verify-native-release-signing.sh /absolute/path/to/chengfeng-videocut-mcp" >&2
  exit 2
fi

binary=$1
details=$(codesign -dvvv "$binary" 2>&1 || true)
verified=false
if codesign --verify --strict --verbose=2 "$binary" >/dev/null 2>&1 \
  && printf '%s\n' "$details" | grep -q '^Authority=Developer ID Application:' \
  && ! printf '%s\n' "$details" | grep -q '^Signature=adhoc$'; then
  verified=true
fi

if [ "$verified" = true ]; then
  printf '%s\n' '{"ok":true,"releaseSigning":"developer-id"}'
  exit 0
fi

printf '%s\n' '{"ok":false,"releaseSigning":"blocked","reason":"missing valid Developer ID Application signature"}'
if [ "${CHENGFENG_RELEASE_GATE:-0}" = "1" ]; then
  exit 1
fi
