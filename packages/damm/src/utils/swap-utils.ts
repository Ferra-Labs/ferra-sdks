import BN from "bn.js";
import { Pool, TickData } from "../types";

// ============================================================
// Constants
// ============================================================
const PRECISION = new BN("1000000000"); // 1e9
const MAX_FEE = new BN("500000000"); // 50%
const MAX_SQRT_PRICE_X64 = new BN("79226673515401279992447579055");
const MIN_SQRT_PRICE_X64 = new BN("4295048016");
const ONE = new BN(1);
const ZERO = new BN(0);

const COLLECT_FEE_MODE_ON_BOTH = 0;
const COLLECT_FEE_MODE_ON_QUOTE = 1;

export interface SwapStepResult {
  currentSqrtPrice: BN;
  targetSqrtPrice: BN;
  currentLiquidity: BN;
  amountIn: BN;
  amountOut: BN;
  feeAmount: BN;
  remainderAmount: BN;
}

export interface CalculatedSwapResult {
  amountIn: BN;
  amountOut: BN;
  feeAmount: BN;
  baseFee: BN;
  dynamicFee: BN;
  beforeSqrtPrice: BN;
  afterSqrtPrice: BN;
  isExceed: boolean;
  collectFeeOnInput: boolean;
  stepResults: SwapStepResult[];
}

export interface SwapQuote {
  amountIn: string;
  amountOut: string;
  feeAmount: string;
  baseFee: string;
  dynamicFee: string;
  isExceed: boolean;
  afterSqrtPrice: string;
  priceImpact: number;
  steps: number;
}

// ============================================================
// BN Utility Helpers
// ============================================================

function toBN(val: bigint | number | string | BN): BN {
  if (BN.isBN(val)) return val;
  return new BN(val.toString());
}

function mulShr(a: BN, b: BN, shift: number): BN {
  return a.mul(b).shrn(shift);
}

function mulDivFloor(a: BN, b: BN, denom: BN): BN {
  return a.mul(b).div(denom);
}

function mulDivCeil(a: BN, b: BN, denom: BN): BN {
  const product = a.mul(b);
  const result = product.div(denom);
  if (product.mod(denom).gt(ZERO)) {
    return result.add(ONE);
  }
  return result;
}

function divRound(num: BN, denom: BN, roundUp: boolean): BN {
  const result = num.div(denom);
  if (roundUp && num.mod(denom).gt(ZERO)) {
    return result.add(ONE);
  }
  return result;
}

// ============================================================
// Tick Math (Q64.64 sqrt price <-> tick)
// ============================================================

const NEG_TICK_MULTIPLIERS: BN[] = [
  new BN("18445821805675392311"),
  new BN("18444899583751176498"),
  new BN("18443055278223354162"),
  new BN("18439367220385604838"),
  new BN("18431993317065449817"),
  new BN("18417254355718160513"),
  new BN("18387811781193591352"),
  new BN("18329067761203520168"),
  new BN("18212142134806087854"),
  new BN("17980523815641551639"),
  new BN("17526086738831147013"),
  new BN("16651378430235024244"),
  new BN("15030750278693429944"),
  new BN("12247334978882834399"),
  new BN("8131365268884726200"),
  new BN("3584323654723342297"),
  new BN("696457651847595233"),
  new BN("26294789957452057"),
  new BN("37481735321082"),
];

const POS_TICK_MULTIPLIERS: BN[] = [
  new BN("79232123823359799118286999567"),
  new BN("79236085330515764027303304731"),
  new BN("79244008939048815603706035061"),
  new BN("79259858533276714757314932305"),
  new BN("79291567232598584799939703904"),
  new BN("79355022692464371645785046466"),
  new BN("79482085999252804386437311141"),
  new BN("79736823300114093921829183326"),
  new BN("80248749790819932309965073892"),
  new BN("81282483887344747381513967011"),
  new BN("83390072131320151908154831281"),
  new BN("87770609709833776024991924138"),
  new BN("97234110755111693312479820773"),
  new BN("119332217159966728226237229890"),
  new BN("179736315981702064433883588727"),
  new BN("407748233172238350107850275304"),
  new BN("2098478828474011932436660412517"),
  new BN("55581415166113811149459800483533"),
  new BN("38992368544603139932233054999993551"),
];

