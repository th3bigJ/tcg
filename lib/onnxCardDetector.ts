import * as ort from "onnxruntime-web";

export type ScanPoint = {
  x: number;
  y: number;
};

export type CardCornerDetection = {
  corners: [ScanPoint, ScanPoint, ScanPoint, ScanPoint];
  inferenceMs: number;
  inputWidth: number;
  inputHeight: number;
  modelSource: string;
};

const DEFAULT_MODEL_URL = "/models/card-corners.onnx";

let defaultSessionPromise: Promise<ort.InferenceSession> | null = null;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function orderCorners(points: ScanPoint[]): [ScanPoint, ScanPoint, ScanPoint, ScanPoint] {
  const sortedBySum = [...points].sort((left, right) => left.x + left.y - (right.x + right.y));
  const topLeft = sortedBySum[0]!;
  const bottomRight = sortedBySum[sortedBySum.length - 1]!;

  const remaining = points.filter((point) => point !== topLeft && point !== bottomRight);
  const sortedByDiff = remaining.sort((left, right) => left.x - left.y - (right.x - right.y));
  const topRight = sortedByDiff[sortedByDiff.length - 1]!;
  const bottomLeft = sortedByDiff[0]!;

  return [topLeft, topRight, bottomRight, bottomLeft];
}

function getInputSize(session: ort.InferenceSession) {
  const inputName = session.inputNames[0];
  if (!inputName) {
    throw new Error("The ONNX model has no inputs.");
  }

  const metadata = session.inputMetadata[0];
  if (!metadata?.isTensor) {
    throw new Error("The ONNX model input is not a tensor.");
  }

  const dims = metadata.shape ?? [];
  const width = typeof dims[3] === "number" ? dims[3] : 640;
  const height = typeof dims[2] === "number" ? dims[2] : 640;
  return { inputName, width, height };
}

function imageToTensor(source: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create a canvas context for ONNX preprocessing.");
  }

  ctx.drawImage(source, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const data = new Float32Array(width * height * 3);

  for (let index = 0; index < width * height; index += 1) {
    const pixelOffset = index * 4;
    data[index] = (pixels[pixelOffset] ?? 0) / 255;
    data[index + width * height] = (pixels[pixelOffset + 1] ?? 0) / 255;
    data[index + width * height * 2] = (pixels[pixelOffset + 2] ?? 0) / 255;
  }

  return new ort.Tensor("float32", data, [1, 3, height, width]);
}

function readFirstFloatTensor(outputs: Record<string, ort.Tensor>): ort.Tensor {
  for (const outputName of Object.keys(outputs)) {
    const tensor = outputs[outputName];
    if (tensor?.type === "float32" || tensor?.type === "float64") {
      return tensor;
    }
  }
  throw new Error("The ONNX model did not return a float tensor output.");
}

function parseCorners(
  tensor: ort.Tensor,
  modelWidth: number,
  modelHeight: number,
  sourceWidth: number,
  sourceHeight: number,
): [ScanPoint, ScanPoint, ScanPoint, ScanPoint] {
  const values = Array.from(tensor.data as Float32Array | Float64Array);
  if (values.length < 8) {
    throw new Error("The ONNX model did not output 4 corners.");
  }

  const raw = values.slice(0, 8);
  const maxValue = Math.max(...raw.map((value) => Math.abs(value)));

  const points: ScanPoint[] = [];
  for (let index = 0; index < 8; index += 2) {
    let x = raw[index] ?? 0;
    let y = raw[index + 1] ?? 0;

    if (maxValue <= 1.5) {
      x *= sourceWidth;
      y *= sourceHeight;
    } else {
      x = (x / modelWidth) * sourceWidth;
      y = (y / modelHeight) * sourceHeight;
    }

    points.push({
      x: clamp(x, 0, sourceWidth),
      y: clamp(y, 0, sourceHeight),
    });
  }

  return orderCorners(points);
}

async function createSessionFromArrayBuffer(arrayBuffer: ArrayBuffer) {
  return ort.InferenceSession.create(arrayBuffer, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
}

export async function loadCardCornerSession(modelFile?: File | null) {
  if (modelFile) {
    const session = await createSessionFromArrayBuffer(await modelFile.arrayBuffer());
    return { session, modelSource: modelFile.name };
  }

  if (!defaultSessionPromise) {
    defaultSessionPromise = ort.InferenceSession.create(DEFAULT_MODEL_URL, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
  }

  try {
    const session = await defaultSessionPromise;
    return { session, modelSource: DEFAULT_MODEL_URL };
  } catch (error) {
    defaultSessionPromise = null;
    throw error;
  }
}

export async function detectCardCorners(
  source: ImageBitmap,
  modelFile?: File | null,
): Promise<CardCornerDetection> {
  const { session, modelSource } = await loadCardCornerSession(modelFile);
  const { inputName, width, height } = getInputSize(session);
  const tensor = imageToTensor(source, width, height);
  const start = performance.now();
  const outputs = await session.run({ [inputName]: tensor });
  const inferenceMs = performance.now() - start;
  const tensorOutput = readFirstFloatTensor(outputs);
  const corners = parseCorners(tensorOutput, width, height, source.width, source.height);

  return {
    corners,
    inferenceMs,
    inputWidth: width,
    inputHeight: height,
    modelSource,
  };
}
