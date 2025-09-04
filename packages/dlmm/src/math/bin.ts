export class BinMath {
  /**
   * @static
   * Returns the price of bin given its id and the bin step
   * Price is returned as tokenY/tokenX accounting for decimals
   *
   * @param {number} id - The bin id
   * @param {number} binStep
   * @param {number} tokenXDecimals - Decimals of token X
   * @param {number} tokenYDecimals - Decimals of token Y
   * @returns {number}
   */
  public static getPriceFromId(id: number, binStep: number, tokenXDecimals: number, tokenYDecimals: number): number {
    const rawPrice = (1 + binStep / 10_000) ** (id - 8388608)
    // Adjust price for decimals difference
    const decimalAdjustment = Math.pow(10, tokenXDecimals - tokenYDecimals)
    
    return rawPrice * decimalAdjustment
  }

  /**
   * @static
   * Returns the bin id given its price and the bin step
   * Price should be provided as tokenY/tokenX accounting for decimals
   *
   * @param {number} price - The price of the bin (tokenY/tokenX)
   * @param {number} binStep
   * @param {number} tokenXDecimals - Decimals of token X
   * @param {number} tokenYDecimals - Decimals of token Y
   * @returns {number}
   */
  public static getIdFromPrice(price: number, binStep: number, tokenXDecimals: number, tokenYDecimals: number): number {
    // Adjust price to remove decimals difference
    const decimalAdjustment = Math.pow(10, tokenXDecimals - tokenYDecimals)
    const rawPrice = price / decimalAdjustment
    
    return Math.trunc(Math.log(rawPrice) / Math.log(1 + binStep / 10_000)) + 8388608
  }

  /**
   * @static
   * Returns idSlippage given slippage tolerance and the bin step
   * Note: This function doesn't need decimals as it works with percentage slippage
   *
   * @param {number} priceSlippage - Price slippage as a decimal (e.g., 0.01 for 1%)
   * @param {number} binStep
   * @returns {number}
   */
  public static getIdSlippageFromPriceSlippage(
    priceSlippage: number,
    binStep: number,
    tokenXDecimals: number,
    tokenYDecimals: number
  ): number {
    const decimalAdjustment = Math.pow(10, tokenXDecimals - tokenYDecimals)
    const rawPrice = priceSlippage / decimalAdjustment

    return Math.floor(Math.log(1 + rawPrice) / Math.log(1 + binStep / 10_000))
  }
}