const BASE_NEG = new BN("18446744073709551616"); // 2^64
const BASE_POS = new BN("79228162514264337593543950336");

export function getSqrtPriceAtTick(tick: number): BN {
  if (tick < -443636 || tick > 443636) throw new Error("Invalid tick");
  if (tick < 0) return getSqrtPriceAtNegativeTick(tick);
  return getSqrtPriceAtPositiveTick(tick);
}

function getSqrtPriceAtNegativeTick(tick: number): BN {
  const absTick = Math.abs(tick);
  let ratio = absTick & 0x1 ? new BN(NEG_TICK_MULTIPLIERS[0]) : new BN(BASE_NEG);
  for (let i = 1; i < 19; i++) {
    if (absTick & (1 << i)) {
      ratio = mulShr(ratio, NEG_TICK_MULTIPLIERS[i], 64);
    }
  }
  return ratio;
}

function getSqrtPriceAtPositiveTick(tick: number): BN {
  const absTick = Math.abs(tick);
  let ratio = absTick & 0x1 ? new BN(POS_TICK_MULTIPLIERS[0]) : new BN(BASE_POS);
  for (let i = 1; i < 19; i++) {
    if (absTick & (1 << i)) {
      ratio = mulShr(ratio, POS_TICK_MULTIPLIERS[i], 96);
    }
  }
  return ratio.shrn(32);
}

export function getTickAtSqrtPrice(sqrtPrice: BN): number {
  if (sqrtPrice.lt(MIN_SQRT_PRICE_X64) || sqrtPrice.gt(MAX_SQRT_PRICE_X64)) {
    throw new Error("Invalid sqrt price");
  }

  let r = sqrtPrice.clone();
  let msb = 0;

  if (r.gte(new BN(1).shln(64))) { msb |= 64; r = r.shrn(64); }
  if (r.gte(new BN(1).shln(32))) { msb |= 32; r = r.shrn(32); }
  if (r.gte(new BN(1).shln(16))) { msb |= 16; r = r.shrn(16); }
  if (r.gte(new BN(1).shln(8))) { msb |= 8; r = r.shrn(8); }
  if (r.gte(new BN(1).shln(4))) { msb |= 4; r = r.shrn(4); }
  if (r.gte(new BN(1).shln(2))) { msb |= 2; r = r.shrn(2); }
  if (r.gte(new BN(2))) { msb |= 1; }

  let log2_x32 = new BN(msb - 64).shln(32);
  r = msb >= 64 ? sqrtPrice.shrn(msb - 63) : sqrtPrice.shln(63 - msb);

  for (let shift = 31; shift >= 18; shift--) {
    r = r.mul(r).shrn(63);
    const f = r.shrn(64).toNumber();
    log2_x32 = log2_x32.or(new BN(f).shln(shift));
    r = r.shrn(f);
  }

  const log_sqrt_10001 = log2_x32.mul(new BN("59543866431366"));

  const tickLow = log_sqrt_10001
    .sub(new BN("184467440737095516"))
    .shrn(64)
    .toNumber();

  const tickHigh = log_sqrt_10001
    .add(new BN("15793534762490258745"))
    .shrn(64)
    .toNumber();

  if (tickLow === tickHigh) return tickLow;
  if (getSqrtPriceAtTick(tickHigh).lte(sqrtPrice)) return tickHigh;
  return tickLow;
}

// ============================================================
// CLMM Math - Delta Calculations (Q64.64 fixed point)
// ============================================================

function getDeltaA(sqrtPrice0: BN, sqrtPrice1: BN, liquidity: BN, roundUp: boolean): BN {
  const diff = sqrtPrice0.gt(sqrtPrice1)
    ? sqrtPrice0.sub(sqrtPrice1)
    : sqrtPrice1.sub(sqrtPrice0);
  if (diff.isZero() || liquidity.isZero()) return ZERO;

  const numerator = liquidity.mul(diff).shln(64);
  const denominator = sqrtPrice0.mul(sqrtPrice1);
  return divRound(numerator, denominator, roundUp);
}

