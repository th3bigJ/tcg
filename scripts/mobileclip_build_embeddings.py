#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import io
import json
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

import numpy as np
import onnxruntime as ort
from PIL import Image


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ONNX_MODEL = REPO_ROOT / "public/models/mobileclip/mobileclip_s2_image_encoder.onnx"
DEFAULT_ONNX_METADATA = REPO_ROOT / "public/models/mobileclip/mobileclip_s2_image_encoder.json"
DEFAULT_OUTPUT_BINARY = REPO_ROOT / "public/models/mobileclip/card-embeddings.f32"
DEFAULT_OUTPUT_METADATA = REPO_ROOT / "public/models/mobileclip/card-embeddings.json"
DEFAULT_DATA_DIR = REPO_ROOT / "data/pokemon/cards"
DEFAULT_SETS_PATH = REPO_ROOT / "data/pokemon/sets.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a browser-friendly MobileCLIP card embedding index from the local card catalog."
    )
    parser.add_argument("--onnx-model", default=str(DEFAULT_ONNX_MODEL))
    parser.add_argument("--onnx-metadata", default=str(DEFAULT_ONNX_METADATA))
    parser.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR))
    parser.add_argument("--output-binary", default=str(DEFAULT_OUTPUT_BINARY))
    parser.add_argument("--output-metadata", default=str(DEFAULT_OUTPUT_METADATA))
    parser.add_argument("--sets-path", default=str(DEFAULT_SETS_PATH))
    parser.add_argument("--image-root")
    parser.add_argument("--media-base-url")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--set-code")
    parser.add_argument("--high-res", action="store_true")
    return parser.parse_args()


