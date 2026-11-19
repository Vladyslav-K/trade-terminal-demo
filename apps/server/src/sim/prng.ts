export interface Prng {
  // Float in [0, 1).
  next(): number;
  // Integer in [min, max], both ends inclusive.
  nextInt(min: number, max: number): number;
  // Standard normal value: mean 0, deviation 1.
  nextGaussian(): number;
}

const UINT32_RANGE = 4294967296;

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

export function createPrng(seed: number): Prng {
  const next = mulberry32(seed);
  let spareGaussian = 0;
  let hasSpareGaussian = false;

  const nextInt = (min: number, max: number): number =>
    min + Math.floor(next() * (max - min + 1));

  // Box-Muller produces two values per call; the second one is kept for the next call.
  const nextGaussian = (): number => {
    if (hasSpareGaussian) {
      hasSpareGaussian = false;
      return spareGaussian;
    }

    let radiusSource = next();
    while (radiusSource === 0) {
      radiusSource = next();
    }
    const radius = Math.sqrt(-2 * Math.log(radiusSource));
    const angle = 2 * Math.PI * next();

    spareGaussian = radius * Math.sin(angle);
    hasSpareGaussian = true;
    return radius * Math.cos(angle);
  };

  return { next, nextInt, nextGaussian };
}
