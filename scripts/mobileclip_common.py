#!/usr/bin/env python3

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import torch
import torch.nn.functional as F
from PIL import Image

try:
    import open_clip
except ImportError as exc:  # pragma: no cover - surfaced to the CLI
    raise SystemExit(
        "open_clip_torch is not installed. Follow docs/mobileclip-export.md first."
    ) from exc

try:
    from mobileclip.modules.common.mobileone import reparameterize_model
except ImportError as exc:  # pragma: no cover - surfaced to the CLI
    raise SystemExit(
        "mobileclip is not installed. Install dependencies from scripts/requirements-mobileclip.txt."
    ) from exc


DEFAULT_MODEL_NAME = "MobileCLIP-S2"
DEFAULT_PRETRAINED = "datacompdr"


@dataclass
class LoadedModel:
    encoder: torch.nn.Module
    preprocess: Any
    model_name: str
    pretrained: str
    embedding_dim: int


class NormalizedImageEncoder(torch.nn.Module):
    def __init__(self, clip_model: torch.nn.Module) -> None:
        super().__init__()
        self.clip_model = clip_model

    def forward(self, image: torch.Tensor) -> torch.Tensor:
        features = self.clip_model.encode_image(image)
        return F.normalize(features, dim=-1)


def default_model_kwargs(model_name: str) -> dict[str, Any]:
    # Apple notes that the smaller MobileCLIP variants use identity normalization.
    if model_name.endswith("S3") or model_name.endswith("S4") or model_name.endswith("L-14"):
        return {}
    return {"image_mean": (0.0, 0.0, 0.0), "image_std": (1.0, 1.0, 1.0)}


def load_image_encoder(
    model_name: str = DEFAULT_MODEL_NAME,
    pretrained: str = DEFAULT_PRETRAINED,
    checkpoint_path: str | None = None,
    device: str = "cpu",
) -> LoadedModel:
    kwargs = default_model_kwargs(model_name)
    pretrained_arg = checkpoint_path or pretrained

    clip_model, _, preprocess = open_clip.create_model_and_transforms(
        model_name,
        pretrained=pretrained_arg,
        **kwargs,
    )
    clip_model.eval()
    clip_model = reparameterize_model(clip_model)
    clip_model.eval()
    clip_model.to(device)

    encoder = NormalizedImageEncoder(clip_model).to(device)
    encoder.eval()

    embedding_dim = int(getattr(clip_model.visual, "output_dim", 0) or 0)
    if embedding_dim <= 0:
        with torch.no_grad():
            dummy = torch.zeros(1, 3, infer_image_size(preprocess), infer_image_size(preprocess))
            embedding_dim = int(encoder(dummy.to(device)).shape[-1])

    return LoadedModel(
        encoder=encoder,
        preprocess=preprocess,
        model_name=model_name,
        pretrained=pretrained_arg,
        embedding_dim=embedding_dim,
    )


def infer_image_size(preprocess: Any) -> int:
    for transform in getattr(preprocess, "transforms", []):
        size = getattr(transform, "size", None)
        if isinstance(size, tuple) and len(size) == 2:
            return int(size[0])
        if isinstance(size, int):
            return int(size)
    return 256


def infer_mean_std(preprocess: Any) -> tuple[list[float], list[float]]:
    mean = [0.0, 0.0, 0.0]
    std = [1.0, 1.0, 1.0]
    for transform in getattr(preprocess, "transforms", []):
        if hasattr(transform, "mean") and hasattr(transform, "std"):
            mean = [float(value) for value in transform.mean]
            std = [float(value) for value in transform.std]
    return mean, std


def build_metadata(loaded: LoadedModel, onnx_path: Path, opset: int) -> dict[str, Any]:
    image_size = infer_image_size(loaded.preprocess)
    mean, std = infer_mean_std(loaded.preprocess)
    external_data_path = onnx_path.with_suffix(onnx_path.suffix + ".data")

    return {
        "model_name": loaded.model_name,
        "pretrained": loaded.pretrained,
        "embedding_dim": loaded.embedding_dim,
        "input": {
            "name": "image",
            "shape": [1, 3, image_size, image_size],
            "dtype": "float32",
            "mean": mean,
            "std": std,
        },
        "output": {
            "name": "embedding",
            "shape": [1, loaded.embedding_dim],
            "dtype": "float32",
            "normalized": True,
        },
        "onnx": {
            "path": str(onnx_path),
            "opset": opset,
            "external_data_path": str(external_data_path) if external_data_path.exists() else None,
            "size_bytes": onnx_path.stat().st_size if onnx_path.exists() else 0,
            "external_data_size_bytes": (
                external_data_path.stat().st_size if external_data_path.exists() else 0
            ),
        },
    }


def save_metadata(metadata: dict[str, Any], metadata_path: Path) -> None:
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")


def preprocess_image(image_path: Path, loaded: LoadedModel, device: str) -> torch.Tensor:
    image = Image.open(image_path).convert("RGB")
    tensor = loaded.preprocess(image).unsqueeze(0).to(device)
    return tensor
