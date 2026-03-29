# MobileCLIP Export and Embeddings

This repo now includes a small Python toolchain for proving out the riskiest part of the scanner stack first:

1. load `MobileCLIP-S2`
2. export only the image encoder to ONNX
3. verify that ONNX Runtime matches PyTorch closely
4. benchmark the exported model on CPU before wiring browser inference
5. precompute card embeddings into browser-ready static assets

## Why this exists

We do not want to build the browser-side embedding pipeline until we know:

- the model exports cleanly
- the ONNX file size is acceptable
- ONNX Runtime can reproduce PyTorch embeddings
- CPU timings are at least in a plausible range for mobile/web

## Environment

Apple's MobileCLIP repo documents `Python 3.10` as the recommended setup. The scripts may work on other versions, but `3.10` is the target to use for reliable results.

Example setup:

```bash
python3.10 -m venv .venv-mobileclip
source .venv-mobileclip/bin/activate
python -m pip install --upgrade pip
python -m pip install -r scripts/requirements-mobileclip.txt
```

## Export the image encoder

This exports a browser-friendly ONNX graph plus a small JSON metadata file with the input shape and normalization settings.

```bash
python scripts/mobileclip_export.py
```

Default outputs:

- `public/models/mobileclip/mobileclip_s2_image_encoder.onnx`
- `public/models/mobileclip/mobileclip_s2_image_encoder.json`
- `public/models/mobileclip/mobileclip_s2_image_encoder.onnx.data` when ONNX external weights are emitted

Optional flags:

```bash
python scripts/mobileclip_export.py \
  --model-name MobileCLIP-S2 \
  --pretrained datacompdr \
  --output public/models/mobileclip/mobileclip_s2_image_encoder.onnx \
  --opset 18
```

If you end up downloading a checkpoint manually, pass it explicitly:

```bash
python scripts/mobileclip_export.py --checkpoint-path /path/to/mobileclip_s2.pt
```

## Verify ONNX vs PyTorch

Run a real image through both paths and compare the embeddings:

```bash
python scripts/mobileclip_verify.py \
  --image /absolute/path/to/sample-card.jpg
```

The script prints:

- embedding shape
- cosine similarity
- max absolute difference
- whether the outputs are within tolerance

## Benchmark

This is only a quick local CPU benchmark, but it gives us a first read on viability:

```bash
python scripts/mobileclip_benchmark.py
```

It reports:

- ONNX file size
- mean and median PyTorch CPU latency
- mean and median ONNX Runtime CPU latency

Observed on this machine for `MobileCLIP-S2`:

- `.onnx`: about `2.23 MB`
- external weights `.onnx.data`: about `136.94 MB`
- ONNX Runtime CPU inference: about `55-60 ms`

## Build the card embedding index

Once the ONNX export is verified, generate static embeddings for the card catalog.

```bash
python scripts/mobileclip_build_embeddings.py \
  --media-base-url https://your-public-media-host.example.com/
```

Default outputs:

- `public/models/mobileclip/card-embeddings.f32`
- `public/models/mobileclip/card-embeddings.json`

Useful flags:

```bash
python scripts/mobileclip_build_embeddings.py \
  --image-root /absolute/path/to/local/media/root \
  --batch-size 32 \
  --limit 1000
```

Notes:

- Use `--image-root` if your `cards/...` images exist on disk but outside this repo.
- Use `--media-base-url` if the card images are hosted remotely.
- Use `--limit` for the first test pass so we can validate the asset format before embedding the full 20k catalog.
- The metadata JSON includes the per-card lookup table and any images that were skipped.

## Build a smoke-test index

If the real card image corpus is not available yet, you can still exercise the full browser pipeline with a tiny demo index:

```bash
python scripts/mobileclip_build_smoketest_index.py
```

That writes a 3-item placeholder embedding index to:

- `public/models/mobileclip/card-embeddings.f32`
- `public/models/mobileclip/card-embeddings.json`

The scan page will label this as a smoke-test index so it is not confused with the real catalog.

## Notes

- The exported model only covers the image encoder, which is what we need for card embedding search.
- The output embeddings are L2-normalized already, so browser-side cosine similarity stays simple.
- Model weights come from Apple's MobileCLIP distribution terms, not a standard permissive OSS checkpoint license.
- If export fails because of unsupported ops, that is the signal to stop and adjust before building the browser pipeline further.
- Browser-side loading and cosine search helpers live in `lib/mobileclipEmbeddingIndex.ts`.
