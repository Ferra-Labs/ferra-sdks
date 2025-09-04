// Type definitions
interface BinReserves {
  reserve_x: bigint;
  reserve_y: bigint;
  fee_x: bigint;
  fee_y: bigint;
  total_supply: bigint
}

interface Amount {
  amount_x: bigint;
  amount_y: bigint;
}

const SCALE_OFFSET_40X88 = 88n;
const SCALE_40X88 = 1n << SCALE_OFFSET_40X88; // 2^88
const MAX_INTEGER_40 = 0xffffffffffn;

const q40x88 = {
  /**
   * Convert an integer to u40.u88 fixed-point format
   * @param value - Integer value to convert
   * @returns Fixed-point representation
   */
  fromInteger(value: bigint): bigint {
    if (value > MAX_INTEGER_40) {
      throw new Error(`Integer overflow: value ${value} exceeds max ${MAX_INTEGER_40}`);
    }
    return value << SCALE_OFFSET_40X88;
  },

  /**
   * Get the integer part of a u40.u88 number
   * @param value - Fixed-point value
   * @returns Integer part
   */
  getInteger(value: bigint): bigint {
    return value >> SCALE_OFFSET_40X88;
  },

  /**
   * Multiply two u40.u88 numbers
   * @param x - First fixed-point number
   * @param y - Second fixed-point number
   * @returns Product in fixed-point format
   */
  mul(x: bigint, y: bigint): bigint {
    // (x * y) / scale
    return (x * y) / SCALE_40X88;
  },

  /**
   * Add two u40.u88 numbers with overflow check
   * @param x - First fixed-point number
   * @param y - Second fixed-point number
   * @returns Sum in fixed-point format
   */
  add(x: bigint, y: bigint): bigint {
    const result = x + y;
    // In JavaScript BigInt, we don't have the same overflow concerns as Rust,
    // but we can add a check for consistency
    if (result < x || result < y) {
      throw new Error("Addition overflow");
    }
    return result;
  },

  /**
   * Divide two u40.u88 numbers
   * @param x - Dividend in fixed-point format
   * @param y - Divisor in fixed-point format
   * @returns Quotient in fixed-point format
   */
  div(x: bigint, y: bigint): bigint {
    if (y === 0n) {
      throw new Error("Division by zero");
    }
    // (x * scale) / y
    return (x * SCALE_40X88) / y;
  },

  /**
   * Convert fixed-point to decimal string for display
   * @param value - Fixed-point value
   * @param decimals - Number of decimal places to show
   * @returns Decimal string representation
   */
  toDecimal(value: bigint, decimals: number = 6): string {
    const integerPart = q40x88.getInteger(value);
    const fractionalPart = value & ((1n << SCALE_OFFSET_40X88) - 1n);

    // Convert fractional part to decimal
    const scaledFraction = (fractionalPart * (10n ** BigInt(decimals))) / SCALE_40X88;
    const fractionStr = scaledFraction.toString().padStart(decimals, '0');

    return `${integerPart}.${fractionStr}`;
  },

  sub(x: bigint, y: bigint): bigint {
    const result = x - y;
    if (result < 0n) {
      throw new Error("Subtraction underflow");
    }
    return result;
  }

};

const safeMath = {
  /**
   * Multiply two bigints and divide by a third, handling overflow
   * Computes (a * b) / c with full precision
   */
  mulDivU128(a: bigint, b: bigint, c: bigint): bigint {
    if (c === 0n) {
      throw new Error("Division by zero");
    }

    if (a === 0n || b === 0n) {
      return 0n;
    }

    // Special cases for efficiency
    if (a === c) return b;
    if (b === c) return a;

    // Calculate (a * b) / c
    // JavaScript's BigInt handles arbitrary precision, so no overflow concerns
    return (a * b) / c;
  },

  /**
   * Convert u128 to u64, ensuring it fits
   */
  u128ToU64(value: bigint): bigint {
    const MAX_U64 = 0xffffffffffffffffn; // 2^64 - 1
    if (value > MAX_U64) {
      throw new Error("Value too large for u64");
    }
    return value;
  }
};

// BinReserves helper functions
function createBinReserves(
  reserve_x: bigint,
  reserve_y: bigint,
  fee_x: bigint = 0n,
  fee_y: bigint = 0n,
  total_supply: bigint
): BinReserves {
  return {
    reserve_x,
    reserve_y,
    fee_x,
    fee_y,
    total_supply
  };
}

/**
 * Get total amounts (reserves + fees)
 */
function getTotalAmounts(binReserves: BinReserves): [bigint, bigint] {
  const total_x = binReserves.reserve_x + binReserves.fee_x;
  const total_y = binReserves.reserve_y + binReserves.fee_y;
  return [total_x, total_y];
}

