#!/usr/bin/env python3

from __future__ import annotations

import argparse
import statistics
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch

from mobileclip_common import (
    DEFAULT_MODEL_NAME,
    DEFAULT_PRETRAINED,
    infer_image_size,
    load_image_encoder,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a quick CPU benchmark for the PyTorch and ONNX MobileCLIP image encoder."
    )
    parser.add_argument(
        "--onnx-model",
        default="public/models/mobileclip/mobileclip_s2_image_encoder.onnx",
    )
    parser.add_argument("--model-name", default=DEFAULT_MODEL_NAME)
    parser.add_argument("--pretrained", default=DEFAULT_PRETRAINED)
    parser.add_argument("--checkpoint-path")
    parser.add_argument("--runs", type=int, default=20)
    parser.add_argument("--warmup", type=int, default=5)
    parser.add_argument("--device", default="cpu")
    return parser.parse_args()


def benchmark_torch(model: torch.nn.Module, sample: torch.Tensor, warmup: int, runs: int) -> list[float]:
    with torch.no_grad():
        for _ in range(warmup):
            model(sample)

        timings: list[float] = []
        for _ in range(runs):
            start = time.perf_counter()
            model(sample)
            timings.append((time.perf_counter() - start) * 1000)

    return timings


def benchmark_onnx(session: ort.InferenceSession, sample: np.ndarray, warmup: int, runs: int) -> list[float]:
    for _ in range(warmup):
        session.run(None, {"image": sample})

    timings: list[float] = []
    for _ in range(runs):
        start = time.perf_counter()
        session.run(None, {"image": sample})
        timings.append((time.perf_counter() - start) * 1000)

    return timings


def summarize(label: str, timings: list[float]) -> None:
    print(
        f"{label}: mean={statistics.mean(timings):.2f} ms, "
        f"median={statistics.median(timings):.2f} ms, "
        f"min={min(timings):.2f} ms, max={max(timings):.2f} ms"
    )


def main() -> None:
    args = parse_args()
    onnx_path = Path(args.onnx_model)
    loaded = load_image_encoder(
        model_name=args.model_name,
        pretrained=args.pretrained,
        checkpoint_path=args.checkpoint_path,
        device=args.device,
    )
    image_size = infer_image_size(loaded.preprocess)
    sample = torch.randn(1, 3, image_size, image_size, device=args.device)

    torch_timings = benchmark_torch(loaded.encoder, sample, args.warmup, args.runs)
    ort_session = ort.InferenceSession(onnx_path.as_posix(), providers=["CPUExecutionProvider"])
    ort_timings = benchmark_onnx(
        ort_session,
        sample.cpu().numpy(),
        args.warmup,
        args.runs,
    )

    print(f"Model: {args.model_name}")
    print(f"Input shape: 1x3x{image_size}x{image_size}")
    if onnx_path.exists():
        print(f"ONNX size: {onnx_path.stat().st_size / (1024 * 1024):.2f} MB")
    summarize("PyTorch CPU", torch_timings)
    summarize("ONNX Runtime CPU", ort_timings)


if __name__ == "__main__":
    main()
