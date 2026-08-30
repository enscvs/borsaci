#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

make clean stage FINALPACKAGE=1

APP_PATH="$SCRIPT_DIR/.theos/_/Applications/BorsaciLegacy.app"
if [[ ! -d "$APP_PATH" ]]; then
  echo "BorsaciLegacy.app bulunamadı: $APP_PATH" >&2
  exit 1
fi

rm -rf "$SCRIPT_DIR/Payload"
mkdir -p "$SCRIPT_DIR/Payload"
cp -R "$APP_PATH" "$SCRIPT_DIR/Payload/"
rm -rf "$SCRIPT_DIR/Payload/BorsaciLegacy.app/_CodeSignature"
rm -f "$SCRIPT_DIR/Borsaci-Legacy-iPhone5.ipa"
zip -qry "$SCRIPT_DIR/Borsaci-Legacy-iPhone5.ipa" Payload

echo "IPA hazır: $SCRIPT_DIR/Borsaci-Legacy-iPhone5.ipa"

