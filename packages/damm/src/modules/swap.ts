import BN from 'bn.js'
import Decimal from 'decimal.js'
import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions'
import {
  CalculateRatesParams,
  CalculateRatesResult,
  Pool,
  PreSwapParams,
  PreSwapWithMultiPoolParams,
  SwapParams,
  TransPreSwapWithMultiPoolParams,
} from '../types'
import { Percentage, U64_MAX, ZERO } from '../math'
import { findAdjustCoin, TransactionUtil } from '../utils/transaction-util'
import { extractStructTagFromType } from '../utils/contracts'
import { CLOCK_ADDRESS, DammFetcherModule } from '../types/sui'
import { TickData, transDammpoolDataWithoutTicks } from '../types/damm-pool'
import { FerraDammSDK } from '../sdk'
import { IModule } from '../interfaces/IModule'
import { SwapUtils } from '../math/swap'
import { computeSwap } from '../math/damm'
import { TickMath } from '../math/tick'
import { checkValidSuiAddress, d } from '../utils'
import { SplitPath } from './router'
import { DammpoolsError, ConfigErrorCode, SwapErrorCode, UtilsErrorCode } from '../errors/errors'
import { simulateSwap } from '../utils/swap-utils'

/**
 * Swap module for executing token swaps in DAMM pools
 * Handles swap calculations, fee estimation, price impact analysis, and transaction creation
 * Supports both single-pool and multi-pool swap operations with gas optimization
 */
export class SwapModule implements IModule {
  protected _sdk: FerraDammSDK

  constructor(sdk: FerraDammSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  /**
   * Performs pre-swap simulation across multiple pools to find optimal execution
   * @param swapParams - Parameters for multi-pool swap simulation
   * @returns Promise resolving to optimal swap data or null if no valid swap found
   */
  async preSwapWithMultiPool(swapParams: PreSwapWithMultiPoolParams) {
    const { integrate, simulationAccount } = this.sdk.sdkOptions
    const transaction = new Transaction()

    const coinTypes = [swapParams.coinTypeA, swapParams.coinTypeB]
    for (let poolIndex = 0; poolIndex < swapParams.poolAddresses.length; poolIndex += 1) {
      const transactionArgs = [
        transaction.object(swapParams.poolAddresses[poolIndex]),
        transaction.pure.bool(swapParams.a2b),
        transaction.pure.bool(swapParams.byAmountIn),
        transaction.pure.u64(swapParams.amount),
      ]
      transaction.moveCall({
        target: `${integrate.published_at}::${DammFetcherModule}::calculate_swap_result`,
        arguments: transactionArgs,
        typeArguments: coinTypes,
      })
    }

    if (!checkValidSuiAddress(simulationAccount.address)) {
      throw new DammpoolsError('Invalid simulation account configuration', ConfigErrorCode.InvalidSimulateAccount)
    }

    const simulationResult = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: transaction,
      sender: simulationAccount.address,
    })

    if (simulationResult.error != null) {
      throw new DammpoolsError(
        `Multi-pool pre-swap failed: ${simulationResult.error ?? 'unknown error'}, please check configuration and parameters`,
        ConfigErrorCode.InvalidConfig
      )
    }

    const swapEventData: any = simulationResult.events?.filter((event: any) => {
      return extractStructTagFromType(event.type).name === `CalculatedSwapResultEvent`
    })

    if (swapEventData.length === 0) {
      return null
    }

    if (swapEventData.length !== swapParams.poolAddresses.length) {
      throw new DammpoolsError('Event data length does not match pool count', SwapErrorCode.ParamsLengthNotEqual)
    }

    let optimalAmount = swapParams.byAmountIn ? ZERO : U64_MAX
    let optimalPoolIndex = -1

