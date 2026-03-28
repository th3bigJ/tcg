import * as ort from "onnxruntime-web";

export type ScanPoint = {
  x: number;
  y: number;
};

type RemapGrid = {
  width: number;
  height: number;
  values: Float32Array | Float64Array;
  coordinateRange: "minusOneToOne" | "zeroToOne";
};

export type CardCornerDetection = {
  corners: [ScanPoint, ScanPoint, ScanPoint, ScanPoint];
  inferenceMs: number;
  inputWidth: number;
  inputHeight: number;
  modelSource: string;
  outputMode: "corner-points" | "remap-grid";
  remapGrid?: RemapGrid;
};

const DEFAULT_MODEL_URL = "/models/card-corners.onnx";
const DEFAULT_UNWARP_WIDTH = 496;
const DEFAULT_UNWARP_HEIGHT = 720;
const MISSING_DEFAULT_MODEL_MESSAGE =
  "No default ONNX model was found at /models/card-corners.onnx. Load a local .onnx model or add one to public/models/card-corners.onnx.";

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
  const width = typeof dims[3] === "number" ? dims[3] : DEFAULT_UNWARP_WIDTH;
  const height = typeof dims[2] === "number" ? dims[2] : DEFAULT_UNWARP_HEIGHT;
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

function normalizeOutputCoordinate(
  value: number,
  range: RemapGrid["coordinateRange"],
  size: number,
) {
  if (range === "minusOneToOne") {
    return ((value + 1) / 2) * size;
  }
  return value * size;
}

function parsePointOutput(
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

function gridIndex(grid: RemapGrid, channel: 0 | 1, row: number, col: number) {
  return channel * grid.width * grid.height + row * grid.width + col;
}

function readGridPoint(
  grid: RemapGrid,
  row: number,
  col: number,
  sourceWidth: number,
  sourceHeight: number,
): ScanPoint {
  const xValue = grid.values[gridIndex(grid, 0, row, col)] ?? 0;
  const yValue = grid.values[gridIndex(grid, 1, row, col)] ?? 0;

  return {
    x: clamp(normalizeOutputCoordinate(xValue, grid.coordinateRange, sourceWidth), 0, sourceWidth),
    y: clamp(normalizeOutputCoordinate(yValue, grid.coordinateRange, sourceHeight), 0, sourceHeight),
  };
}

function parseGridOutput(
  tensor: ort.Tensor,
  sourceWidth: number,
  sourceHeight: number,
): { corners: [ScanPoint, ScanPoint, ScanPoint, ScanPoint]; remapGrid: RemapGrid } {
  const dims = tensor.dims;
  if (dims.length < 4) {
    throw new Error("The ONNX remap grid output did not have the expected dimensions.");
  }

  const gridHeight = Number(dims[dims.length - 2] ?? 0);
  const gridWidth = Number(dims[dims.length - 1] ?? 0);
  if (!gridHeight || !gridWidth) {
    throw new Error("The ONNX remap grid output dimensions were invalid.");
  }

  const values = tensor.data as Float32Array | Float64Array;
  const valueSample = Array.from(values.slice(0, Math.min(512, values.length)));
  const minValue = Math.min(...valueSample);
  const coordinateRange: RemapGrid["coordinateRange"] =
    minValue < 0 ? "minusOneToOne" : "zeroToOne";

  const remapGrid: RemapGrid = {
    width: gridWidth,
    height: gridHeight,
    values,
    coordinateRange,
  };

  const corners = orderCorners([
    readGridPoint(remapGrid, 0, 0, sourceWidth, sourceHeight),
    readGridPoint(remapGrid, 0, gridWidth - 1, sourceWidth, sourceHeight),
    readGridPoint(remapGrid, gridHeight - 1, gridWidth - 1, sourceWidth, sourceHeight),
    readGridPoint(remapGrid, gridHeight - 1, 0, sourceWidth, sourceHeight),
  ]);

  return { corners, remapGrid };
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
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("Failed to load model") ||
      message.includes("failed to load external data file") ||
      message.includes("No such file") ||
      message.includes("404")
    ) {
      throw new Error(MISSING_DEFAULT_MODEL_MESSAGE);
    }
    throw error;
  }
}