function getDeltaB(sqrtPrice0: BN, sqrtPrice1: BN, liquidity: BN, roundUp: boolean): BN {
  const diff = sqrtPrice0.gt(sqrtPrice1)
    ? sqrtPrice0.sub(sqrtPrice1)
    : sqrtPrice1.sub(sqrtPrice0);
  if (diff.isZero() || liquidity.isZero()) return ZERO;

  const product = liquidity.mul(diff);
  const lo64Mask = new BN(1).shln(64).sub(ONE);
  const shouldRoundUp = roundUp && product.and(lo64Mask).gt(ZERO);
  const result = product.shrn(64);
  return shouldRoundUp ? result.add(ONE) : result;
}

function getDeltaUpFromInput(
  currentSqrtPrice: BN,
  targetSqrtPrice: BN,
  liquidity: BN,
  a2b: boolean
): BN {
  const diff = currentSqrtPrice.gt(targetSqrtPrice)
    ? currentSqrtPrice.sub(targetSqrtPrice)
    : targetSqrtPrice.sub(currentSqrtPrice);
  if (diff.isZero() || liquidity.isZero()) return ZERO;

  if (a2b) {
    const numerator = liquidity.mul(diff).shln(64);
    const denominator = currentSqrtPrice.mul(targetSqrtPrice);
    return divRound(numerator, denominator, true);
  } else {
    const product = liquidity.mul(diff);
    const lo64Mask = new BN(1).shln(64).sub(ONE);
    const shouldRoundUp = product.and(lo64Mask).gt(ZERO);
    const result = product.shrn(64);
    return shouldRoundUp ? result.add(ONE) : result;
  }
}

function getDeltaDownFromOutput(
  currentSqrtPrice: BN,
  targetSqrtPrice: BN,
  liquidity: BN,
  a2b: boolean
): BN {
  const diff = currentSqrtPrice.gt(targetSqrtPrice)
    ? currentSqrtPrice.sub(targetSqrtPrice)
    : targetSqrtPrice.sub(currentSqrtPrice);
  if (diff.isZero() || liquidity.isZero()) return ZERO;

  if (a2b) {
    return liquidity.mul(diff).shrn(64);
  } else {
    const numerator = liquidity.mul(diff).shln(64);
    const denominator = currentSqrtPrice.mul(targetSqrtPrice);
    return divRound(numerator, denominator, false);
  }
}

function getNextSqrtPriceFromInput(
  sqrtPrice: BN,
  liquidity: BN,
  amount: BN,
  a2b: boolean
): BN {
  if (amount.isZero()) return sqrtPrice;
  if (a2b) {
    const numerator = sqrtPrice.mul(liquidity).shln(64);
    const liquidityShl64 = liquidity.shln(64);
    const product = sqrtPrice.mul(amount);
    const denominator = liquidityShl64.add(product);
    return divRound(numerator, denominator, true);
  } else {
    const deltaSqrtPrice = divRound(amount.shln(64), liquidity, false);
    return sqrtPrice.add(deltaSqrtPrice);
  }
}

function getNextSqrtPriceFromOutput(
  sqrtPrice: BN,
  liquidity: BN,
  amount: BN,
  a2b: boolean
): BN {
  if (amount.isZero()) return sqrtPrice;
  if (a2b) {
    const deltaSqrtPrice = divRound(amount.shln(64), liquidity, true);
    return sqrtPrice.sub(deltaSqrtPrice);
  } else {
    const numerator = sqrtPrice.mul(liquidity).shln(64);
    const liquidityShl64 = liquidity.shln(64);
    const product = sqrtPrice.mul(amount);
    const denominator = liquidityShl64.sub(product);
    return divRound(numerator, denominator, true);
  }
}

// ============================================================
// Compute Swap Step
// ============================================================

interface SwapStepComputed {
  amountIn: BN;
  amountOut: BN;
  nextSqrtPrice: BN;
  feeAmount: BN;
}

