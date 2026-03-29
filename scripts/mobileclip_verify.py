#!/usr/bin/env python3

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch

from mobileclip_common import (
    DEFAULT_MODEL_NAME,
    DEFAULT_PRETRAINED,
    load_image_encoder,
    preprocess_image,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compare PyTorch MobileCLIP image embeddings with ONNX Runtime output."
    )
    parser.add_argument("--image", required=True)
    parser.add_argument(
        "--onnx-model",
        default="public/models/mobileclip/mobileclip_s2_image_encoder.onnx",
    )
    parser.add_argument("--model-name", default=DEFAULT_MODEL_NAME)
    parser.add_argument("--pretrained", default=DEFAULT_PRETRAINED)
    parser.add_argument("--checkpoint-path")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--rtol", type=float, default=1e-3)
    parser.add_argument("--atol", type=float, default=1e-4)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    image_path = Path(args.image)
    onnx_path = Path(args.onnx_model)

    loaded = load_image_encoder(
        model_name=args.model_name,
        pretrained=args.pretrained,
        checkpoint_path=args.checkpoint_path,
        device=args.device,
    )
    image_tensor = preprocess_image(image_path, loaded, args.device)

    with torch.no_grad():
        torch_output = loaded.encoder(image_tensor).cpu().numpy()

    session = ort.InferenceSession(onnx_path.as_posix(), providers=["CPUExecutionProvider"])
    ort_output = session.run(None, {"image": image_tensor.cpu().numpy()})[0]

    max_abs_diff = float(np.max(np.abs(torch_output - ort_output)))
    cosine_similarity = float(
        np.sum(torch_output * ort_output)
        / (np.linalg.norm(torch_output) * np.linalg.norm(ort_output))
    )
    close = np.allclose(torch_output, ort_output, rtol=args.rtol, atol=args.atol)

    print(f"Model: {args.model_name}")
    print(f"Image: {image_path}")
    print(f"ONNX: {onnx_path}")
    print(f"Embedding shape: {torch_output.shape}")
    print(f"Cosine similarity: {cosine_similarity:.8f}")
    print(f"Max absolute difference: {max_abs_diff:.8f}")
    print(f"Allclose (rtol={args.rtol}, atol={args.atol}): {close}")

    if not close:
        raise SystemExit("ONNX output diverged from PyTorch output beyond tolerance.")


if __name__ == "__main__":
    main()