function sampleSourceImage(data: Uint8ClampedArray, width: number, height: number, point: ScanPoint) {
  const x = clamp(point.x, 0, width - 1);
  const y = clamp(point.y, 0, height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const wx = x - x0;
  const wy = y - y0;
  const index = (xx: number, yy: number) => (yy * width + xx) * 4;

  const topLeft = index(x0, y0);
  const topRight = index(x1, y0);
  const bottomLeft = index(x0, y1);
  const bottomRight = index(x1, y1);

  const rgba = [0, 1, 2, 3].map((channel) => {
    const top =
      (data[topLeft + channel] ?? 0) * (1 - wx) + (data[topRight + channel] ?? 0) * wx;
    const bottom =
      (data[bottomLeft + channel] ?? 0) * (1 - wx) + (data[bottomRight + channel] ?? 0) * wx;
    return top * (1 - wy) + bottom * wy;
  });

  return rgba as [number, number, number, number];
}

function interpolateGridPoint(
  grid: RemapGrid,
  xRatio: number,
  yRatio: number,
  sourceWidth: number,
  sourceHeight: number,
) {
  const gridX = xRatio * (grid.width - 1);
  const gridY = yRatio * (grid.height - 1);
  const x0 = Math.floor(gridX);
  const y0 = Math.floor(gridY);
  const x1 = Math.min(grid.width - 1, x0 + 1);
  const y1 = Math.min(grid.height - 1, y0 + 1);
  const wx = gridX - x0;
  const wy = gridY - y0;

  const p00 = readGridPoint(grid, y0, x0, sourceWidth, sourceHeight);
  const p10 = readGridPoint(grid, y0, x1, sourceWidth, sourceHeight);
  const p01 = readGridPoint(grid, y1, x0, sourceWidth, sourceHeight);
  const p11 = readGridPoint(grid, y1, x1, sourceWidth, sourceHeight);

  const topX = p00.x * (1 - wx) + p10.x * wx;
  const topY = p00.y * (1 - wx) + p10.y * wx;
  const bottomX = p01.x * (1 - wx) + p11.x * wx;
  const bottomY = p01.y * (1 - wx) + p11.y * wx;

  return {
    x: topX * (1 - wy) + bottomX * wy,
    y: topY * (1 - wy) + bottomY * wy,
  };
}

export function renderDetectionCrop(
  sourceCanvas: HTMLCanvasElement,
  detection: CardCornerDetection,
) {
  if (!detection.remapGrid) {
    const xs = detection.corners.map((point) => point.x);
    const ys = detection.corners.map((point) => point.y);
    const minX = clamp(Math.floor(Math.min(...xs)), 0, sourceCanvas.width);
    const minY = clamp(Math.floor(Math.min(...ys)), 0, sourceCanvas.height);
    const maxX = clamp(Math.ceil(Math.max(...xs)), 0, sourceCanvas.width);
    const maxY = clamp(Math.ceil(Math.max(...ys)), 0, sourceCanvas.height);
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = width;
    cropCanvas.height = height;
    const cropCtx = cropCanvas.getContext("2d");
    if (!cropCtx) {
      throw new Error("Could not create crop canvas.");
    }
    cropCtx.drawImage(sourceCanvas, minX, minY, width, height, 0, 0, width, height);
    return cropCanvas;
  }

  const outputWidth = detection.inputWidth || DEFAULT_UNWARP_WIDTH;
  const outputHeight = detection.inputHeight || DEFAULT_UNWARP_HEIGHT;
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = outputWidth;
  cropCanvas.height = outputHeight;
  const cropCtx = cropCanvas.getContext("2d");
  const sourceCtx = sourceCanvas.getContext("2d");
  if (!cropCtx || !sourceCtx) {
    throw new Error("Could not create unwarp canvases.");
  }

  const sourceImage = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const outputImage = cropCtx.createImageData(outputWidth, outputHeight);

  for (let y = 0; y < outputHeight; y += 1) {
    const yRatio = outputHeight === 1 ? 0 : y / (outputHeight - 1);
    for (let x = 0; x < outputWidth; x += 1) {
      const xRatio = outputWidth === 1 ? 0 : x / (outputWidth - 1);
      const sourcePoint = interpolateGridPoint(
        detection.remapGrid,
        xRatio,
        yRatio,
        sourceCanvas.width,
        sourceCanvas.height,
      );
      const [r, g, b, a] = sampleSourceImage(
        sourceImage.data,
        sourceImage.width,
        sourceImage.height,
        sourcePoint,
      );
      const index = (y * outputWidth + x) * 4;
      outputImage.data[index] = Math.round(r);
      outputImage.data[index + 1] = Math.round(g);
      outputImage.data[index + 2] = Math.round(b);
      outputImage.data[index + 3] = Math.round(a);
    }
  }

  cropCtx.putImageData(outputImage, 0, 0);
  return cropCanvas;
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

  if (tensorOutput.dims.length >= 4 && Number(tensorOutput.dims[1] ?? 0) === 2) {
    const { corners, remapGrid } = parseGridOutput(tensorOutput, source.width, source.height);
    return {
      corners,
      inferenceMs,
      inputWidth: width,
      inputHeight: height,
      modelSource,
      outputMode: "remap-grid",
      remapGrid,
    };
  }

  return {
    corners: parsePointOutput(tensorOutput, width, height, source.width, source.height),
    inferenceMs,
    inputWidth: width,
    inputHeight: height,
    modelSource,
    outputMode: "corner-points",
  };
}
