import { Decimal } from 'decimal.js'

// export namespace DistributionUtils {
//   function parseEther(v: string) {
//     return BigInt(toDecimalsAmount(v, 18))
//   }
// //tôi cần một hàm gen distribution,

//   export type LiquidityDistribution = typeof SPOT | typeof CURVE | typeof BID_ASK

//   export interface LiquidityDistributionParams {
//     deltaIds: number[]
//     distributionX: bigint[]
//     distributionY: bigint[]
//   }

//   interface DistributionParams {
//     activeId: number;
//     binRange: [from: number, to: number];
//     parsedAmounts: [AmountA: Decimal, AmountB: Decimal];
//     alpha?: number;
//   }

// }

export namespace DistributionUtils {
  const PRECISION = 10n ** 9n // 1e18 for percentage precision

  type DistributionType = 'SPOT' | 'CURVE' | 'BID_ASK'
  export const SPOT = 'SPOT'
  export const CURVE = 'CURVE'
  export const BID_ASK = 'BID_ASK'
  export const LiquidityDistribution = {
    SPOT,
    CURVE,
    BID_ASK,
  } as const

  export interface DistributionParams {
    activeId: number
    binRange: [from: number, to: number]
    parsedAmounts: [AmountA: Decimal, AmountB: Decimal]
    alpha?: number
  }

  export interface LiquidityDistributionParams {
    deltaIds: number[]
    ids: number[]
    distributionX: bigint[]
    distributionY: bigint[]
  }

  /**
   * Generate distribution for liquidity across bins
   *
   * Rules:
   * - ActiveId: The only bin that can contain BOTH X and Y tokens
   * - Bins to the LEFT of activeId (id < activeId): Only Y tokens
   * - Bins to the RIGHT of activeId (id > activeId): Only X tokens
   *
   * ActiveId Special Handling:
   * - In SPOT: Total liquidity at activeId (X + Y) equals liquidity at any other bin
   * - In CURVE: Gets proportional weight from both X and Y distributions based on curve
   * - In BID_ASK: Gets minimal liquidity (bottom of the V shape)
   *
   * @param type - Type of distribution: SPOT, CURVE, or BID_ASK
   * @param params - Distribution parameters
   * @returns Distribution with deltaIds and percentage distributions
   */
  export function createParams(type: DistributionType, params: DistributionParams): LiquidityDistributionParams {
    const { activeId, binRange, parsedAmounts, alpha = 1 } = params
    const [from, to] = binRange

    // Validate range
    if (from > to) {
      throw new Error('Invalid bin range: from must be <= to')
    }

    // Generate deltaIds (relative to activeId)
    const deltaIds: number[] = []
    for (let id = from; id <= to; id++) {
      deltaIds.push(id - activeId)
    }

    let distributionX: bigint[] = []
    let distributionY: bigint[] = []

    switch (type) {
      case 'SPOT':
        ;({ distributionX, distributionY } = generateSpotDistribution(deltaIds, activeId, parsedAmounts))
        break

      case 'CURVE':
        ;({ distributionX, distributionY } = generateCurveDistribution(deltaIds, activeId, parsedAmounts, alpha))
        break

      case 'BID_ASK':
        ;({ distributionX, distributionY } = generateBidAskDistribution(deltaIds, activeId, parsedAmounts))
        break

      default:
        throw new Error(`Unknown distribution type: ${type}`)
    }

    return { deltaIds: deltaIds.map((v) => v + activeId), distributionX, distributionY, ids: deltaIds.map((v) => v + activeId) }
  }