function computeSwapStep(
  currentSqrtPrice: BN,
  targetSqrtPrice: BN,
  liquidity: BN,
  amount: BN,
  collectFeeOnInput: boolean,
  feeRate: BN,
  a2b: boolean,
  byAmountIn: boolean
): SwapStepComputed {
  let nextSqrtPrice = targetSqrtPrice.clone();
  let amountIn = ZERO;
  let amountOut = ZERO;
  let feeAmount = ZERO;

  if (liquidity.isZero()) {
    return { amountIn, amountOut, nextSqrtPrice, feeAmount };
  }

  if (byAmountIn) {
    if (collectFeeOnInput) {
      const amountRemain = mulDivFloor(amount, PRECISION.sub(feeRate), PRECISION);
      const maxAmountIn = getDeltaUpFromInput(currentSqrtPrice, targetSqrtPrice, liquidity, a2b);

      if (maxAmountIn.gt(amountRemain)) {
        amountIn = amountRemain;
        feeAmount = amount.sub(amountRemain);
        nextSqrtPrice = getNextSqrtPriceFromInput(currentSqrtPrice, liquidity, amountRemain, a2b);
      } else {
        amountIn = maxAmountIn;
        feeAmount = mulDivCeil(amountIn, feeRate, PRECISION.sub(feeRate));
        nextSqrtPrice = targetSqrtPrice;
      }
      amountOut = getDeltaDownFromOutput(currentSqrtPrice, nextSqrtPrice, liquidity, a2b);
    } else {
      const maxAmountIn = getDeltaUpFromInput(currentSqrtPrice, targetSqrtPrice, liquidity, a2b);

      if (maxAmountIn.gt(amount)) {
        amountIn = amount;
        nextSqrtPrice = getNextSqrtPriceFromInput(currentSqrtPrice, liquidity, amount, a2b);
      } else {
        amountIn = maxAmountIn;
        nextSqrtPrice = targetSqrtPrice;
      }
      const grossAmountOut = getDeltaDownFromOutput(currentSqrtPrice, nextSqrtPrice, liquidity, a2b);
      feeAmount = mulDivCeil(grossAmountOut, feeRate, PRECISION);
      amountOut = grossAmountOut.sub(feeAmount);
    }
  } else {
    if (collectFeeOnInput) {
      const maxAmountOut = getDeltaDownFromOutput(currentSqrtPrice, targetSqrtPrice, liquidity, a2b);

      if (maxAmountOut.gt(amount)) {
        amountOut = amount;
        nextSqrtPrice = getNextSqrtPriceFromOutput(currentSqrtPrice, liquidity, amount, a2b);
      } else {
        amountOut = maxAmountOut;
        nextSqrtPrice = targetSqrtPrice;
      }
      amountIn = getDeltaUpFromInput(currentSqrtPrice, nextSqrtPrice, liquidity, a2b);
      feeAmount = mulDivCeil(amountIn, feeRate, PRECISION.sub(feeRate));
    } else {
      const amountWithFee = mulDivCeil(amount, PRECISION, PRECISION.sub(feeRate));
      const maxAmountOut = getDeltaDownFromOutput(currentSqrtPrice, targetSqrtPrice, liquidity, a2b);

      if (maxAmountOut.gt(amountWithFee)) {
        nextSqrtPrice = getNextSqrtPriceFromOutput(currentSqrtPrice, liquidity, amountWithFee, a2b);
        amountOut = amount;
        feeAmount = amountWithFee.sub(amount);
      } else {
        const grossOut = maxAmountOut;
        feeAmount = mulDivCeil(grossOut, feeRate, PRECISION);
        amountOut = grossOut.sub(feeAmount);
        nextSqrtPrice = targetSqrtPrice;
      }
      amountIn = getDeltaUpFromInput(currentSqrtPrice, nextSqrtPrice, liquidity, a2b);
    }
  }

  return { amountIn, amountOut, nextSqrtPrice, feeAmount };
}

// ============================================================
// Fee Scheduler - Base Fee Calculation
// ============================================================

function getBaseFee(
  params: Pool["parameters"],
  currentTimestampMs: BN
): BN {
  const feeRate = new BN(params.feeRate);

  if (!params.enabledFeeScheduler || toBN(params.activationTimestamp).isZero()) {
    return feeRate;
  }

  const activationTs = toBN(params.activationTimestamp);
  const periodFrequency = new BN(params.periodFrequency);
  const numberOfPeriod = new BN(params.numberOfPeriod);
  const cliffFee = toBN(params.cliffFeeNumerator);
  const reductionFactor = toBN(params.feeSchedulerReductionFactor);

  let period: BN;
  if (periodFrequency.isZero()) {
    period = ZERO;
  } else if (currentTimestampMs.lt(activationTs)) {
    period = numberOfPeriod;
  } else {
    const elapsed = currentTimestampMs.sub(activationTs);
    period = BN.min(elapsed.div(periodFrequency), numberOfPeriod);
  }

  if (period.eq(numberOfPeriod)) {
    return feeRate;
  }

  const feeSchedulerMode = Number(params.feeSchedulerMode);

  if (feeSchedulerMode === 1) {
    return getBaseFeeExponential(cliffFee, reductionFactor, period);
  } else {
    const totalReduction = reductionFactor.mul(period);
    return cliffFee.sub(totalReduction);
  }
}