def load_encoder_metadata(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def iter_cards(data_dir: Path, set_code: str | None) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    paths = [data_dir / f"{set_code}.json"] if set_code else sorted(data_dir.glob("*.json"))
    for path in paths:
        if not path.exists():
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(payload, list):
            cards.extend(card for card in payload if isinstance(card, dict))
    return cards


def load_set_name_map(sets_path: Path) -> dict[str, str]:
    if not sets_path.exists():
        return {}
    payload = json.loads(sets_path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        return {}

    set_name_map: dict[str, str] = {}
    for item in payload:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        set_key = item.get("setKey")
        if isinstance(name, str) and name and isinstance(set_key, str) and set_key:
            set_name_map[set_key] = name
    return set_name_map


def build_card_record(card: dict[str, Any], image_path: str, set_name_map: dict[str, str]) -> dict[str, Any]:
    image_low_src = card.get("imageLowSrc")
    filename = image_path.split("?")[0].split("/")[-1]
    set_code = card.get("setCode")

    return {
        "masterCardId": card.get("masterCardId"),
        "externalId": card.get("externalId"),
        "setCode": set_code,
        "setName": set_name_map.get(set_code or "") if isinstance(set_code, str) else None,
        "cardNumber": card.get("cardNumber"),
        "cardName": card.get("cardName"),
        "fullDisplayName": card.get("fullDisplayName"),
        "rarity": card.get("rarity"),
        "lowSrc": image_low_src,
        "highSrc": card.get("imageHighSrc"),
        "filename": filename,
        "image": image_path,
    }


def resolve_image_bytes(
    image_path: str,
    image_root: Path | None,
    media_base_url: str | None,
) -> bytes:
    normalized = image_path.lstrip("/")
    if image_root is not None:
        candidate = image_root / normalized
        if candidate.exists():
            return candidate.read_bytes()

    repo_candidate = REPO_ROOT / normalized
    if repo_candidate.exists():
        return repo_candidate.read_bytes()

    public_candidate = REPO_ROOT / "public" / normalized
    if public_candidate.exists():
        return public_candidate.read_bytes()

    if media_base_url:
        url = urllib.parse.urljoin(media_base_url.rstrip("/") + "/", normalized)
        with urllib.request.urlopen(url) as response:
            return response.read()

    raise FileNotFoundError(
        f"Could not resolve image '{image_path}'. Provide --image-root or --media-base-url."
    )


def preprocess_image(image_bytes: bytes, input_size: int, mean: list[float], std: list[float]) -> np.ndarray:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB").resize((input_size, input_size))
    array = np.asarray(image, dtype=np.float32) / 255.0
    mean_array = np.asarray(mean, dtype=np.float32).reshape(1, 1, 3)
    std_array = np.asarray(std, dtype=np.float32).reshape(1, 1, 3)
    normalized = (array - mean_array) / std_array
    chw = np.transpose(normalized, (2, 0, 1))
    return chw


def batched(items: list[dict[str, Any]], batch_size: int) -> list[list[dict[str, Any]]]:
    return [items[index : index + batch_size] for index in range(0, len(items), batch_size)]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def to_public_asset_path(path: Path) -> str:
    relative = path.relative_to(REPO_ROOT)
    parts = relative.parts
    if parts and parts[0] == "public":
        return "/" + Path(*parts[1:]).as_posix()
    return "/" + relative.as_posix()


def main() -> None:
    args = parse_args()
    onnx_model = Path(args.onnx_model)
    onnx_metadata = Path(args.onnx_metadata)
    output_binary = Path(args.output_binary)
    output_metadata = Path(args.output_metadata)
    sets_path = Path(args.sets_path)
    image_root = Path(args.image_root) if args.image_root else None
    data_dir = Path(args.data_dir)

    encoder_metadata = load_encoder_metadata(onnx_metadata)
    input_shape = encoder_metadata["input"]["shape"]
    input_size = int(input_shape[-1])
    mean = [float(value) for value in encoder_metadata["input"]["mean"]]
    std = [float(value) for value in encoder_metadata["input"]["std"]]
    embedding_dim = int(encoder_metadata["output"]["shape"][-1])
    set_name_map = load_set_name_map(sets_path)

    all_cards = iter_cards(data_dir, args.set_code)
    selected_cards: list[dict[str, Any]] = []
    missing_images: list[dict[str, Any]] = []

    for card in all_cards:
        image_path = card.get("imageHighSrc") if args.high_res else card.get("imageLowSrc")
        if not image_path:
            continue
        selected_cards.append(build_card_record(card, image_path, set_name_map))
        if args.limit is not None and len(selected_cards) >= args.limit:
            break

    if not selected_cards:
        raise SystemExit("No cards with images were found for embedding generation.")

    session = ort.InferenceSession(onnx_model.as_posix(), providers=["CPUExecutionProvider"])
    output_binary.parent.mkdir(parents=True, exist_ok=True)
    output_metadata.parent.mkdir(parents=True, exist_ok=True)

    embeddings_rows: list[np.ndarray] = []
    records: list[dict[str, Any]] = []

    for batch in batched(selected_cards, args.batch_size):
        batch_tensors: list[np.ndarray] = []
        batch_records: list[dict[str, Any]] = []

        for record in batch:
            try:
                image_bytes = resolve_image_bytes(record["image"], image_root, args.media_base_url)
            except Exception as exc:
                missing_images.append(
                    {
                        "masterCardId": record.get("masterCardId"),
                        "image": record["image"],
                        "error": str(exc),
                    }
                )
                continue

            batch_tensors.append(preprocess_image(image_bytes, input_size, mean, std))
            batch_records.append(record)

        if not batch_tensors:
            continue

        batch_array = np.stack(batch_tensors, axis=0).astype(np.float32)
        outputs = session.run(None, {"image": batch_array})[0]
        if outputs.shape[-1] != embedding_dim:
            raise SystemExit(
                f"Unexpected embedding dimension {outputs.shape[-1]} (expected {embedding_dim})."
            )
        embeddings_rows.append(outputs.astype(np.float32))
        records.extend(batch_records)
        print(f"Embedded {len(records)} cards", flush=True)

    if not records:
        raise SystemExit("No embeddings were produced. Check image resolution settings and media paths.")

    embeddings = np.concatenate(embeddings_rows, axis=0)
    embeddings.tofile(output_binary)

    metadata = {
        "format": "float32-row-major",
        "metric": "cosine",
        "count": len(records),
        "embeddingDim": embedding_dim,
        "binaryPath": to_public_asset_path(output_binary),
        "onnxModelPath": to_public_asset_path(onnx_model),
        "onnxExternalDataPath": (
            to_public_asset_path(Path(encoder_metadata["onnx"]["external_data_path"]))
            if encoder_metadata.get("onnx", {}).get("external_data_path")
            else None
        ),
        "onnxModelSha256": sha256_file(onnx_model),
        "encoder": {
            "modelName": encoder_metadata["model_name"],
            "pretrained": encoder_metadata["pretrained"],
            "inputSize": input_size,
            "mean": mean,
            "std": std,
        },
        "cards": records,
        "missingImages": missing_images,
    }
    output_metadata.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    size_mb = output_binary.stat().st_size / (1024 * 1024)
    print(f"Wrote {len(records)} embeddings to {output_binary} ({size_mb:.2f} MB)")
    print(f"Wrote metadata to {output_metadata}")
    if missing_images:
        print(f"Skipped {len(missing_images)} cards with missing or unreadable images")


if __name__ == "__main__":
    main()
