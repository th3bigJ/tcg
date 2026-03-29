#!/usr/bin/env python3

from __future__ import annotations

import argparse
from pathlib import Path

import torch

from mobileclip_common import (
    DEFAULT_MODEL_NAME,
    DEFAULT_PRETRAINED,
    build_metadata,
    infer_image_size,
    load_image_encoder,
    save_metadata,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export the MobileCLIP image encoder to ONNX for browser inference."
    )
    parser.add_argument("--model-name", default=DEFAULT_MODEL_NAME)
    parser.add_argument("--pretrained", default=DEFAULT_PRETRAINED)
    parser.add_argument("--checkpoint-path")
    parser.add_argument(
        "--output",
        default="public/models/mobileclip/mobileclip_s2_image_encoder.onnx",
    )
    parser.add_argument("--metadata-output")
    parser.add_argument("--opset", type=int, default=18)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--batch-size", type=int, default=1)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_path = Path(args.output)
    metadata_path = (
        Path(args.metadata_output)
        if args.metadata_output
        else output_path.with_suffix(".json")
    )

    loaded = load_image_encoder(
        model_name=args.model_name,
        pretrained=args.pretrained,
        checkpoint_path=args.checkpoint_path,
        device=args.device,
    )
    image_size = infer_image_size(loaded.preprocess)
    dummy = torch.randn(args.batch_size, 3, image_size, image_size, device=args.device)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with torch.no_grad():
        torch.onnx.export(
            loaded.encoder,
            dummy,
            output_path.as_posix(),
            input_names=["image"],
            output_names=["embedding"],
            dynamic_axes={
                "image": {0: "batch"},
                "embedding": {0: "batch"},
            },
            opset_version=args.opset,
            do_constant_folding=True,
        )

    metadata = build_metadata(loaded, output_path, args.opset)
    save_metadata(metadata, metadata_path)

    size_mb = output_path.stat().st_size / (1024 * 1024)
    external_data_path = output_path.with_suffix(output_path.suffix + ".data")
    external_data_size_mb = (
        external_data_path.stat().st_size / (1024 * 1024)
        if external_data_path.exists()
        else 0.0
    )
    total_size_mb = size_mb + external_data_size_mb
    print(f"Exported ONNX model to {output_path} ({size_mb:.2f} MB)")
    if external_data_path.exists():
        print(
            f"Exported ONNX external data to {external_data_path} "
            f"({external_data_size_mb:.2f} MB, total {total_size_mb:.2f} MB)"
        )
    print(f"Saved metadata to {metadata_path}")
    print(f"Input shape: 1x3x{image_size}x{image_size}")
    print(f"Embedding dimension: {loaded.embedding_dim}")


if __name__ == "__main__":
    main()
