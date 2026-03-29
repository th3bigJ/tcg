#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ONNX_MODEL = REPO_ROOT / "public/models/mobileclip/mobileclip_s2_image_encoder.onnx"
DEFAULT_ONNX_METADATA = REPO_ROOT / "public/models/mobileclip/mobileclip_s2_image_encoder.json"
DEFAULT_OUTPUT_BINARY = REPO_ROOT / "public/models/mobileclip/card-embeddings.f32"
DEFAULT_OUTPUT_METADATA = REPO_ROOT / "public/models/mobileclip/card-embeddings.json"

SMOKETEST_IMAGES = [
    {
        "masterCardId": "smoketest-water",
        "cardName": "Smoke Test Water Icon",
        "cardNumber": "SMOKE-1",
        "setCode": "demo",
        "setName": "Smoke Test",
        "image": "public/media/images/40px-Water-attack.png",
    },
    {
        "masterCardId": "smoketest-fire",
        "cardName": "Smoke Test Fire Icon",
        "cardNumber": "SMOKE-2",
        "setCode": "demo",
        "setName": "Smoke Test",
        "image": "public/media/images/40px-Fire-attack.png",
    },
    {
        "masterCardId": "smoketest-grass",
        "cardName": "Smoke Test Grass Icon",
        "cardNumber": "SMOKE-3",
        "setCode": "demo",
        "setName": "Smoke Test",
        "image": "public/media/images/40px-Grass-attack.png",
    },
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a tiny smoke-test embedding index so the browser MobileCLIP path can be exercised."
    )
    parser.add_argument("--onnx-model", default=str(DEFAULT_ONNX_MODEL))
    parser.add_argument("--onnx-metadata", default=str(DEFAULT_ONNX_METADATA))
    parser.add_argument("--output-binary", default=str(DEFAULT_OUTPUT_BINARY))
    parser.add_argument("--output-metadata", default=str(DEFAULT_OUTPUT_METADATA))
    return parser.parse_args()


def preprocess_image(image_path: Path, input_size: int, mean: list[float], std: list[float]) -> np.ndarray:
    image = Image.open(image_path).convert("RGB").resize((input_size, input_size))
    array = np.asarray(image, dtype=np.float32) / 255.0
    mean_array = np.asarray(mean, dtype=np.float32).reshape(1, 1, 3)
    std_array = np.asarray(std, dtype=np.float32).reshape(1, 1, 3)
    normalized = (array - mean_array) / std_array
    return np.transpose(normalized, (2, 0, 1))


def to_public_asset_path(path: Path) -> str:
    normalized = path if path.is_absolute() else (REPO_ROOT / path)
    relative = normalized.relative_to(REPO_ROOT)
    parts = relative.parts
    if parts and parts[0] == "public":
        return "/" + Path(*parts[1:]).as_posix()
    return "/" + relative.as_posix()


def main() -> None:
    args = parse_args()
    onnx_metadata = json.loads(Path(args.onnx_metadata).read_text(encoding="utf-8"))
    input_size = int(onnx_metadata["input"]["shape"][-1])
    mean = [float(value) for value in onnx_metadata["input"]["mean"]]
    std = [float(value) for value in onnx_metadata["input"]["std"]]
    embedding_dim = int(onnx_metadata["output"]["shape"][-1])

    session = ort.InferenceSession(str(Path(args.onnx_model)), providers=["CPUExecutionProvider"])

    vectors: list[np.ndarray] = []
    cards: list[dict[str, str | None]] = []
    for item in SMOKETEST_IMAGES:
        image_path = REPO_ROOT / item["image"]
        tensor = preprocess_image(image_path, input_size, mean, std)
        output = session.run(None, {"image": np.expand_dims(tensor, axis=0).astype(np.float32)})[0]
        vectors.append(output.astype(np.float32))
        cards.append(
            {
                "masterCardId": item["masterCardId"],
                "externalId": None,
                "tcgdexId": None,
                "setCode": item["setCode"],
                "setTcgdexId": None,
                "setName": item["setName"],
                "cardNumber": item["cardNumber"],
                "cardName": item["cardName"],
                "fullDisplayName": item["cardName"],
                "rarity": "Demo",
                "lowSrc": "/" + item["image"].replace("public/", ""),
                "highSrc": "/" + item["image"].replace("public/", ""),
                "filename": Path(item["image"]).name,
                "image": "/" + item["image"].replace("public/", ""),
            }
        )

    embeddings = np.concatenate(vectors, axis=0)
    output_binary = Path(args.output_binary)
    output_binary.parent.mkdir(parents=True, exist_ok=True)
    embeddings.tofile(output_binary)

    output_metadata = Path(args.output_metadata)
    metadata = {
        "format": "float32-row-major",
        "metric": "cosine",
        "count": len(cards),
        "embeddingDim": embedding_dim,
        "binaryPath": to_public_asset_path(output_binary),
        "onnxModelPath": to_public_asset_path(Path(args.onnx_model)),
        "onnxExternalDataPath": (
            to_public_asset_path(Path(onnx_metadata["onnx"]["external_data_path"]))
            if onnx_metadata.get("onnx", {}).get("external_data_path")
            else None
        ),
        "onnxModelSha256": "smoketest",
        "encoder": {
            "modelName": onnx_metadata["model_name"],
            "pretrained": onnx_metadata["pretrained"],
            "inputSize": input_size,
            "mean": mean,
            "std": std,
        },
        "cards": cards,
        "missingImages": [],
        "smokeTest": True,
    }
    output_metadata.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    print(f"Wrote smoke-test embeddings to {output_binary}")
    print(f"Wrote smoke-test metadata to {output_metadata}")


if __name__ == "__main__":
    main()
