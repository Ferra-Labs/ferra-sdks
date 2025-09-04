// AggSwapModule.ts
import { AggPairsError, UtilsErrorCode } from "../errors/errors"
import { IModule } from "../interfaces/IModule"
import { FerraAggregatorSDK } from "../sdk"
import { CachedContent } from "../utils/cached-content"
import { Transaction, TransactionObjectArgument } from "@mysten/sui/transactions"
import { AggSwapParams, SwapClmmFerraParams, SwapDlmmFerraParams } from "../interfaces/IAggSwap"
import { DexOrigins, DexTypes, TradingRoute } from "../interfaces"
import { FerraClmmAgg, FerraDlmmAgg } from "../integrates/ferra"
import { checkInvalidSuiAddress, TransactionUtil } from "../utils"
import { CoinAssist } from "../math/coin-assist"


export class AggSwapModule implements IModule {
  protected _sdk: FerraAggregatorSDK

  /**
   * Cache storage for pair data
   */
  private readonly _cache: Record<string, CachedContent> = {}

  /**
   * Initialize the pair module with SDK instance
   * @param sdk - FerraAggregatorSDK instance
   */
  constructor(sdk: FerraAggregatorSDK) {
    this._sdk = sdk
  }

  /**
   * Get the SDK instance
   * @returns FerraAggregatorSDK instance
   */
  get sdk() {
    return this._sdk
  }

  public async swapWithTradingRoutes(params: TradingRoute[]): Promise<Transaction> {
    let tx = new Transaction()

    const sender = this.sdk.senderAddress

    // Validate sender address
    if (!checkInvalidSuiAddress(this.sdk.senderAddress)) {
      throw new AggPairsError(
        'Invalid sender address: ferra agg sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }
    tx.setSender(sender)
    // Create new transaction if not provided
    tx.setSenderIfNotSet(sender)

    const coinTypeIn = params[0].swapStep[0].coinIn

    let amountIns: Array<TransactionObjectArgument> = []
    let amountOuts: Array<TransactionObjectArgument> = []

    for (let routeIndex = 0; routeIndex < params.length; routeIndex++) {
      amountIns.push(TransactionUtil.buildCoinAmount(coinTypeIn, BigInt(params[routeIndex].swapStep[0].amountIn ?? 0n)))
    }

    // Process each trading route
    for (let routeIndex = 0; routeIndex < params.length; routeIndex++) {
      const route = params[routeIndex]

      // Process each swap step in the route
      let amountIn: TransactionObjectArgument = amountIns[routeIndex]

      for (let stepIndex = 0; stepIndex < route.swapStep.length; stepIndex++) {
        const step = route.swapStep[stepIndex]

        // Create swap parameters from the step
        const swapParams: AggSwapParams = {
          poolId: step.poolAddress,
          coinTypeA: step.direction ? step.coinIn : step.coinOut,
          coinTypeB: step.direction ? step.coinOut : step.coinIn,
          amountIn: amountIn,
          atob: step.direction,
          dexOrigin: step.origin,
          dexType: step.type,
          minAmountOut: stepIndex === route.swapStep.length - 1 ? BigInt(route?.outputAmountMin ?? 0) : 0n
        }
        // Execute the swap
        const data = this.swap(tx, swapParams)

        tx = data[0]
        amountIn = data[1] //anount_in = amount_out

        if (stepIndex === route.swapStep.length - 1) {
          amountOuts.push(data[1])
        }
      }
    }

    //transfer all amountOuts to sender
    if (amountOuts.length > 1) {
      tx.mergeCoins(amountOuts[0], amountOuts.slice(1))
    }
    tx.transferObjects([amountOuts[0]], tx.pure.address(sender))

    return tx
  }

  /**
   * Execute a swap with automatic routing
   * @param params - Swap parameters
   * @returns Transaction object
   */
  private swap(tx: Transaction, params: AggSwapParams): [Transaction, TransactionObjectArgument] {
    const { dexOrigin, dexType, atob } = params
    let coinOut: TransactionObjectArgument
    try {
      switch (dexOrigin) {
        case DexOrigins.Ferra:
          [tx, coinOut] = this.switchFerraDex(tx, dexType, {
            poolId: params.poolId,
            coinTypeA: params.coinTypeA,
            coinTypeB: params.coinTypeB,
            amountIn: params.amountIn,
            atob
          })
          break;
        case DexOrigins.Cetus:
          throw new AggPairsError("Not supported")
        case DexOrigins.Navi:
          throw new AggPairsError("Not supported")
        case DexOrigins.SuiSwap:
          throw new AggPairsError("Not supported")
        case DexOrigins.Turbos:
          throw new AggPairsError("Not supported")

        default:
          throw new AggPairsError("Not supported")
      }

    } catch (error) {
      throw error
    }

    return [tx, coinOut]
  }

  private switchFerraDex(tx: Transaction, dexType: DexTypes, swapParams: SwapClmmFerraParams | SwapDlmmFerraParams): [Transaction, TransactionObjectArgument] {
    try {
      let coinOut: TransactionObjectArgument
      switch (dexType) {
        case DexTypes.CLMM:
          [tx, coinOut] = FerraClmmAgg.swap(tx, this.sdk.sdkOptions, swapParams as SwapClmmFerraParams)
          break;

        case DexTypes.DLMM:
          [tx, coinOut] = FerraDlmmAgg.swap(tx, this.sdk.sdkOptions, { ...swapParams, pairId: swapParams.poolId })
          break;

        default:
          throw new AggPairsError("Not supported")
      }
      return [tx, coinOut]

    } catch (error) {
      throw error
    }
  }

}