// Amount helper functions
function createAmounts(amount_x: bigint, amount_y: bigint): Amount {
  return {
    amount_x,
    amount_y
  };
}

/**
 * Get amount out of bin when burning liquidity
 * Considers both reserves and fees proportionally
 *
 * @param binReserves - The bin reserves including fees
 * @param amountToBurn - The amount of liquidity to burn
 * @param totalSupply - The total supply of liquidity
 * @returns The amounts of tokens to receive
 */
export function getAmountOutOfBin(
  binReserves: BinReserves | null,
  amountToBurn: bigint,
  totalSupply: bigint
): Amount {
  // If no supply, return zero amounts
  if (totalSupply === 0n || !binReserves) {
    return createAmounts(0n, 0n);
  }

  // Get total amounts including fees
  const [total_x, total_y] = getTotalAmounts(binReserves);

  // Calculate proportional amounts using bigint arithmetic
  let amount_x_out: bigint;
  if (total_x > 0n) {
    amount_x_out = safeMath.u128ToU64(
      safeMath.mulDivU128(
        amountToBurn,
        total_x,
        totalSupply
      )
    );
  } else {
    amount_x_out = 0n;
  }

  let amount_y_out: bigint;
  if (total_y > 0n) {
    amount_y_out = safeMath.u128ToU64(
      safeMath.mulDivU128(
        amountToBurn,
        total_y,
        totalSupply
      )
    );
  } else {
    amount_y_out = 0n;
  }

  return createAmounts(amount_x_out, amount_y_out);
}

export function getBurnPercentage(amountToBurn: bigint, totalSupply: bigint): number {
  if (totalSupply === 0n) return 0;
  // Convert to percentage with 2 decimal places
  return Number((amountToBurn * 10000n) / totalSupply) / 100;
}

export function getAmountsOutOfBins(
  binsReserves: BinReserves[],
  amountsToBurn: bigint[],
  totalSupplies: bigint[]
): Amount[] {
  if (binsReserves.length !== amountsToBurn.length ||
      binsReserves.length !== totalSupplies.length) {
    throw new Error("Arrays must have the same length");
  }

  return binsReserves.map((binReserves, i) =>
    getAmountOutOfBin(binReserves, amountsToBurn[i], totalSupplies[i])
  );
}

export function aggregateAmounts(amountsArray: Amount[]): Amount {
  return amountsArray.reduce(
    (acc, amounts) => createAmounts(
      acc.amount_x + amounts.amount_x,
      acc.amount_y + amounts.amount_y
    ),
    createAmounts(0n, 0n)
  );
}

/**
 * Calculate amount X from liquidity, amount Y, and price
 *
 * Given: L = x * price + y
 * Solve for x: x = (L - y) / price
 *
 * @param liquidity - Total liquidity value
 * @param amountY - Amount of token Y
 * @param price - Price in u40.u88 fixed-point format
 * @returns Amount of token X
 */
export function getAmountXFromLiquidity(
  liquidity: bigint,
  amountY: bigint,
  price: bigint
): bigint {
  if (price === 0n) {
    throw new Error("Cannot calculate amountX with zero price");
  }

  // Convert to fixed-point
  const liquidityFixed = q40x88.fromInteger(liquidity);
  const yFixed = q40x88.fromInteger(amountY);

  // Check if liquidity is sufficient for the given amountY
  if (liquidityFixed < yFixed) {
    throw new Error("Insufficient liquidity for given amountY");
  }

  // Calculate (L - y) in fixed-point
  const numerator = q40x88.sub(liquidityFixed, yFixed);

  // Divide by price: (L - y) / price
  const xFixed = q40x88.div(numerator, price);

  // Convert back to integer
  return q40x88.getInteger(xFixed);
}

/**
 * Calculate amount Y from liquidity, amount X, and price
 *
 * Given: L = x * price + y
 * Solve for y: y = L - (x * price)
 *
 * @param liquidity - Total liquidity value
 * @param amountX - Amount of token X
 * @param price - Price in u40.u88 fixed-point format
 * @returns Amount of token Y
 */
export function getAmountYFromLiquidity(
  liquidity: bigint,
  amountX: bigint,
  price: bigint
): bigint {
  // Convert to fixed-point
  const liquidityFixed = q40x88.fromInteger(liquidity);
  const xFixed = q40x88.fromInteger(amountX);

  // Calculate x * price
  const xTimesPrice = q40x88.mul(xFixed, price);

  // Check if liquidity is sufficient
  if (liquidityFixed < xTimesPrice) {
    throw new Error("Insufficient liquidity for given amountX and price");
  }

  // Calculate L - (x * price)
  const yFixed = q40x88.sub(liquidityFixed, xTimesPrice);

  // Convert back to integer
  return q40x88.getInteger(yFixed);
}

export type { BinReserves, Amount };
export { createBinReserves, createAmounts, getTotalAmounts };