function getBaseFeeExponential(cliffFee: BN, reductionFactor: BN, period: BN): BN {
  const scale = new BN(1).shln(64);
  const basisPointMax = new BN(10000);

  const base = scale.sub(mulDivFloor(reductionFactor, scale, basisPointMax));
  const totalReduction = powQ64x64(base, period);

  return mulDivFloor(cliffFee, totalReduction, scale);
}

function powQ64x64(base: BN, exp: BN): BN {
  const scale = new BN(1).shln(64);
  let result = scale.clone();
  let b = base.clone();
  let e = exp.clone();

  while (e.gt(ZERO)) {
    if (e.and(ONE).eq(ONE)) {
      result = result.mul(b).shrn(64);
    }
    b = b.mul(b).shrn(64);
    e = e.shrn(1);
  }
  return result;
}

// ============================================================
// Dynamic Fee (Variable Fee from volatility)
// ============================================================

function getVariableFee(params: Pool["parameters"], volatilityAccumulator: number): BN {
  if (!params.enabledDynamicFee) return ZERO;
  if (params.variableFeeControl === 0) return ZERO;

  const volatility = new BN(volatilityAccumulator);
  const step = new BN(params.tickSpacing);
  const vfc = new BN(params.variableFeeControl);

  const prod = volatility.mul(step);
  return prod.mul(prod).mul(vfc).add(new BN(99)).div(new BN(100));
}

// ============================================================
// Volatility Params (simulation copy, avoid mutating pool)
// ============================================================

interface VolatilityParams {
  volatilityAccumulator: number;
  volatilityReference: number;
  idReference: number;
  timeOfLastUpdate: number;
}

function updateReferences(
  vol: VolatilityParams,
  params: Pool["parameters"],
  timestampSec: number
): void {
  const dt = timestampSec - vol.timeOfLastUpdate;

  if (dt >= Number(params.filterPeriod)) {
    vol.idReference = params.currentTickIndex;
    if (dt < Number(params.decayPeriod)) {
      const volAcc = vol.volatilityAccumulator;
      const rf = params.reductionFactor;
      const volRef = Math.floor((volAcc * rf) / 10000);
      vol.volatilityReference = Math.min(volRef, 0xfffff);
    } else {
      vol.volatilityReference = 0;
    }
  }

  vol.timeOfLastUpdate = timestampSec;
}

function updateVolatilityAccumulator(
  vol: VolatilityParams,
  params: Pool["parameters"],
  activeId: number
): void {
  const idRef = vol.idReference;
  const idDiff = Math.abs(activeId - idRef);
  const deltaId = Math.floor(idDiff / params.tickSpacing);

  const volRef = vol.volatilityReference;
  const volatilityPerBin = 10;
  const volAcc = volRef + deltaId * volatilityPerBin;
  vol.volatilityAccumulator = Math.min(volAcc, params.maxVolatilityAccumulator);
}

// ============================================================
// Tick Navigation
// ============================================================

function findFirstTickForSwap(
  ticks: TickData[],
  currentTickIndex: number,
  a2b: boolean
): number {
  if (a2b) {
    for (let i = ticks.length - 1; i >= 0; i--) {
      if (ticks[i].index <= currentTickIndex) return i;
    }
    return -1;
  } else {
    for (let i = 0; i < ticks.length; i++) {
      if (ticks[i].index > currentTickIndex) return i;
    }
    return -1;
  }
}

function getNextTickArrayIndex(currentIdx: number, a2b: boolean): number {
  return a2b ? currentIdx - 1 : currentIdx + 1;
}

// ============================================================
// Main: simulateSwap
// Port of calculate_swap_result from pool.move
// ============================================================

/**
 * Simulate a swap on a CLMM pool.
 *
 * @param pool            - Pool object (from on-chain, matches the Pool type)
 * @param ticks           - Sorted array of initialized TickData (ascending by index)
 * @param a2b             - true = swap token A → B, false = swap B → A
 * @param byAmountIn      - true = amount is input, false = amount is desired output
 * @param amount          - The swap amount (u64)
 * @param currentTimestampMs - Current timestamp in milliseconds
 */
