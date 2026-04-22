#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(pwd)"
BP_DIR="$ROOT_DIR/ClayBucket_BP"
RP_DIR="$ROOT_DIR/ClayBucket_RP"
DIST_DIR="$ROOT_DIR/dist"
STAGING_DIR="$DIST_DIR/staging"

BP_VERSION="$(node -e "const manifest = require('$BP_DIR/manifest.json'); console.log(manifest.header.version.join('.'));")"
ARCHIVE_PATH="$DIST_DIR/ClayBucket-${BP_VERSION}.zip"
MCADDON_PATH="$DIST_DIR/ClayBucket-${BP_VERSION}.mcaddon"

echo "[1/4] Installing BP dependencies (if needed) and compiling TypeScript..."
if [ ! -d "$BP_DIR/node_modules" ]; then
	npm --prefix "$BP_DIR" install
fi
npm --prefix "$BP_DIR" run build

echo "[2/4] Preparing clean staging directory..."
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR/ClayBucket_BP" "$STAGING_DIR/ClayBucket_RP"

rsync -a \
	--exclude '.git/' \
	--exclude '.idea/' \
	--exclude 'node_modules/' \
	--exclude 'src/' \
	--exclude 'package.json' \
	--exclude 'package-lock.json' \
	--exclude 'tsconfig.json' \
	--exclude '*.tsbuildinfo' \
	--exclude '.DS_Store' \
	"$BP_DIR/" "$STAGING_DIR/ClayBucket_BP/"

rsync -a \
	--exclude '.git/' \
	--exclude '.idea/' \
	--exclude 'node_modules/' \
	--exclude '.DS_Store' \
	"$RP_DIR/" "$STAGING_DIR/ClayBucket_RP/"

echo "[3/4] Creating zip archive..."
mkdir -p "$DIST_DIR"
rm -f "$ARCHIVE_PATH"
(
	cd "$STAGING_DIR"
	zip -rq "$ARCHIVE_PATH" ClayBucket_BP ClayBucket_RP
)

echo "[4/4] Creating mcaddon archive..."
rm -f "$MCADDON_PATH"
(
	cd "$STAGING_DIR"
	zip -rq "$MCADDON_PATH" ClayBucket_BP ClayBucket_RP
)

echo "Done: $ARCHIVE_PATH"
echo "Done: $MCADDON_PATH"