  /**
   * SPOT distribution: Equal token amounts across all bins
   * The total liquidity at activeId (X + Y) equals the liquidity at any other bin
   */
  function generateSpotDistribution(
    deltaIds: number[],
    activeId: number,
    parsedAmounts: [Decimal, Decimal]
  ): { distributionX: bigint[]; distributionY: bigint[] } {
    const [amountX, amountY] = parsedAmounts
    const hasX = amountX.gt(0)
    const hasY = amountY.gt(0)

    const distributionX: bigint[] = []
    const distributionY: bigint[] = []

    // Count eligible bins for each token
    let xBinCount = 0
    let yBinCount = 0
    let hasActiveId = false

    for (const deltaId of deltaIds) {
      const currentId = activeId + deltaId
      if (currentId > activeId && hasX) xBinCount++ // Right bins for X
      if (currentId < activeId && hasY) yBinCount++ // Left bins for Y
      if (currentId === activeId) hasActiveId = true
    }

    // For activeId: it should get half from X distribution and half from Y distribution
    // This ensures total liquidity at activeId equals other bins
    if (hasActiveId) {
      if (hasX) xBinCount += 0.5
      if (hasY) yBinCount += 0.5
    }

    // Calculate distributions (already accounts for activeId's half weight)
    const xPerBin = xBinCount > 0 ? Number(PRECISION) / xBinCount : 0
    const yPerBin = yBinCount > 0 ? Number(PRECISION) / yBinCount : 0

    // For activeId: since we counted it as 0.5 in each distribution,
    // it should get (xPerBin * 0.5) and (yPerBin * 0.5)
    const xActiveAmount = hasActiveId && hasX ? xPerBin * 0.5 : 0
    const yActiveAmount = hasActiveId && hasY ? yPerBin * 0.5 : 0

    for (const deltaId of deltaIds) {
      const currentId = activeId + deltaId

      if (currentId < activeId) {
        // Left of active: only Y tokens
        distributionX.push(0n)
        if (hasY) {
          distributionY.push(BigInt(Math.floor(yPerBin)))
        } else {
          distributionY.push(0n)
        }
      } else if (currentId > activeId) {
        // Right of active: only X tokens
        if (hasX) {
          distributionX.push(BigInt(Math.floor(xPerBin)))
        } else {
          distributionX.push(0n)
        }
        distributionY.push(0n)
      } else {
        // Active bin: gets calculated share from each token type
        distributionX.push(BigInt(Math.floor(xActiveAmount)))
        distributionY.push(BigInt(Math.floor(yActiveAmount)))
      }
    }

    // Normalize to ensure sum equals PRECISION
    if (hasX) normalizeDistribution(distributionX)
    if (hasY) normalizeDistribution(distributionY)

    return { distributionX, distributionY }
  }