export function simulateSwap(
  pool: Pool,
  ticks: TickData[],
  a2b: boolean,
  byAmountIn: boolean,
  amount: BN,
  currentTimestampMs: BN,
): CalculatedSwapResult {
  const params = pool.parameters;
  const collectFeeMode = pool.collectFeeMode;
  const isQuoteY = pool.isQuoteY;

  let currentSqrtPrice = toBN(params.currentSqrtPrice);
  let currentLiquidity = new BN(pool.liquidity);

  const TIMESTAMP_DIVISOR = 1000;
  const currentTimestampSec = Math.floor(
    currentTimestampMs.toNumber() / TIMESTAMP_DIVISOR
  );

  // Clone volatility params for simulation
  const vol: VolatilityParams = {
    volatilityAccumulator: params.volatilityAccumulator,
    volatilityReference: params.volatilityReference,
    idReference: params.idReference,
    timeOfLastUpdate: params.timeOfLastUpdate,
  };

  updateReferences(vol, params, currentTimestampSec);

  // Determine collect_fee_on_input
  let collectFeeOnInput: boolean;
  if (collectFeeMode === COLLECT_FEE_MODE_ON_BOTH) {
    collectFeeOnInput = true;
  } else if (collectFeeMode === COLLECT_FEE_MODE_ON_QUOTE) {
    collectFeeOnInput = (a2b && !isQuoteY) || (!a2b && isQuoteY);
  } else {
    collectFeeOnInput = true;
  }

  let remainingAmount = amount.clone();
  let tickIdx = findFirstTickForSwap(ticks, params.currentTickIndex, a2b);

  const result: CalculatedSwapResult = {
    amountIn: ZERO,
    amountOut: ZERO,
    feeAmount: ZERO,
    baseFee: ZERO,
    dynamicFee: ZERO,
    beforeSqrtPrice: currentSqrtPrice.clone(),
    afterSqrtPrice: currentSqrtPrice.clone(),
    isExceed: false,
    collectFeeOnInput,
    stepResults: [],
  };

  while (remainingAmount.gt(ZERO)) {
    if (tickIdx < 0 || tickIdx >= ticks.length) {
      result.isExceed = true;
      break;
    }

    const tick = ticks[tickIdx];
    const tickSqrtPrice = tick.sqrtPrice.isZero()
      ? getSqrtPriceAtTick(tick.index)
      : tick.sqrtPrice;

    // Update volatility accumulator for this tick
    updateVolatilityAccumulator(vol, params, tick.index);

    // Calculate total fee rate with updated volatility
    const baseFeeRate = getBaseFee(params, currentTimestampMs);
    const variableFee = getVariableFee(params, vol.volatilityAccumulator);
    const feeRate = BN.min(baseFeeRate.add(variableFee), MAX_FEE);

    // Compute swap step
    const stepResult = computeSwapStep(
      currentSqrtPrice,
      tickSqrtPrice,
      currentLiquidity,
      remainingAmount,
      collectFeeOnInput,
      feeRate,
      a2b,
      byAmountIn
    );

    // Update remaining amount
    if (!stepResult.amountIn.isZero() || !stepResult.feeAmount.isZero()) {
      if (byAmountIn) {
        if (collectFeeOnInput) {
          const afterFee = remainingAmount.sub(stepResult.amountIn);
          remainingAmount = afterFee.sub(stepResult.feeAmount);
        } else {
          remainingAmount = remainingAmount.sub(stepResult.amountIn);
        }
      } else {
        remainingAmount = remainingAmount.sub(stepResult.amountOut);
      }

      // Split fee into base_fee and dynamic_fee portions
      let stepBaseFee: BN;
      let stepDynamicFee: BN;
      if (feeRate.isZero()) {
        stepBaseFee = ZERO;
        stepDynamicFee = ZERO;
      } else {
        stepBaseFee = mulDivCeil(stepResult.feeAmount, baseFeeRate, feeRate);
        stepDynamicFee = stepResult.feeAmount.sub(stepBaseFee);
      }

      result.amountIn = result.amountIn.add(stepResult.amountIn);
      result.amountOut = result.amountOut.add(stepResult.amountOut);
      result.feeAmount = result.feeAmount.add(stepResult.feeAmount);
      result.baseFee = result.baseFee.add(stepBaseFee);
      result.dynamicFee = result.dynamicFee.add(stepDynamicFee);
    }

    // Record step
    result.stepResults.push({
      currentSqrtPrice: currentSqrtPrice.clone(),
      targetSqrtPrice: tickSqrtPrice.clone(),
      currentLiquidity: currentLiquidity.clone(),
      amountIn: stepResult.amountIn,
      amountOut: stepResult.amountOut,
      feeAmount: stepResult.feeAmount,
      remainderAmount: remainingAmount.clone(),
    });

    // Cross tick if we reached the target
    if (stepResult.nextSqrtPrice.eq(tickSqrtPrice)) {
      currentSqrtPrice = tickSqrtPrice;

      // Apply liquidity net (negate for a2b direction)
      let liquidityNet = tick.liquidityNet.clone();
      if (a2b) {
        liquidityNet = liquidityNet.neg();
      }

      if (liquidityNet.gte(ZERO)) {
        currentLiquidity = currentLiquidity.add(liquidityNet);
      } else {
        currentLiquidity = currentLiquidity.sub(liquidityNet.abs());
      }

      // Move to next tick in sorted array
      tickIdx = getNextTickArrayIndex(tickIdx, a2b);
    } else {
      currentSqrtPrice = stepResult.nextSqrtPrice;
    }
  }

  // Adjust amount_in to include fee if collected on input
  if (collectFeeOnInput) {
    result.amountIn = result.amountIn.add(result.feeAmount);
  }

  result.afterSqrtPrice = currentSqrtPrice;

  return result;
}

