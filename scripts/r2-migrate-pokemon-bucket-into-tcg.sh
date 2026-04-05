#!/usr/bin/env bash
# Copy every object from the legacy standalone "pokemon" R2 bucket into the "tcg" bucket
# under a prefix (default: pokemon/), so the app only needs R2_BUCKET=tcg and one public URL.
#
# Prerequisites: AWS CLI v2, credentials that can List/Get on source and Put on dest.
# For Cloudflare R2, set:
#   export AWS_ACCESS_KEY_ID=...
#   export AWS_SECRET_ACCESS_KEY=...
#   export R2_ACCOUNT_ID=...   # from dashboard URL
#
# Usage:
#   ./scripts/r2-migrate-pokemon-bucket-into-tcg.sh
#   DEST_PREFIX=pokemon SOURCE_BUCKET=pokemon DEST_BUCKET=tcg ./scripts/r2-migrate-pokemon-bucket-into-tcg.sh
#
# Endpoint (replace ACCOUNT_ID):
#   ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
#
set -euo pipefail

SOURCE_BUCKET="${SOURCE_BUCKET:-pokemon}"
DEST_BUCKET="${DEST_BUCKET:-tcg}"
DEST_PREFIX="${DEST_PREFIX:-pokemon}"
ENDPOINT="${ENDPOINT:-}"

if [[ -z "${ENDPOINT}" ]]; then
  echo "Set ENDPOINT to your R2 S3 API URL, e.g. https://<account_id>.r2.cloudflarestorage.com" >&2
  exit 1
fi

echo "Sync s3://${SOURCE_BUCKET} -> s3://${DEST_BUCKET}/${DEST_PREFIX}/"
aws s3 sync "s3://${SOURCE_BUCKET}" "s3://${DEST_BUCKET}/${DEST_PREFIX}" \
  --endpoint-url "${ENDPOINT}" \
  --only-show-errors

echo "Done. Set R2_BUCKET=${DEST_BUCKET}, use a single R2_PUBLIC_BASE_URL for that bucket, and optional R2_POKEMON_MEDIA_PREFIX=${DEST_PREFIX}."
