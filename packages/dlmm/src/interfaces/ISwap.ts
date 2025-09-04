import type { Transaction, TransactionResult } from "@mysten/sui/transactions";
import { LbPairBinData } from "./IPair";

export type CoinPairType = {
  coinTypeX: string
  coinTypeY: string
}

export type PrepareSwapParams = {
  amount: bigint;
  xtoy?: boolean;
  recipient?: string;
  minAmountOut?: bigint
}

export type CalculateSwapParams = {
  amount: bigint;
  xtoy?: boolean;
  swapBins: LbPairBinData[]
}

export type CalculateRatesResult = {
  /**
   * The estimated amount in token A.
   */
  estimatedAmountIn: bigint

  /**
   * The estimated amount in token B.
   */
  estimatedAmountOut: bigint

  /**
   * The estimated ending square root price.
   */
  estimatedEndBinId: number

  /**
   * The estimated fee amount.
   */
  estimatedFeeAmount: bigint

  /**
   * Indicates if the estimated amount exceeds the limit.
   */
  isExceed: boolean
  isMaxLoop: boolean

  /**
   * The extra compute limit.
   */
  extraComputeLimit: number

  /**
   * Specifies if the swap is from token A to token B.
   */
  xToY: boolean

  /**
   * The amount to swap.
   */
  amount: bigint

  /**
   * The price impact percentage.
   */
  priceImpactPct: number
}

export type SwapParams = {
  pairId: string;
  xtoy: boolean
  recipient: string;
  coinX: TransactionResult[number] | ((tx: Transaction) => TransactionResult);
  coinY: TransactionResult[number] | ((tx: Transaction) => TransactionResult);
  minAmountOut?: bigint
} & CoinPairType