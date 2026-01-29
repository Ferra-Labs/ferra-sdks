// AggSwapModule.ts
import { AggPairsError, UtilsErrorCode } from "../errors/errors"
import { FerraAggregatorV2SDK } from "../sdk"
import { Transaction, TransactionObjectArgument } from "@mysten/sui/transactions"
import { checkValidSuiAddress, TransactionUtil } from "../utils"
import { IModuleV2 } from "../interfaces/IModuleV2"
import { TxBuilder } from "../utils/tx-builder"
import { SwapCustomizableOutput, SwapV2Params, SwapV2ParamsInputCustomizable } from "../interfaces/IAggSwapV2"
import { AggregatorError, RouterDataV3 } from "@cetusprotocol/aggregator-sdk"
import { EProvider, FlowxQuoteResponse, QuoteResponse } from "@7kprotocol/sdk-ts"

/**
 * AggSwapV2Module - Module for executing swaps through various DEX aggregators
 *
 * Supported providers:
 * - Cetus Aggregator
 * - FlowX (coming soon)
 * - Bluefin (coming soon)
 *
 * Flow:
 * 1. Validate sender address
 * 2. Split input coin from gas (SUI only) or use provided coin
 * 3. Route to appropriate provider's swap builder
 * 4. Return built transaction for signing
 */
export class AggSwapV2Module implements IModuleV2 {
  protected _sdk: FerraAggregatorV2SDK

  /**
   * Initialize the swap module with SDK instance
   * @param sdk - FerraAggregatorV2SDK instance
   */
  constructor(sdk: FerraAggregatorV2SDK) {
    this._sdk = sdk
  }

  /**
   * Get the SDK instance
   * @returns FerraAggregatorV2SDK instance
   */
  get sdk() {
    return this._sdk
  }

