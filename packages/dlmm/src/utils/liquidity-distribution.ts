import { Decimal } from 'decimal.js'
import { Big } from 'big.js'
import { fromDecimalsAmount, toDecimalsAmount } from './common'

export namespace DistributionUtils {
  function parseEther(v: string) {
    return BigInt(toDecimalsAmount(v, 18))
  }

  export const SPOT = 'SPOT'
  export const CURVE = 'CURVE'
  export const BID_ASK = 'BID_ASK'
  export type LiquidityDistribution = typeof SPOT | typeof CURVE | typeof BID_ASK

  export const LiquidityDistribution = {
    SPOT,
    CURVE,
    BID_ASK,
  } as const

  export interface LiquidityDistributionParams {
    deltaIds: number[]
    distributionX: bigint[]
    distributionY: bigint[]
  }

  /**
 * Returns distribution params for on-chain addLiquidity() call
 * 
 * @param {LiquidityDistribution} distribution 
 * @returns {LiquidityDistributionParams}
}
 */
  // const getLiquidityConfig = (
  //   distribution: LiquidityDistribution
  // ): LiquidityDistributionParams => {
  //   switch (distribution) {
  //     case LiquidityDistribution.SPOT:
  //       return spotUniform
  //     case LiquidityDistribution.CURVE:
  //       return curve
  //     case LiquidityDistribution.BID_ASK:
  //       return bidAsk
  //   }
  // }

  /**
   * Returns distribution params for on-chain addLiquidity() call when liquidity is focused at a target bin
   * @param {number} activeId
   * @param {number} targetBin
   * @returns {LiquidityDistributionParams}
   */
  export const fromTargetBin = (activeId: number, targetBin: number): LiquidityDistributionParams => {
    const change = targetBin - activeId
    return {
      deltaIds: [targetBin],
      distributionX: change >= 0 ? [parseEther('1')] : [parseEther('0')],
      distributionY: change <= 0 ? [parseEther('1')] : [parseEther('0')],
    }
  }

  export const normalizeDist = (dist: bigint[], sumTo: bigint, precision: bigint): bigint[] => {
    const sumDist = dist.reduce((sum, cur) => sum + cur, BigInt(0))
    if (sumDist === BigInt(0)) {
      return dist
    }
    const factor = (sumDist * precision) / sumTo
    const normalized = dist.map((d) => (d * precision) / factor)
    return normalized
  }

  type CreateSpotParams = {
    activeId: number
    binRange: [number, number]
    parsedAmounts: [AmountA: Decimal, AmountB: Decimal]
  }

  type CreateBidAskParams = {
    activeId: number
    binRange: [from: number, to: number]
    parsedAmounts: [AmountA: Decimal, AmountB: Decimal]
  }

  type CreateCurveParams = {
    activeId: number
    binRange: [from: number, to: number]
    parsedAmounts: [AmountA: Decimal, AmountB: Decimal]
    alpha: number
  }

  type CreateDistributionParams<T extends LiquidityDistribution> = T extends typeof SPOT
    ? CreateSpotParams
    : T extends typeof BID_ASK
      ? CreateBidAskParams
      : CreateCurveParams

