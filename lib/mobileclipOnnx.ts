import * as ort from "onnxruntime-web";

import { loadMobileClipEmbeddingMetadata } from "@/lib/mobileclipEmbeddingIndex";

type MobileClipSessionBundle = {
  session: ort.InferenceSession;
  metadata: Awaited<ReturnType<typeof loadMobileClipEmbeddingMetadata>>;
};

let defaultSessionPromise: Promise<MobileClipSessionBundle> | null = null;

function imageToNormalizedTensor(
  source: CanvasImageSource,
  inputSize: number,
  mean: number[],
  std: number[],
) {
  const canvas = document.createElement("canvas");
  canvas.width = inputSize;
  canvas.height = inputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create a canvas context for MobileCLIP preprocessing.");
  }

  ctx.drawImage(source, 0, 0, inputSize, inputSize);
  const imageData = ctx.getImageData(0, 0, inputSize, inputSize);
  const pixels = imageData.data;
  const planeSize = inputSize * inputSize;
  const data = new Float32Array(planeSize * 3);

  for (let index = 0; index < planeSize; index += 1) {
    const pixelOffset = index * 4;
    data[index] = (pixels[pixelOffset] / 255 - (mean[0] ?? 0)) / (std[0] ?? 1);
    data[index + planeSize] = (pixels[pixelOffset + 1] / 255 - (mean[1] ?? 0)) / (std[1] ?? 1);
    data[index + planeSize * 2] =
      (pixels[pixelOffset + 2] / 255 - (mean[2] ?? 0)) / (std[2] ?? 1);
  }

  return new ort.Tensor("float32", data, [1, 3, inputSize, inputSize]);
}

async function createSessionBundle(metadataPath: string) {
  const metadata = await loadMobileClipEmbeddingMetadata(metadataPath);
  const session = await ort.InferenceSession.create(metadata.onnxModelPath, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
  return { session, metadata };
}

export async function loadMobileClipSession(
  metadataPath = "/models/mobileclip/card-embeddings.json",
) {
  if (metadataPath !== "/models/mobileclip/card-embeddings.json") {
    return createSessionBundle(metadataPath);
  }

  if (!defaultSessionPromise) {
    defaultSessionPromise = createSessionBundle(metadataPath);
  }

  try {
    return await defaultSessionPromise;
  } catch (error) {
    defaultSessionPromise = null;
    throw error;
  }
}

export async function embedImageWithMobileClip(
  source: CanvasImageSource,
  metadataPath = "/models/mobileclip/card-embeddings.json",
) {
  const { session, metadata } = await loadMobileClipSession(metadataPath);
  const tensor = imageToNormalizedTensor(
    source,
    metadata.encoder.inputSize,
    metadata.encoder.mean,
    metadata.encoder.std,
  );
  const outputs = await session.run({ image: tensor });
  const embeddingName = session.outputNames[0];
  const embedding = outputs[embeddingName];
  if (!embedding || embedding.type !== "float32") {
    throw new Error("MobileCLIP ONNX session did not return a float32 embedding tensor.");
  }

  const values = embedding.data as Float32Array;
  return values.slice(0, metadata.embeddingDim);
}
