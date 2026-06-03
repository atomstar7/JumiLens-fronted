export interface LoadedData {
  normalized: Float32Array;
  min: number;
  max: number;
  mean: number;
  std: number;
}

export async function loadTimeStep(step: number): Promise<LoadedData> {
  const filename = `${step.toString().padStart(4, '0')}.dat`;
  const response = await fetch(`/assets/Nyx/${filename}`);

  if (!response.ok) {
    throw new Error(`Failed to load ${filename}: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const raw = new Float32Array(buffer);

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < raw.length; i++) {
    const value = raw[i];
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
    sumSq += value * value;
  }

  const mean = sum / raw.length;
  const variance = sumSq / raw.length - mean * mean;
  const std = Math.sqrt(Math.max(variance, 0));

  const N = 128;
  const N2 = N * N;
  const normalized = new Float32Array(raw.length);
  const range = max - min;

  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      for (let z = 0; z < N; z++) {
        const colMajorIdx = z + N * y + N2 * x;
        const rowMajorIdx = x + N * y + N2 * z;
        normalized[rowMajorIdx] = (raw[colMajorIdx] - min) / range;
      }
    }
  }

  return { normalized, min, max, mean, std };
}
