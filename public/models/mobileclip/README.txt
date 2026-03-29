Place exported MobileCLIP image encoder artifacts here.

Large external weight shards (*.onnx.data) are stored with Git LFS. After cloning,
run: git lfs install && git lfs pull

Expected default outputs from scripts/mobileclip_export.py:
- mobileclip_s2_image_encoder.onnx
- mobileclip_s2_image_encoder.json
- mobileclip_s2_image_encoder.onnx.data (when external weights are emitted)

Expected default outputs from scripts/mobileclip_build_embeddings.py:
- card-embeddings.f32
- card-embeddings.json

Smoke-test fallback:
- scripts/mobileclip_build_smoketest_index.py can generate a tiny placeholder index so the browser pipeline can be exercised before the real card image corpus is available.
