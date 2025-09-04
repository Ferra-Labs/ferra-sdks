import { coinWithBalance, Transaction, TransactionObjectArgument } from "@mysten/sui/transactions"
import { SwapClmmFerraTransParams, SwapDlmmFerraTransParams } from "../interfaces/IAggSwap"
import { CoinAssist } from "../math/coin-assist"
import { CLOCK_ADDRESS } from "../types"

/**
* Utility class for building DLMM protocol transactions
* Provides static methods for factory, pair, liquidity, and swap operations
*/
export class TransactionUtil {
  private static readonly FERRA_CLMM_MODULE_NAME = "clmm"
  private static readonly FERRA_DLMM_MODULE_NAME = "dlmm"

  /**
   * Build transaction for swapping from CoinA to CoinB
   */
  static buildSwapClmmFerraTransaction(tx: Transaction, params: SwapClmmFerraTransParams): [Transaction, TransactionObjectArgument] {
    const {
      packageId,
      globalConfig,
      poolId,
      coinTypeA,
      coinTypeB,
      amountIn,
      atob
    } = params


    // Call swap_a2b function
    const result = tx.moveCall({
      target: atob ? `${packageId}::${this.FERRA_CLMM_MODULE_NAME}::swap_a2b` : `${packageId}::${this.FERRA_CLMM_MODULE_NAME}::swap_b2a`,
      typeArguments: [coinTypeA, coinTypeB],
      arguments: [
        tx.object(globalConfig),
        tx.object(poolId),
        amountIn,
        tx.object(CLOCK_ADDRESS),
      ],
    })

    return [tx, result]
  }


  static buildSwapDlmmFerraTransaction(tx: Transaction, params: SwapDlmmFerraTransParams): [Transaction, TransactionObjectArgument] {
    const {
      packageId,
      globalConfig,
      pairId,
      coinTypeA,
      coinTypeB,
      amountIn,
      atob,
      minAmountOut = 0n
    } = params

    // Call swap_a2b function
    const [result] = tx.moveCall({
      target: atob ? `${packageId}::${this.FERRA_DLMM_MODULE_NAME}::swap_a2b` : `${packageId}::${this.FERRA_DLMM_MODULE_NAME}::swap_b2a`,
      typeArguments: [coinTypeA, coinTypeB],
      arguments: [
        tx.object(globalConfig),
        tx.object(pairId),
        amountIn,
        tx.pure.u64(minAmountOut ?? 0n),
        tx.object(CLOCK_ADDRESS),
      ],
    })

    // tx.transferObjects([coinOut], tx.pure.address(sender))

    return [tx, result]
  }

  /**
   * Build a coin object with specific amount from user's coin assets
   * @param coinType - Type of coin to build
   * @param amount - Amount needed
   * @returns Transaction result with coin object
   */
  public static buildCoinAmount(
    coinType: string,
    amount: bigint
  ): TransactionObjectArgument {
    // Handle SUI coin specially (uses gas object)
    if (CoinAssist.isSuiCoin(coinType)) {
      return coinWithBalance({type: coinType, balance: amount, useGasCoin: true})
    }

    // For other coins, select and merge as needed
    return coinWithBalance({type: coinType, balance: amount, useGasCoin: false})
  }

}