// ============================================================
// Convenience: getSwapOut
// ============================================================

/**
 * Simulate a swap and return a simple quote.
 *
 * @param pool            - Pool object (from on-chain)
 * @param ticks           - Sorted initialized ticks (ascending by index)
 * @param a2b             - true = swap token A → B, false = swap B → A
 * @param amountIn        - Amount of input token (as string or BN)
 * @param currentTimestampMs - Current timestamp in milliseconds
 */
export function getSwapOut(
  pool: Pool,
  ticks: TickData[],
  a2b: boolean,
  amountIn: string | BN,
  currentTimestampMs: number | BN,
): SwapQuote {
  const amount = typeof amountIn === "string" ? new BN(amountIn) : amountIn;
  const ts =
    typeof currentTimestampMs === "number"
      ? new BN(currentTimestampMs)
      : currentTimestampMs;

  const result = simulateSwap(
    pool,
    ticks,
    a2b,
    true,
    amount,
    ts,
  );

  // Calculate price impact
  const beforePrice = toBN(pool.parameters.currentSqrtPrice);
  const afterPrice = result.afterSqrtPrice;
  let priceImpact = 0;
  if (!beforePrice.isZero()) {
    const diff = afterPrice.gt(beforePrice)
      ? afterPrice.sub(beforePrice)
      : beforePrice.sub(afterPrice);
    priceImpact =
      diff.mul(new BN(10000)).div(beforePrice).toNumber() / 100;
  }

  return {
    amountIn: result.amountIn.toString(),
    amountOut: result.amountOut.toString(),
    feeAmount: result.feeAmount.toString(),
    baseFee: result.baseFee.toString(),
    dynamicFee: result.dynamicFee.toString(),
    isExceed: result.isExceed,
    afterSqrtPrice: result.afterSqrtPrice.toString(),
    priceImpact,
    steps: result.stepResults.length,
  };
}

// ============================================================
// Usage Example
// ============================================================

/*
import { getSwapOut, Pool, TickData } from "./simulate_swap";
import BN from "bn.js";

// 1. Fetch pool & ticks from on-chain
const pool: Pool = { ... };       // your Pool object
const ticks: TickData[] = [ ... ]; // sorted ascending by index

// 2. Get swap quote: swap 1_000_000 of token A → token B
const quote = getSwapOut(pool, ticks, true, "1000000", Date.now());
console.log("Amount out:", quote.amountOut);
console.log("Fee:", quote.feeAmount);
console.log("Price impact:", quote.priceImpact, "%");
console.log("Steps:", quote.steps);

// 3. Swap B → A
const quoteB2A = getSwapOut(pool, ticks, false, "500000", Date.now());
console.log("Amount out:", quoteB2A.amountOut);
*/