  export function createParams<T extends LiquidityDistribution>(type: T, params: CreateDistributionParams<T>): LiquidityDistributionParams {
    let { activeId, binRange, parsedAmounts } = params as CreateBidAskParams

    const [parsedAmountA, parsedAmountB] = parsedAmounts

    let isEmptyOne = false
    let missingRange: number[] = []

    if (parsedAmountA.isZero()) {
      missingRange = [binRange[0], activeId]
      binRange = [activeId, binRange[1]]
      parsedAmounts = parsedAmounts.reverse() as [Decimal, Decimal]
      isEmptyOne = true
    } else if (parsedAmountB.isZero()) {
      missingRange = [activeId + 1, binRange[1]]
      binRange = [binRange[0], activeId]
      parsedAmounts = parsedAmounts.reverse() as [Decimal, Decimal]
      isEmptyOne = true
    }
    let res
    switch (type) {
      case LiquidityDistribution.SPOT: {
        res = getUniformFromBinRange(activeId, binRange, parsedAmounts)
        if (parsedAmountA.isZero()) {
          res.distributionX.push(0n)
        } else if (parsedAmountB.isZero()) {
          res.distributionY.push(0n)
        }
        break
      }

      case LiquidityDistribution.BID_ASK: {
        res = getBidAskFromBinRange(activeId, binRange, parsedAmounts)
        break
      }

      case LiquidityDistribution.CURVE:
      default:
        const { alpha } = params as CreateCurveParams
        res = getCurveFromBinRange(activeId, binRange, parsedAmounts, alpha)
    }

    res.distributionX = formatDistribution(res.distributionX.map((v) => BigInt(fromDecimalsAmount(v.toString(), 9).toFixed(0))))
    res.distributionY = formatDistribution(res.distributionY.map((v) => BigInt(fromDecimalsAmount(v.toString(), 9).toFixed(0))))

    if (isEmptyOne) {
      const missingBins = createListBins(missingRange[0], missingRange[1])
      const emptyDistribution = createEmptyDistribution(missingRange[0], missingRange[1])

      if (parsedAmountA.isZero()) {
        return {
          deltaIds: missingBins.concat(res.deltaIds),
          distributionX: emptyDistribution.concat(res.distributionX),
          distributionY: emptyDistribution.concat(res.distributionY),
        }
      } else {
        return {
          deltaIds: res.deltaIds.concat(missingBins),
          distributionX: res.distributionX.concat(emptyDistribution),
          distributionY: res.distributionY.concat(emptyDistribution),
        }
      }
    }

    return res
  }

  /**
   * @deprecated
   * @param distribution
   * @returns
   */
  function reverseDistribution(distribution: LiquidityDistributionParams): LiquidityDistributionParams {
    return {
      deltaIds: distribution.deltaIds,
      distributionX: distribution.distributionY,
      distributionY: distribution.distributionX,
    }
  }

  const getUniformFromBinRange = (
    activeId: number,
    binRange: [from: number, to: number],
    amounts: [AmountA: Decimal, AmountB: Decimal]
  ): LiquidityDistributionParams => {
    const ONE = BigInt(10) ** BigInt(18)

    const deltaIds: number[] = []
    const distributionX: bigint[] = []
    const distributionY: bigint[] = []

    const [amountX, amountY] = amounts

    let nb_x = BigInt(0)
    let nb_y = BigInt(0)

    for (let binId = binRange[0]; binId <= binRange[1]; binId++) {
      if (binId > activeId) {
        nb_x += BigInt(2)
      } else if (binId < activeId) {
        nb_y += BigInt(2)
      } else {
        nb_x += BigInt(1)
        nb_y += BigInt(1)
      }
    }

    for (let binId = binRange[0]; binId <= binRange[1]; binId++) {
      if (binId > activeId) {
        distributionX.push((BigInt(2) * ONE) / nb_x)
        distributionY.push(BigInt(0))
      } else if (binId < activeId) {
        distributionX.push(BigInt(0))
        distributionY.push((BigInt(2) * ONE) / nb_y)
      } else {
        if (amountX.isZero()) {
          distributionY.push((BigInt(2) * ONE) / nb_y)
        } else if (amountY.isZero()) {
          distributionX.push((BigInt(2) * ONE) / nb_x)
        } else {
          distributionX.push(ONE / nb_x)
          distributionY.push(ONE / nb_x)
        }
      }
      deltaIds.push(binId - activeId)
    }

    return {
      deltaIds: deltaIds.map((v) => activeId + v),
      distributionX: distributionY,
      distributionY: distributionX,
    }
  }

