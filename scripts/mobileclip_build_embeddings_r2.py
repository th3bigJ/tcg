#!/usr/bin/env python3
"""
Wrapper around mobileclip_build_embeddings that fetches card images
directly from R2 using S3 credentials instead of public HTTP.

Usage:
    python scripts/mobileclip_build_embeddings_r2.py [--limit N] [--batch-size N]
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# --- R2 client setup --------------------------------------------------------

import boto3
from botocore.config import Config

R2_BUCKET = os.environ.get("R2_BUCKET", "tcg")
R2_ENDPOINT = os.environ["R2_ENDPOINT"]
R2_ACCESS_KEY_ID = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_ACCESS_KEY = os.environ["R2_SECRET_ACCESS_KEY"]

_s3 = boto3.client(
    "s3",
    endpoint_url=R2_ENDPOINT,
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name="auto",
    config=Config(signature_version="s3v4"),
)


def _resolve_image_bytes_r2(
    image_path: str,
    image_root: Path | None,
    media_base_url: str | None,
) -> bytes:
    """Fetch image from R2 bucket using S3 API."""
    key = image_path.lstrip("/")
    try:
        resp = _s3.get_object(Bucket=R2_BUCKET, Key=key)
        return resp["Body"].read()
    except Exception as exc:
        raise FileNotFoundError(f"R2 fetch failed for key '{key}': {exc}") from exc


# --- Monkey-patch and run ---------------------------------------------------

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

import mobileclip_build_embeddings as _mod

REPO_ROOT = _mod.REPO_ROOT

_mod.resolve_image_bytes = _resolve_image_bytes_r2


def _to_public_asset_path(path: Path) -> str:
    """Handle both absolute and relative paths under the repo."""
    try:
        relative = path.resolve().relative_to(REPO_ROOT)
    except ValueError:
        # path is already relative (e.g. "public/models/...")
        relative = Path(str(path))
    parts = relative.parts
    if parts and parts[0] == "public":
        return "/" + Path(*parts[1:]).as_posix()
    return "/" + relative.as_posix()


_mod.to_public_asset_path = _to_public_asset_path

if __name__ == "__main__":
    _mod.main()
