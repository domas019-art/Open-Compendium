#!/usr/bin/env bash
# Builds the Windows program from this repository: build/Open-Compendium-<version>.zip (the whole program)
# and build/Open-Compendium-<version>-update.zip (only the program's own files). Run from the repository root.
set -euo pipefail
ROOT="$(pwd)"
VER=$(node -p "require('./app/package.json').version")
EV=44.9.3
mkdir -p build && cd build
Z="electron-v$EV-win32-x64.zip"
[ -f "$Z" ] || curl -fsSLO "https://github.com/electron/electron/releases/download/v$EV/$Z"
curl -fsSL "https://github.com/electron/electron/releases/download/v$EV/SHASUMS256.txt" -o SHASUMS256.txt
grep " \*$Z\$" SHASUMS256.txt | sed 's/ \*/  /' | sha256sum -c -
rm -rf "Open Compendium" upd ./*.zip.tmp
unzip -q "$Z" -d "Open Compendium"
cd "Open Compendium"
rm -f resources/default_app.asar
find locales -type f ! -name en-US.pak ! -name lt.pak -delete
mv electron.exe "Open Compendium.exe"
${BRAND_RUNNER:-node} "$ROOT/tools/brand.mjs" "Open Compendium.exe" "$ROOT/tools/icon.ico" "$VER"
mkdir -p resources/app && cp -r "$ROOT/app/." resources/app/ && cp "$ROOT/tools/icon.ico" resources/app/
sed "s/VERSION/${VER%.0}/" "$ROOT/dist-files/README.txt" > README.txt
mkdir -p Characters/Deleted Characters/Killed Data "Libraries/Compendium" "Libraries/Character Builder" portraits
cp "$ROOT/dist-files/README - portraits.txt" portraits/
cp "$ROOT/dist-files/Libraries/open-compendium-core.part" Libraries/
cd ..
rm -f "Open-Compendium-$VER.zip" "Open-Compendium-$VER-update.zip"
zip -qr "Open-Compendium-$VER.zip" "Open Compendium"
mkdir -p upd/resources && cp -r "Open Compendium/resources/app" upd/resources/ && cp "Open Compendium/README.txt" upd/
mkdir -p upd/Libraries && cp "Open Compendium/Libraries/open-compendium-core.part" upd/Libraries/
sed "s/VERSION/${VER%.0}/g" "$ROOT/dist-files/HOW TO UPDATE.txt" > "upd/HOW TO UPDATE.txt"
(cd upd && zip -qr "../Open-Compendium-$VER-update.zip" .)
rm -rf upd
sha256sum "Open-Compendium-$VER.zip" "Open-Compendium-$VER-update.zip" | tee SHA256SUMS.txt