  /**
   * CURVE distribution: Normal/Gaussian distribution centered around activeId
   * The total liquidity at activeId comes from both X and Y distributions
   */
  function generateCurveDistribution(
    deltaIds: number[],
    activeId: number,
    parsedAmounts: [Decimal, Decimal],
    alpha: number
  ): { distributionX: bigint[]; distributionY: bigint[] } {
    const [amountX, amountY] = parsedAmounts
    const hasX = amountX.gt(0)
    const hasY = amountY.gt(0)

    const distributionX: bigint[] = []
    const distributionY: bigint[] = []

    // Calculate weights using normal distribution
    const weights: number[] = []
    let totalWeightX = 0
    let totalWeightY = 0
    let activeIndex = -1

    for (let i = 0; i < deltaIds.length; i++) {
      const deltaId = deltaIds[i]
      const currentId = activeId + deltaId

      if (currentId === activeId) activeIndex = i

      // Normal distribution formula: e^(-(x^2)/(2*sigma^2))
      const sigma = deltaIds.length / (4 * alpha)
      const weight = Math.exp(-(deltaId ** 2) / (2 * sigma ** 2))
      weights.push(weight)

      // Accumulate weights for normalization
      // X tokens go to bins >= activeId, but activeId only gets half weight
      if (currentId > activeId && hasX) {
        totalWeightX += weight
      } else if (currentId === activeId) {
        if (hasX) totalWeightX += weight / 2
        if (hasY) totalWeightY += weight / 2
      }

      // Y tokens go to bins <= activeId, but activeId only gets half weight
      if (currentId < activeId && hasY) {
        totalWeightY += weight
      }
    }

    // Normalize and convert to bigint distributions
    for (let i = 0; i < deltaIds.length; i++) {
      const currentId = activeId + deltaIds[i]
      const weight = weights[i]

      if (currentId < activeId) {
        // Left of active: only Y tokens
        distributionX.push(0n)
        if (hasY && totalWeightY > 0) {
          const yDist = BigInt(Math.floor(Number(PRECISION) * (weight / totalWeightY)))
          distributionY.push(yDist)
        } else {
          distributionY.push(0n)
        }
      } else if (currentId > activeId) {
        // Right of active: only X tokens
        if (hasX && totalWeightX > 0) {
          const xDist = BigInt(Math.floor(Number(PRECISION) * (weight / totalWeightX)))
          distributionX.push(xDist)
        } else {
          distributionX.push(0n)
        }
        distributionY.push(0n)
      } else {
        // Active bin: half weight from each distribution
        if (hasX && totalWeightX > 0) {
          const xDist = BigInt(Math.floor(Number(PRECISION) * (weight / 2 / totalWeightX)))
          distributionX.push(xDist)
        } else {
          distributionX.push(0n)
        }

        if (hasY && totalWeightY > 0) {
          const yDist = BigInt(Math.floor(Number(PRECISION) * (weight / 2 / totalWeightY)))
          distributionY.push(yDist)
        } else {
          distributionY.push(0n)
        }
      }
    }

    // Adjust to ensure sum equals PRECISION for non-zero amounts
    if (hasX) normalizeDistribution(distributionX)
    if (hasY) normalizeDistribution(distributionY)

    return { distributionX, distributionY }
  }

  /**
   * BID_ASK distribution: V-shaped distribution with liquidity decreasing towards activeId
   * Creates a pattern similar to order book with bids and asks
   * ActiveId gets minimal liquidity (bottom of the V)
   */
  function generateBidAskDistribution(
    deltaIds: number[],
    activeId: number,
    parsedAmounts: [Decimal, Decimal]
  ): { distributionX: bigint[]; distributionY: bigint[] } {
    const [amountX, amountY] = parsedAmounts
    const hasX = amountX.gt(0)
    const hasY = amountY.gt(0)
  
    const distributionX: bigint[] = []
    const distributionY: bigint[] = []
  
    const numBins = deltaIds.length
  
    // Initialize all distributions to 0
    for (let i = 0; i < numBins; i++) {
      distributionX.push(0n)
      distributionY.push(0n)
    }
  
    // Calculate weights for all bins with smooth transition
    let totalWeightX = 0
    let totalWeightY = 0
    const weightsX: number[] = new Array(numBins).fill(0)
    const weightsY: number[] = new Array(numBins).fill(0)
  
    // Find active bin index
    let activeIndex = -1
    for (let i = 0; i < numBins; i++) {
      if (activeId + deltaIds[i] === activeId) {
        activeIndex = i
        break
      }
    }
  
    // Calculate the ratio of X to Y for balanced active bin allocation
    let xRatio = 0.5
    let yRatio = 0.5
    
    if (hasX && hasY && amountX.gt(0) && amountY.gt(0)) {
      const total = amountX.add(amountY)
      xRatio = amountX.div(total).toNumber()
      yRatio = amountY.div(total).toNumber()
    } else if (hasX && !hasY) {
      xRatio = 1
      yRatio = 0
    } else if (!hasX && hasY) {
      xRatio = 0
      yRatio = 1
    }
  
    for (let i = 0; i < numBins; i++) {
      const currentId = activeId + deltaIds[i]
      
      if (currentId < activeId) {
        // Left side (Y tokens): weight increases with distance from activeId
        const distance = Math.abs(deltaIds[i])
        weightsY[i] = distance
        totalWeightY += distance
      } else if (currentId > activeId) {
        // Right side (X tokens): weight increases with distance from activeId
        const distance = Math.abs(deltaIds[i])
        weightsX[i] = distance
        totalWeightX += distance
      } else if (currentId === activeId) {
        // Active bin: gets minimal weight, but proportional to X/Y amounts for balance
        // Base weight is small to maintain V-shape, but distributed according to ratio
        const baseWeight = 0.5
        
        if (hasX) {
          // X weight at active bin is influenced by how much X there is relative to Y
          weightsX[i] = baseWeight * xRatio
          totalWeightX += weightsX[i]
        }
        
        if (hasY) {
          // Y weight at active bin is influenced by how much Y there is relative to X
          weightsY[i] = baseWeight * yRatio
          totalWeightY += weightsY[i]
        }
      }
    }
  
    // Apply normalized weights to distributions
    for (let i = 0; i < numBins; i++) {
      if (hasX && totalWeightX > 0 && weightsX[i] > 0) {
        distributionX[i] = BigInt(Math.floor(Number(PRECISION) * (weightsX[i] / totalWeightX)))
      }
      
      if (hasY && totalWeightY > 0 && weightsY[i] > 0) {
        distributionY[i] = BigInt(Math.floor(Number(PRECISION) * (weightsY[i] / totalWeightY)))
      }
    }
  
    // Normalize to ensure sum equals PRECISION for non-zero amounts
    if (hasX) normalizeDistribution(distributionX)
    if (hasY) normalizeDistribution(distributionY)
  
    return { distributionX, distributionY }
  }