  const getBidAskFromBinRange = (
    activeId: number,
    binRange: [from: number, to: number],
    parsedAmounts: [AmountA: Decimal, AmountB: Decimal]
  ): LiquidityDistributionParams => {
    const [parsedAmountA, parsedAmountB] = parsedAmounts

    const deltaIds: number[] = []
    const distributionX: bigint[] = []
    const distributionY: bigint[] = []

    let nb_x = 0
    let nb_y = 0
    for (let binId = binRange[0]; binId <= binRange[1]; binId++) {
      const weight = Math.abs(binId - activeId) + 1

      if (binId >= activeId) {
        nb_x += 2 * weight
      }
      if (binId <= activeId) {
        nb_y += 2 * weight
      }
      if (binId === activeId) {
        if (parsedAmountB.greaterThan('0')) {
          nb_x -= weight
        }
        if (parsedAmountA.greaterThan('0')) {
          nb_y -= weight
        }
      }
    }

    for (let binId = binRange[0]; binId <= binRange[1]; binId++) {
      let dist_x = BigInt(0)
      let dist_y = BigInt(0)

      const weight = parseEther(`${Math.abs(binId - activeId) + 1}`)

      if (binId >= activeId && parsedAmountA.greaterThan('0')) {
        dist_x = (BigInt(2) * weight) / BigInt(nb_x)
      }

      if (binId <= activeId && parsedAmountB.greaterThan('0')) {
        dist_y = (BigInt(2) * weight) / BigInt(nb_y)
      }

      if (binId === activeId && parsedAmountA.greaterThan('0') && parsedAmountB.greaterThan('0')) {
        dist_x /= BigInt(2)
        dist_y /= BigInt(2)
      }

      if (dist_x > 0 || dist_y > 0) {
        distributionX.push(dist_x)
        distributionY.push(dist_y)
        deltaIds.push(binId - activeId)
      }
    }

    return {
      deltaIds: deltaIds.map((v) => activeId + v),
      distributionX: distributionY,
      distributionY: distributionX,
    }
  }

  /**
   * Returns Curve distribution params for custom bin range
   *
   * @param {number} activeId
   * @param {number[]} binRange
   * @param {CurrencyAmount[]} parsedAmounts
   * @param {number} alpha
   * @returns
   */
  const getCurveFromBinRange = (
    activeId: number,
    binRange: [from: number, to: number],
    parsedAmounts: [AmountA: Decimal, AmountB: Decimal],
    alpha: number = 1 / 10
  ): LiquidityDistributionParams => {
    if (alpha > 1) {
      throw new Error('Alpha must be between 0 and 1')
    }

    const [parsedAmountA, parsedAmountB] = parsedAmounts

    const ONE = BigInt(10) ** BigInt(18)

    const deltaIds: number[] = []
    const distributionX: bigint[] = []
    const distributionY: bigint[] = []

    Big.RM = Big.roundDown
    const getGaussianDistribution = (x: number, sigma: number): bigint => {
      if (sigma === 0) return BigInt(10 ** 18)

      const val = new Big(Math.exp(-((x / sigma) ** 2) / 2)).times(10 ** 18).round()
      const int = BigInt(val.toString())
      return int
    }

    const getSigma = (radius: number, alpha: number): number => {
      const denominator = Math.sqrt(-2 * Math.log(alpha))
      if (denominator === 0) return 0

      return radius / denominator
    }

    const radius_x = Math.abs(binRange[1] - activeId)
    const radius_y = Math.abs(binRange[0] - activeId)

    const sigma_x = getSigma(radius_x, alpha)
    const sigma_y = getSigma(radius_y, alpha)

    let nb_x = BigInt(0)
    let nb_y = BigInt(0)

    for (let binId = binRange[0]; binId <= binRange[1]; binId++) {
      const deltaId = binId - activeId
      let dist_x = BigInt(0)
      let dist_y = BigInt(0)

      if (deltaId >= 0 && parsedAmountA.greaterThan('0')) {
        dist_x = BigInt(2) * getGaussianDistribution(deltaId, sigma_x)
      }

      if (deltaId <= 0 && parsedAmountB.greaterThan('0')) {
        dist_y = BigInt(2) * getGaussianDistribution(deltaId, sigma_y)
      }

      if (deltaId === 0 && parsedAmountA.greaterThan('0') && parsedAmountB.greaterThan('0')) {
        dist_x /= BigInt(2)
        dist_y /= BigInt(2)
      }

      nb_x += dist_x
      nb_y += dist_y

      if (dist_x > 0 || dist_y > 0) {
        distributionX.push(dist_x)
        distributionY.push(dist_y)
        deltaIds.push(deltaId)
      }
    }

    for (let i = 0; i < distributionX.length; i++) {
      if (nb_x > 0) {
        distributionX[i] = (BigInt(distributionX[i]) * ONE) / BigInt(nb_x)
      } else {
        distributionX[i] = BigInt(0)
      }
      if (nb_y > 0) {
        distributionY[i] = (BigInt(distributionY[i]) * ONE) / BigInt(nb_y)
      } else {
        distributionY[i] = BigInt(0)
      }
    }

    return {
      deltaIds: deltaIds.map((v) => activeId + v),
      distributionX: distributionY,
      distributionY: distributionX,
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
