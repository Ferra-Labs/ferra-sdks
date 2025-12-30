const SHIFT_32 = 32n
const SHIFT_64 = 64n
const SHIFT_96 = 96n
const SHIFT_128 = 128n
const SHIFT_192 = 192n

export function encodeU32ToU128(values: number[]): bigint[] {
  const packed: bigint[] = []
  const len = values.length

  for (let i = 0; i < len; i += 4) {
    const v0 = BigInt(values[i] >>> 0) // Ensure u32 range
    const v1 = i + 1 < len ? BigInt(values[i + 1] >>> 0) : 0n
    const v2 = i + 2 < len ? BigInt(values[i + 2] >>> 0) : 0n
    const v3 = i + 3 < len ? BigInt(values[i + 3] >>> 0) : 0n

    const pack = (v3 << SHIFT_96) | (v2 << SHIFT_64) | (v1 << SHIFT_32) | v0

    packed.push(pack)
  }

  return packed
}

export function encodeU64ToU256(values: bigint[]): bigint[] {
  const packed: bigint[] = []
  const len = values.length

  for (let i = 0; i < len; i += 4) {
    const v0 = i < len ? values[i] : 0n // This check is always true but kept for consistency
    const v1 = i + 1 < len ? values[i + 1] : 0n
    const v2 = i + 2 < len ? values[i + 2] : 0n
    const v3 = i + 3 < len ? values[i + 3] : 0n

    const pack = (v3 << SHIFT_192) | (v2 << SHIFT_128) | (v1 << SHIFT_64) | v0

    packed.push(pack)
  }

  return packed
}
