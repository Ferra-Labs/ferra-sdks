import { IModule } from '../interfaces/IModule'
import { FerraDlmmSDK } from '../sdk'
import { CachedContent } from '../utils/cached-content'
import { LBPair } from '../interfaces/IPair'
import { CalculateRatesResult, CalculateSwapParams, PrepareSwapParams } from '../interfaces/ISwap'
import { checkInvalidSuiAddress, SwapUtils, TransactionUtil } from '../utils'
import { DlmmPairsError, UtilsErrorCode } from '../errors/errors'
import { coinWithBalance, Transaction, type TransactionResult } from '@mysten/sui/transactions'
import { BinMath, CoinAssist } from '../math'

import Decimal from 'decimal.js'
import { SUI_DECIMALS } from '@mysten/sui/utils'

const MAX_LOOP_ITERATIONS = 70

/**
 * Module for managing DLMM swap
 * Handles
 */
export class SwapModule implements IModule {
  protected _sdk: FerraDlmmSDK

  /**
   * Cache storage for pair data
   */
  private readonly _cache: Record<string, CachedContent> = {}

  /**
   * Initialize the pair module with SDK instance
   * @param sdk - FerraDlmmSDK instance
   */
  constructor(sdk: FerraDlmmSDK) {
    this._sdk = sdk
  }

  /**
   * Get the SDK instance
   * @returns FerraDlmmSDK instance
   */
  get sdk() {
    return this._sdk
  }

  /**
   * Calculate swap rates and price impact for a given swap operation
   * @param pair - The LBPair to calculate swap rates for
   * @param params - Swap calculation parameters including amount, direction, and available bins
   * @returns Calculation result including estimated amounts, fees, and price impact
   *
   * @example
   * ```typescript
   * const rates = swapModule.calculateRates(pair, {
   *   amount: 1000000000n,
   *   xtoy: true,
   *   swapBins: binData
   * });
   * console.log(`Price impact: ${rates.priceImpactPct}%`);
   * console.log(`Estimated output: ${rates.estimatedAmountOut}`);
   * ```
   */
  public calculateRates(pair: LBPair, params: CalculateSwapParams): CalculateRatesResult {
    const [amountInRemain, amountOut, feeAmount, newBinId, isMaxLoop] = SwapUtils.getSwapOut(pair, params.swapBins, params.amount, params.xtoy ?? true)

    const currentBinId = pair.parameters.active_id

    const currentPrice = BinMath.getPriceFromId(currentBinId, Number(pair.binStep), SUI_DECIMALS, SUI_DECIMALS)
    const newPricePrice = BinMath.getPriceFromId(Number(newBinId.toString()), Number(pair.binStep), SUI_DECIMALS, SUI_DECIMALS)
    const priceImpactPercentage = new Decimal(currentPrice).sub(new Decimal(newPricePrice)).abs().div(currentPrice).abs().toNumber()

    return {
      amount: params.amount,
      estimatedAmountIn: params.amount - amountInRemain,
      estimatedAmountOut: amountOut,
      estimatedEndBinId: Number(newBinId),
      estimatedFeeAmount: feeAmount,
      extraComputeLimit: 0,
      isExceed: amountInRemain > 0 || isMaxLoop,
      isMaxLoop,
      priceImpactPct: priceImpactPercentage,
      xToY: params.xtoy ?? true,
    }
  }

  /**
   * Prepare a swap transaction for a pair
   * @param pair - The LBPair to swap on
   * @param params - Swap parameters including amount, direction, recipient
   * @param tx - Optional existing transaction to add swap to
   * @returns Transaction object ready to be executed
   * @throws DlmmPairsError if sender address is invalid
   */
  public async prepareSwap(pair: LBPair, params: PrepareSwapParams, tx?: Transaction): Promise<Transaction> {
    const sender = this.sdk.senderAddress
    const recipient = params.recipient ?? sender
    const xtoy = params.xtoy ?? true

    // Validate sender address
    if (!checkInvalidSuiAddress(this.sdk.senderAddress)) {
      throw new DlmmPairsError(
        'Invalid sender address: ferra clmm sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }

    let coinX: (tx: Transaction) => TransactionResult
    let coinY: (tx: Transaction) => TransactionResult

    // Create new transaction if not provided
    tx ??= new Transaction()
    tx.setSenderIfNotSet(sender)

    // Build coin amounts based on swap direction
    if (xtoy) {
      // Swapping X to Y: set amount for X, 0 for Y
      coinX = coinWithBalance({
        type: pair.tokenXType,
        balance: params.amount,
      })
      coinY = coinWithBalance({
        type: pair.tokenYType,
        balance: 0n,
      })
    } else {
      // Swapping Y to X: set amount for Y, 0 for X
      coinX = coinWithBalance({
        type: pair.tokenXType,
        balance: 0n,
      })
      coinY = coinWithBalance({
        type: pair.tokenYType,
        balance: params.amount,
      })
    }

    // Create the swap transaction
    const [_, coinXReceipt, coinYReceipt] = TransactionUtil.createSwapTx(
      {
        pairId: pair.id,
        coinTypeX: pair.tokenXType,
        coinTypeY: pair.tokenYType,
        coinX,
        coinY,
        recipient,
        xtoy,
        minAmountOut: params.minAmountOut,
      },
      this.sdk.sdkOptions,
      tx
    )

    // Transfer the received coins to recipient
    tx.transferObjects([coinXReceipt, coinYReceipt], recipient)

    return tx
  }
}