  /**
   * Execute a swap through the specified aggregator provider
   *
   * @param params - Swap parameters including quote, amounts, and coin types
   * @param params.fromType - Input coin type (e.g., "0x2::sui::SUI")
   * @param params.targetType - Output coin type
   * @param params.amountIn - Amount of input coin (in smallest unit)
   * @param params.amountOut - Expected output amount from quote
   * @param params.quote - Quote data from aggregator containing route info
   * @param slippageBps - Slippage tolerance in basis points (default: 50 = 0.5%)
   * @returns Transaction ready for signing and execution
   * @throws AggPairsError if sender address is invalid
   * @throws AggregatorError if provider is not supported
   */
  public async swap(params: SwapV2Params, slippageBps: number = 50): Promise<Transaction> {
    let tx = new Transaction()
    const sender = this.sdk.senderAddress

    // Validate sender address is set and valid
    if (!checkValidSuiAddress(sender)) {
      throw new AggPairsError(
        'Invalid sender address: ferra agg v2 sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }

    // Set transaction sender
    tx.setSender(sender)

    const { fromType, targetType, amountIn, amountOut } = params

    // Prepare input coin
    const coinIn = TransactionUtil.buildCoinAmount(fromType, BigInt(amountIn ?? 0n))
    console.log(`params.quote.provider`, params.quote.provider)
    // Route to appropriate provider's swap builder
    switch (params.quote.provider) {
      case EProvider.CETUS:
        // Build swap transaction using Cetus aggregator routes
        tx = await new TxBuilder(this._sdk).swapOnCetus({
          fromType,
          targetType,
          coinIn,
          amountOut,
          quote: params.quote.quote as RouterDataV3,
          slippageBps,
          tx,
          sender,
        })
        break

      case EProvider.FLOWX:
        tx = await new TxBuilder(this._sdk).swapOnFlowX({
          fromType,
          targetType,
          coinIn,
          quote: params.quote.quote as FlowxQuoteResponse,
          slippageBps,
          tx,
          sender,
        })
        break

      case EProvider.BLUEFIN7K:
        tx = await new TxBuilder(this._sdk).swapOnBluefin7k({
          fromType,
          targetType,
          coinIn,
          quote: params.quote.quote as QuoteResponse,
          slippageBps,
          tx,
          sender,
        })
        break

      default:
        throw new AggregatorError("Provider not supported")
    }

    return tx
  }

  public async swapCustomizable(params: SwapV2Params, slippageBps: number = 100, tx: Transaction = new Transaction()): Promise<SwapCustomizableOutput> {
    const sender = this.sdk.senderAddress

    // Validate sender address is set and valid
    if (!checkValidSuiAddress(sender)) {
      throw new AggPairsError(
        'Invalid sender address: ferra agg v2 sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }

    // Set transaction sender
    tx.setSender(sender)

    const { fromType, targetType, amountIn, amountOut } = params

    // Prepare input coin
    const coinIn = TransactionUtil.buildCoinAmount(fromType, BigInt(amountIn ?? 0n))
    console.log(`params.quote.provider`, params.quote.provider)
    let data: SwapCustomizableOutput
    // Route to appropriate provider's swap builder
    switch (params.quote.provider) {
      case EProvider.CETUS:
        // Build swap transaction using Cetus aggregator routes
        data = await new TxBuilder(this._sdk).swapCustomizableOnCetus({
          fromType,
          targetType,
          coinIn,
          amountOut,
          quote: params.quote.quote as RouterDataV3,
          slippageBps,
          tx,
          sender,
        })
        break

      case EProvider.FLOWX:
        data = await new TxBuilder(this._sdk).swapCustomizableOnFlowX({
          fromType,
          targetType,
          coinIn,
          quote: params.quote.quote as FlowxQuoteResponse,
          slippageBps,
          tx,
          sender,
        })
        break

      case EProvider.BLUEFIN7K:
        data = await new TxBuilder(this._sdk).swapCustomizableOnBluefin7k({
          fromType,
          targetType,
          coinIn,
          quote: params.quote.quote as QuoteResponse,
          slippageBps,
          tx,
          sender,
        })
        break

      default:
        throw new AggregatorError("Provider not supported")
    }

    return data
  }

  public async swapWithInputCustomizable(params: SwapV2ParamsInputCustomizable, slippageBps: number = 100, tx: Transaction = new Transaction()): Promise<SwapCustomizableOutput> {
    const sender = this.sdk.senderAddress

    // Validate sender address is set and valid
    if (!checkValidSuiAddress(sender)) {
      throw new AggPairsError(
        'Invalid sender address: ferra agg v2 sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }

    // Set transaction sender
    tx.setSender(sender)

    const { fromType, targetType, amountIn, amountOut } = params

    // Prepare input coin
    console.log(`params.quote.provider`, params.quote.provider)
    let data: SwapCustomizableOutput
    // Route to appropriate provider's swap builder
    switch (params.quote.provider) {
      case EProvider.CETUS:
        // Build swap transaction using Cetus aggregator routes
        data = await new TxBuilder(this._sdk).swapCustomizableOnCetus({
          fromType,
          targetType,
          coinIn: amountIn,
          amountOut,
          quote: params.quote.quote as RouterDataV3,
          slippageBps,
          tx,
          sender,
        })
        break

      case EProvider.FLOWX:
        data = await new TxBuilder(this._sdk).swapCustomizableOnFlowX({
          fromType,
          targetType,
          coinIn: amountIn,
          quote: params.quote.quote as FlowxQuoteResponse,
          slippageBps,
          tx,
          sender,
        })
        break

      case EProvider.BLUEFIN7K:
        data = await new TxBuilder(this._sdk).swapCustomizableOnBluefin7k({
          fromType,
          targetType,
          coinIn: amountIn,
          quote: params.quote.quote as QuoteResponse,
          slippageBps,
          tx,
          sender,
        })
        break

      default:
        throw new AggregatorError("Provider not supported")
    }

    return data
  }
}