  /**
   * Normalize distribution to ensure sum equals PRECISION (1e9)
   */
  function normalizeDistribution(distribution: bigint[]): void {
    const sum = distribution.reduce((acc, val) => acc + val, 0n)

    // If sum is 0, don't normalize (means no tokens to distribute)
    if (sum === 0n) return

    const diff = PRECISION - sum

    // Find the index with the largest value to adjust
    let maxIndex = -1
    let maxValue = 0n
    for (let i = 0; i < distribution.length; i++) {
      if (distribution[i] > maxValue) {
        maxValue = distribution[i]
        maxIndex = i
      }
    }

    // Add the difference to the largest value
    if (maxIndex >= 0 && maxValue > 0n) {
      distribution[maxIndex] += diff
    }
  }
}

function formatDistribution(distribution: bigint[]) {
  const LIMIT = 1000000000n

  const currentSum = distribution.reduce((sum, val) => sum + val, 0n)

  const difference = currentSum - LIMIT

  const nonZeroCount = distribution.filter((val) => val > 0n).length
  if (!nonZeroCount) {
    return distribution
  }
  let result = distribution

  if (difference > 0n) {
    const amountPerElement = difference / BigInt(nonZeroCount)
    const remainder = difference % BigInt(nonZeroCount)

    let remainderDistributed = 0n

    for (let i = 0; i < result.length; i++) {
      if (result[i] > 0n) {
        result[i] = result[i] - amountPerElement

        if (remainderDistributed < remainder) {
          result[i] = result[i] - 1n
          remainderDistributed++
        }
      }
    }
  } else if (difference < 0n) {
    const amountToAdd = -difference
    const amountPerElement = amountToAdd / BigInt(nonZeroCount)
    const remainder = amountToAdd % BigInt(nonZeroCount)
    let remainderDistributed = 0n

    for (let i = 0; i < result.length; i++) {
      if (result[i] > 0n) {
        result[i] = result[i] + amountPerElement

        if (remainderDistributed < remainder) {
          result[i] = result[i] + 1n
          remainderDistributed++
        }
      }
    }
  }

  return result
}

function createListBins(from: number, to: number) {
  let list: number[] = []
  for (let i = from; i < to; i++) {
    list.push(i)
  }
  return list
}

function createEmptyDistribution(from: number, to: number) {
  let list: bigint[] = []
  for (let i = from; i < to; i++) {
    list.push(0n)
  }
  return list
}
