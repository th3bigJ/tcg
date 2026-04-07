export type MobileClipEmbeddingCardRecord = {
  masterCardId: string;
  externalId: string | null;
  setCode: string | null;
  setName: string | null;
  cardNumber: string | null;
  cardName: string | null;
  fullDisplayName: string | null;
  rarity: string | null;
  lowSrc: string | null;
  highSrc: string | null;
  filename: string;
  image: string;
};

export type MobileClipEmbeddingIndexMetadata = {
  format: "float32-row-major";
  metric: "cosine";
  count: number;
  embeddingDim: number;
  binaryPath: string;
  onnxModelPath: string;
  onnxExternalDataPath?: string | null;
  onnxModelSha256: string;
  smokeTest?: boolean;
  encoder: {
    modelName: string;
    pretrained: string;
    inputSize: number;
    mean: number[];
    std: number[];
  };
  cards: MobileClipEmbeddingCardRecord[];
  missingImages: Array<{
    masterCardId: string | null;
    image: string;
    error: string;
  }>;
};

export type LoadedMobileClipEmbeddingIndex = {
  metadata: MobileClipEmbeddingIndexMetadata;
  vectors: Float32Array;
};

export type MobileClipSearchHit = {
  card: MobileClipEmbeddingCardRecord;
  score: number;
  index: number;
};

export async function probeMobileClipAssets(
  metadataPath = "/models/mobileclip/card-embeddings.json",
) {
  const metadataResponse = await fetch(metadataPath, { cache: "no-store" });
  if (!metadataResponse.ok) {
    throw new Error(`Embedding metadata is missing (${metadataResponse.status}).`);
  }

  const metadata = (await metadataResponse.json()) as MobileClipEmbeddingIndexMetadata;
  const [binaryResponse, modelResponse] = await Promise.all([
    fetch(metadata.binaryPath, { method: "HEAD", cache: "no-store" }),
    fetch(metadata.onnxModelPath, { method: "HEAD", cache: "no-store" }),
  ]);

  if (!binaryResponse.ok) {
    throw new Error(`Embedding binary is missing (${binaryResponse.status}).`);
  }
  if (!modelResponse.ok) {
    throw new Error(`MobileCLIP ONNX model is missing (${modelResponse.status}).`);
  }
  if (metadata.onnxExternalDataPath) {
    const externalDataResponse = await fetch(metadata.onnxExternalDataPath, {
      method: "HEAD",
      cache: "no-store",
    });
    if (!externalDataResponse.ok) {
      throw new Error(`MobileCLIP ONNX external data is missing (${externalDataResponse.status}).`);
    }
  }

  return metadata;
}

export async function loadMobileClipEmbeddingMetadata(
  metadataPath = "/models/mobileclip/card-embeddings.json",
) {
  const response = await fetch(metadataPath, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Failed to load embedding metadata: ${response.status}`);
  }
  return (await response.json()) as MobileClipEmbeddingIndexMetadata;
}

export async function loadMobileClipEmbeddingIndex(
  metadataPath = "/models/mobileclip/card-embeddings.json",
): Promise<LoadedMobileClipEmbeddingIndex> {
  const metadata = await loadMobileClipEmbeddingMetadata(metadataPath);
  const response = await fetch(metadata.binaryPath, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Failed to load embedding binary: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const vectors = new Float32Array(arrayBuffer);
  const expectedLength = metadata.count * metadata.embeddingDim;
  if (vectors.length !== expectedLength) {
    throw new Error(
      `Embedding binary length mismatch. Expected ${expectedLength}, received ${vectors.length}.`,
    );
  }

  return { metadata, vectors };
}

export function cosineSimilarity(
  query: Float32Array | number[],
  vectors: Float32Array,
  rowIndex: number,
  embeddingDim: number,
) {
  const offset = rowIndex * embeddingDim;
  let score = 0;
  for (let dim = 0; dim < embeddingDim; dim += 1) {
    score += (query[dim] ?? 0) * (vectors[offset + dim] ?? 0);
  }
  return score;
}

export function searchMobileClipEmbeddingIndex(
  query: Float32Array | number[],
  index: LoadedMobileClipEmbeddingIndex,
  topK = 5,
): MobileClipSearchHit[] {
  const hits: MobileClipSearchHit[] = [];
  const { embeddingDim, cards } = index.metadata;

  for (let rowIndex = 0; rowIndex < cards.length; rowIndex += 1) {
    const score = cosineSimilarity(query, index.vectors, rowIndex, embeddingDim);
    hits.push({
      index: rowIndex,
      card: cards[rowIndex]!,
      score,
    });
  }

  hits.sort((left, right) => right.score - left.score);
  return hits.slice(0, topK);
}