    for (let eventIndex = 0; eventIndex < swapEventData.length; eventIndex += 1) {
      if (swapEventData[eventIndex].parsedJson.data.is_exceed) {
        continue
      }
      const outputAmount = swapParams.byAmountIn
        ? new BN(swapEventData[eventIndex].parsedJson.data.amount_out)
        : new BN(swapEventData[eventIndex].parsedJson.data.amount_in)

      if (optimalPoolIndex === -1) {
        optimalPoolIndex = eventIndex
        optimalAmount = outputAmount
      } else if (swapParams.byAmountIn && outputAmount.gt(optimalAmount)) {
        optimalPoolIndex = eventIndex
        optimalAmount = outputAmount
      } else if (!swapParams.byAmountIn && outputAmount.lt(optimalAmount)) {
        optimalPoolIndex = eventIndex
        optimalAmount = outputAmount
      }
    }

    if (optimalPoolIndex === -1) {
      throw new Error('No valid pool for swap')
    }

    return this.transformSwapWithMultiPoolData(
      {
        poolAddress: swapParams.poolAddresses[optimalPoolIndex],
        a2b: swapParams.a2b,
        byAmountIn: swapParams.byAmountIn,
        amount: swapParams.amount,
        coinTypeA: swapParams.coinTypeA,
        coinTypeB: swapParams.coinTypeB,
      },
      swapEventData[optimalPoolIndex].parsedJson
    )
  }

  /**
   * Performs pre-swap simulation for a single pool
   * @param swapParams - Parameters for single pool swap simulation
   * @returns Promise resolving to swap simulation data or null if simulation fails
   */
  async preswap(swapParams: PreSwapParams) {
    const { integrate, simulationAccount } = this.sdk.sdkOptions

    const transaction = new Transaction()

    const coinTypes = [swapParams.coinTypeA, swapParams.coinTypeB]
    const transactionArgs = [
      transaction.object(swapParams.pool.poolAddress),
      transaction.pure.bool(swapParams.a2b),
      transaction.pure.bool(swapParams.byAmountIn),
      transaction.pure.u64(swapParams.amount),
      transaction.object(CLOCK_ADDRESS),
    ]

    transaction.moveCall({
      target: `${integrate.published_at}::${DammFetcherModule}::calculate_swap_result`,
      arguments: transactionArgs,
      typeArguments: coinTypes,
    })

    if (!checkValidSuiAddress(simulationAccount.address)) {
      throw new DammpoolsError('Invalid simulation account configuration', ConfigErrorCode.InvalidSimulateAccount)
    }

    const simulationResult = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: transaction,
      sender: simulationAccount.address,
    })

    if (simulationResult.error != null) {
      throw new DammpoolsError(
        `Pre-swap simulation failed: ${simulationResult.error ?? 'unknown error'}, please check configuration and parameters`,
        ConfigErrorCode.InvalidConfig
      )
    }

    const swapEventData: any = simulationResult.events?.filter((event: any) => {
      return extractStructTagFromType(event.type).name === `CalculatedSwapResultEvent`
    })

    if (swapEventData.length === 0) {
      return null
    }

    return this.transformSwapData(swapParams, swapEventData[0].parsedJson.data)
  }

  /**
   * Transforms raw swap simulation data into structured swap result
   * @param swapParams - Original swap parameters
   * @param simulationData - Raw simulation result data
   * @returns Structured swap data object
   */
  private transformSwapData(swapParams: PreSwapParams, simulationData: any) {
    return {
      poolAddress: swapParams.pool.poolAddress,
      currentSqrtPrice: swapParams.currentSqrtPrice,
      estimatedAmountIn: simulationData.amount_in,
      estimatedAmountOut: simulationData.amount_out,
      estimatedEndSqrtPrice: simulationData.after_sqrt_price,
      estimatedFeeAmount: simulationData.fee_amount,
      isExceed: simulationData.is_exceed,
      amount: swapParams.amount,
      aToB: swapParams.a2b,
      byAmountIn: swapParams.byAmountIn,
    }
  }

  /**
   * Transforms multi-pool swap simulation data into structured result
   * @param swapParams - Original multi-pool swap parameters
   * @param responseData - Raw JSON response from simulation
   * @returns Structured multi-pool swap data object
   */
  private transformSwapWithMultiPoolData(swapParams: TransPreSwapWithMultiPoolParams, responseData: any) {
    const { data } = responseData

    console.log('Multi-pool swap simulation data: ', data)

    const calculatedAmountIn = data.amount_in && data.fee_amount ? new BN(data.amount_in).add(new BN(data.fee_amount)).toString() : ''

    return {
      poolAddress: swapParams.poolAddress,
      estimatedAmountIn: calculatedAmountIn,
      estimatedAmountOut: data.amount_out,
      estimatedEndSqrtPrice: data.after_sqrt_price,
      estimatedStartSqrtPrice: data.step_results[0].current_sqrt_price,
      estimatedFeeAmount: data.fee_amount,
      isExceed: data.is_exceed,
      amount: swapParams.amount,
      aToB: swapParams.a2b,
      byAmountIn: swapParams.byAmountIn,
    }
  }

  /**
   * Calculates swap rates and impact metrics using local computation
   * @param calculationParams - Parameters for rate calculation including pool data and ticks
   * @returns Detailed calculation results including amounts, fees, and price impact
   */
  calculateRates(calculationParams: CalculateRatesParams): CalculateRatesResult {
    const { currentPool } = calculationParams
    const currentTimestampMs = new BN(Date.now())

    const sortedTicks = calculationParams.swapTicks.sort((tickA, tickB) => {
      return tickA.index - tickB.index
    })

    const swapCalculationResult = simulateSwap(
      currentPool,
      sortedTicks,
      calculationParams.a2b,
      calculationParams.byAmountIn,
      calculationParams.amount,
      currentTimestampMs,
    )

    let hasExceededLimits = false
    if (calculationParams.byAmountIn) {
      hasExceededLimits = swapCalculationResult.amountIn.lt(calculationParams.amount)
    } else {
      hasExceededLimits = swapCalculationResult.amountOut.lt(calculationParams.amount)
    }

    const priceLimit = SwapUtils.getDefaultSqrtPriceLimit(calculationParams.a2b)
    if (calculationParams.a2b && swapCalculationResult.afterSqrtPrice.lt(priceLimit)) {
      hasExceededLimits = true
    }

    if (!calculationParams.a2b && swapCalculationResult.afterSqrtPrice.gt(priceLimit)) {
      hasExceededLimits = true
    }

    let additionalComputeLimit = 0
    if (swapCalculationResult.stepResults.length > 6 && swapCalculationResult.stepResults.length < 40) {
      additionalComputeLimit = 22000 * (swapCalculationResult.stepResults.length - 6)
    }

    if (swapCalculationResult.stepResults.length > 40) {
      hasExceededLimits = true
    }

    let initialPrice = TickMath.sqrtPriceX64ToPrice(
      new BN(currentPool.currentSqrtPrice),
      calculationParams.decimalsA,
      calculationParams.decimalsB
    ).toNumber()
    let decimalAdjustment = Math.pow(10, calculationParams.decimalsA - calculationParams.decimalsB)

    if (calculationParams.a2b === false) {
      initialPrice = 1 / initialPrice
      decimalAdjustment = Math.pow(10, calculationParams.decimalsB - calculationParams.decimalsA)
    }

    const executionPrice = new Decimal(swapCalculationResult.amountOut.toNumber())
      .div(swapCalculationResult.amountIn.toNumber())
      .mul(decimalAdjustment)
      .toNumber()

    const priceImpactPercentage = ((executionPrice - initialPrice) / initialPrice) * 100

    return {
      estimatedAmountIn: swapCalculationResult.amountIn,
      estimatedAmountOut: swapCalculationResult.amountOut,
      estimatedEndSqrtPrice: swapCalculationResult.afterSqrtPrice,
      estimatedFeeAmount: swapCalculationResult.feeAmount,
      isExceed: hasExceededLimits,
      extraComputeLimit: additionalComputeLimit,
      amount: calculationParams.amount,
      aToB: calculationParams.a2b,
      byAmountIn: calculationParams.byAmountIn,
      priceImpactPct: priceImpactPercentage,
    }
  }

  /**
   * Creates a transaction for multi-hop swap execution
   * Builds the complete swap path through multiple pools
   * @param params - Swap parameters including path and partner info
   * @returns Transaction ready for execution
   * @example
   * // First find the best route
   * const route = await sdk.Router.getBestInternalRouter({
   *   from: "0x2::sui::SUI",
   *   target: "0x5d4b...::usdc::USDC",
   *   amount: "1000000000",
   *   byAmountIn: true
   * });
   *
   * // Then create transaction
   * const tx = await sdk.Router.createSwapTransactionPayload({
   *   paths: route.paths,
   *   partner: null,        // Or partner ID for fee sharing
   *   byAmountIn: true
   * });
   *
   * const result = await sdk.fullClient.signAndExecuteTransaction({
   *   transaction: tx,
   *   signer: keypair
   * });
   */
  async createSwapTransactionPayload(
    swapParams: SwapParams,
    gasEstimationConfig?: {
      byAmountIn: boolean
      slippage: Percentage
      decimalsA: number
      decimalsB: number
      swapTicks: Array<TickData>
      currentPool: Pool
    }
  ): Promise<Transaction> {
    if (!checkValidSuiAddress(this.sdk.senderAddress)) {
      throw new DammpoolsError(
        'Invalid sender address: Ferra DAMM SDK requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }

    const userCoinAssets = await this._sdk.getOwnerCoinAssets(this.sdk.senderAddress)

    if (gasEstimationConfig) {
      const { isAdjustCoinA, isAdjustCoinB } = findAdjustCoin(swapParams)

      if ((swapParams.a2b && isAdjustCoinA) || (!swapParams.a2b && isAdjustCoinB)) {
        const gasOptimizedTransaction = await TransactionUtil.buildSwapTransactionForGas(
          this._sdk,
          swapParams,
          userCoinAssets,
          gasEstimationConfig
        )
        return gasOptimizedTransaction
      }
    }

    return TransactionUtil.buildSwapTransaction(this.sdk, swapParams, userCoinAssets)
  }

  /**
   * Creates a swap transaction without automatic coin transfers (for advanced usage)
   * @param swapParams - Parameters for swap execution
   * @param gasEstimationConfig - Optional gas estimation configuration for SUI swaps
   * @returns Promise resolving to transaction and coin arguments for manual handling
   */
  async createSwapTransactionWithoutTransferCoinsPayload(
    swapParams: SwapParams,
    gasEstimationConfig?: {
      byAmountIn: boolean
      slippage: Percentage
      decimalsA: number
      decimalsB: number
      swapTicks: Array<TickData>
      currentPool: Pool
    }
  ): Promise<{ tx: Transaction; coinABs: TransactionObjectArgument[] }> {
    if (!checkValidSuiAddress(this.sdk.senderAddress)) {
      throw new DammpoolsError(
        'Invalid sender address: Ferra DAMM SDK requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }

    const userCoinAssets = await this._sdk.getOwnerCoinAssets(this.sdk.senderAddress)

    if (gasEstimationConfig) {
      const { isAdjustCoinA, isAdjustCoinB } = findAdjustCoin(swapParams)

      if ((swapParams.a2b && isAdjustCoinA) || (!swapParams.a2b && isAdjustCoinB)) {
        const gasOptimizedResult = await TransactionUtil.buildSwapTransactionWithoutTransferCoinsForGas(
          this._sdk,
          swapParams,
          userCoinAssets,
          gasEstimationConfig
        )
        return gasOptimizedResult
      }
    }

    return TransactionUtil.buildSwapTransactionWithoutTransferCoins(this.sdk, swapParams, userCoinAssets)
  }
}
