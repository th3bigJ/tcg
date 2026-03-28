export type CardVisualFingerprint = {
  dHash: string;
  aHash: string;
  avgRgb: [number, number, number];
};

export function hexToBitCount(char: string): number {
  switch (char.toLowerCase()) {
    case "0":
      return 0;
    case "1":
    case "2":
    case "4":
    case "8":
      return 1;
    case "3":
    case "5":
    case "6":
    case "9":
    case "a":
    case "c":
      return 2;
    case "7":
    case "b":
    case "d":
    case "e":
      return 3;
    case "f":
      return 4;
    default:
      return 0;
  }
}

export function hexHammingDistance(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  let distance = 0;

  for (let index = 0; index < length; index += 1) {
    const xorNibble = (Number.parseInt(left[index] ?? "0", 16) ^ Number.parseInt(right[index] ?? "0", 16))
      .toString(16);
    distance += hexToBitCount(xorNibble);
  }

  return distance + Math.abs(left.length - right.length) * 4;
}

export function rgbDistance(
  left: [number, number, number],
  right: [number, number, number],
): number {
  const dr = left[0] - right[0];
  const dg = left[1] - right[1];
  const db = left[2] - right[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}
