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
import { ClmmFetcherModule } from '../types/sui'
import { TickData, transClmmpoolDataWithoutTicks } from '../types/clmm-pool'
import { FerraClmmSDK } from '../sdk'
import { IModule } from '../interfaces/IModule'
import { SwapUtils } from '../math/swap'
import { computeSwap } from '../math/clmm'
import { TickMath } from '../math/tick'
import { checkInvalidSuiAddress, d } from '../utils'
import { SplitPath } from './router'
import { ClmmpoolsError, ConfigErrorCode, SwapErrorCode, UtilsErrorCode } from '../errors/errors'

/**
 * Swap module for executing token swaps in CLMM pools
 * Handles swap calculations, fee estimation, price impact analysis, and transaction creation
 * Supports both single-pool and multi-pool swap operations with gas optimization
 */
export class SwapModule implements IModule {
  protected _sdk: FerraClmmSDK

  constructor(sdk: FerraClmmSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  /**
   * Calculates total swap fees across multiple split paths
   * @param splitPaths - Array of split paths containing fee information
   * @returns Total fee amount as string
   */
  calculateSwapFee(splitPaths: SplitPath[]) {
    let totalFee = d(0)

    splitPaths.forEach((pathItem) => {
      const numberOfPaths = pathItem.basePaths.length
      if (numberOfPaths > 0) {
        const firstPath = pathItem.basePaths[0]
        const feeRate = firstPath.label === 'Ferra' ? new Decimal(firstPath.feeRate).div(10 ** 6) : new Decimal(firstPath.feeRate).div(10 ** 9)
        const firstFeeAmount = d(firstPath.inputAmount)
          .div(10 ** firstPath.fromDecimal)
          .mul(feeRate)
        totalFee = totalFee.add(firstFeeAmount)

        if (numberOfPaths > 1) {
          const secondPath = pathItem.basePaths[1]
          const firstPrice = firstPath.direction ? firstPath.currentPrice : new Decimal(1).div(firstPath.currentPrice)
          const secondPrice = secondPath.direction ? secondPath.currentPrice : new Decimal(1).div(secondPath.currentPrice)
          const secondFeeRate = secondPath.label === 'Ferra' ? new Decimal(secondPath.feeRate).div(10 ** 6) : new Decimal(secondPath.feeRate).div(10 ** 9)

          const secondFeeAmount = d(secondPath.outputAmount)
            .div(10 ** secondPath.toDecimal)
            .mul(secondFeeRate)
          const adjustedSecondFee = secondFeeAmount.div(firstPrice.mul(secondPrice))
          totalFee = totalFee.add(adjustedSecondFee)
        }
      }
    })

    return totalFee.toString()
  }

  /**
   * Calculates price impact percentage across multiple split paths
   * @param splitPaths - Array of split paths for impact calculation
   * @returns Total price impact as string percentage
   */
  calculateSwapPriceImpact(splitPaths: SplitPath[]) {
    let totalImpact = d(0)

    splitPaths.forEach((pathItem) => {
      const numberOfPaths = pathItem.basePaths.length

      if (numberOfPaths === 1) {
        const singlePath = pathItem.basePaths[0]
        const outputAmount = d(singlePath.outputAmount).div(10 ** singlePath.toDecimal)
        const inputAmount = d(singlePath.inputAmount).div(10 ** singlePath.fromDecimal)
        const exchangeRate = outputAmount.div(inputAmount)
        const currentPrice = singlePath.direction ? new Decimal(singlePath.currentPrice) : new Decimal(1).div(singlePath.currentPrice)
        totalImpact = totalImpact.add(this.calculateSingleImpact(exchangeRate, currentPrice))
      }

      if (numberOfPaths === 2) {
        const firstPath = pathItem.basePaths[0]
        const secondPath = pathItem.basePaths[1]
        const firstPrice = firstPath.direction ? new Decimal(firstPath.currentPrice) : new Decimal(1).div(firstPath.currentPrice)
        const secondPrice = secondPath.direction ? new Decimal(secondPath.currentPrice) : new Decimal(1).div(secondPath.currentPrice)
        const combinedPrice = firstPrice.mul(secondPrice)
        const outputAmount = new Decimal(secondPath.outputAmount).div(10 ** secondPath.toDecimal)
        const inputAmount = new Decimal(firstPath.inputAmount).div(10 ** firstPath.fromDecimal)
        const exchangeRate = outputAmount.div(inputAmount)
        totalImpact = totalImpact.add(this.calculateSingleImpact(exchangeRate, combinedPrice))
      }
    })

    return totalImpact.toString()
  }

  /**
   * Calculates price impact for a single path
   * @param exchangeRate - Actual exchange rate achieved
   * @param marketPrice - Current market price
   * @returns Price impact percentage
   */
  private calculateSingleImpact = (exchangeRate: Decimal, marketPrice: Decimal) => {
    // Calculate impact as: ((marketPrice - exchangeRate) / marketPrice) * 100
    return marketPrice.minus(exchangeRate).div(marketPrice).mul(100)
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
        target: `${integrate.published_at}::${ClmmFetcherModule}::calculate_swap_result`,
        arguments: transactionArgs,
        typeArguments: coinTypes,
      })
    }

    if (!checkInvalidSuiAddress(simulationAccount.address)) {
      throw new ClmmpoolsError('Invalid simulation account configuration', ConfigErrorCode.InvalidSimulateAccount)
    }

    const simulationResult = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: transaction,
      sender: simulationAccount.address,
    })

    if (simulationResult.error != null) {
      throw new ClmmpoolsError(
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
      throw new ClmmpoolsError('Event data length does not match pool count', SwapErrorCode.ParamsLengthNotEqual)
    }

    let optimalAmount = swapParams.byAmountIn ? ZERO : U64_MAX
    let optimalPoolIndex = 0

    for (let eventIndex = 0; eventIndex < swapEventData.length; eventIndex += 1) {
      if (swapEventData[eventIndex].parsedJson.data.is_exceed) {
        continue
      }

      if (swapParams.byAmountIn) {
        const outputAmount = new BN(swapEventData[eventIndex].parsedJson.data.amount_out)
        if (outputAmount.gt(optimalAmount)) {
          optimalPoolIndex = eventIndex
          optimalAmount = outputAmount
        }
      } else {
        const outputAmount = new BN(swapEventData[eventIndex].parsedJson.data.amount_out)
        if (outputAmount.lt(optimalAmount)) {
          optimalPoolIndex = eventIndex
          optimalAmount = outputAmount
        }
      }
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
      transaction.pure.u64(swapParams.amount)
    ]

    transaction.moveCall({
      target: `${integrate.published_at}::${ClmmFetcherModule}::calculate_swap_result`,
      arguments: transactionArgs,
      typeArguments: coinTypes,
    })

    if (!checkInvalidSuiAddress(simulationAccount.address)) {
      throw new ClmmpoolsError('Invalid simulation account configuration', ConfigErrorCode.InvalidSimulateAccount)
    }

    const simulationResult = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: transaction,
      sender: simulationAccount.address,
    })

    if (simulationResult.error != null) {
      throw new ClmmpoolsError(
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
    const calculatedAmountIn = simulationData.amount_in && simulationData.fee_amount
      ? new BN(simulationData.amount_in).add(new BN(simulationData.fee_amount)).toString()
      : ''

    return {
      poolAddress: swapParams.pool.poolAddress,
      currentSqrtPrice: swapParams.currentSqrtPrice,
      estimatedAmountIn: calculatedAmountIn,
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

    const calculatedAmountIn = data.amount_in && data.fee_amount
      ? new BN(data.amount_in).add(new BN(data.fee_amount)).toString()
      : ''

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
    const poolData = transClmmpoolDataWithoutTicks(currentPool)

    let sortedTicks
    if (calculationParams.a2b) {
      sortedTicks = calculationParams.swapTicks.sort((tickA, tickB) => {
        return tickB.index - tickA.index
      })
    } else {
      sortedTicks = calculationParams.swapTicks.sort((tickA, tickB) => {
        return tickA.index - tickB.index
      })
    }

    const swapCalculationResult = computeSwap(calculationParams.a2b, calculationParams.byAmountIn, calculationParams.amount, poolData, sortedTicks)

    let hasExceededLimits = false
    if (calculationParams.byAmountIn) {
      hasExceededLimits = swapCalculationResult.amountIn.lt(calculationParams.amount)
    } else {
      hasExceededLimits = swapCalculationResult.amountOut.lt(calculationParams.amount)
    }

    const priceLimit = SwapUtils.getDefaultSqrtPriceLimit(calculationParams.a2b)
    if (calculationParams.a2b && swapCalculationResult.nextSqrtPrice.lt(priceLimit)) {
      hasExceededLimits = true
    }

    if (!calculationParams.a2b && swapCalculationResult.nextSqrtPrice.gt(priceLimit)) {
      hasExceededLimits = true
    }

    let additionalComputeLimit = 0
    if (swapCalculationResult.crossTickNum > 6 && swapCalculationResult.crossTickNum < 40) {
      additionalComputeLimit = 22000 * (swapCalculationResult.crossTickNum - 6)
    }

    if (swapCalculationResult.crossTickNum > 40) {
      hasExceededLimits = true
    }

    const initialPrice = TickMath.sqrtPriceX64ToPrice(poolData.currentSqrtPrice, calculationParams.decimalsA, calculationParams.decimalsB).toNumber()
    const finalPrice = TickMath.sqrtPriceX64ToPrice(swapCalculationResult.nextSqrtPrice, calculationParams.decimalsA, calculationParams.decimalsB).toNumber()

    const priceImpactPercentage = (Math.abs(initialPrice - finalPrice) / initialPrice) * 100

    return {
      estimatedAmountIn: swapCalculationResult.amountIn,
      estimatedAmountOut: swapCalculationResult.amountOut,
      estimatedEndSqrtPrice: swapCalculationResult.nextSqrtPrice,
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
   * Creates a complete swap transaction with automatic coin management
   * @param swapParams - Parameters for swap execution
   * @param gasEstimationConfig - Optional gas estimation configuration for SUI swaps
   * @returns Promise resolving to executable transaction
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
    if (!checkInvalidSuiAddress(this.sdk.senderAddress)) {
      throw new ClmmpoolsError(
        'Invalid sender address: Ferra CLMM SDK requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }

    const userCoinAssets = await this._sdk.getOwnerCoinAssets(this.sdk.senderAddress)

    if (gasEstimationConfig) {
      const { isAdjustCoinA, isAdjustCoinB } = findAdjustCoin(swapParams)

      if ((swapParams.a2b && isAdjustCoinA) || (!swapParams.a2b && isAdjustCoinB)) {
        const gasOptimizedTransaction = await TransactionUtil.buildSwapTransactionForGas(this._sdk, swapParams, userCoinAssets, gasEstimationConfig)
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
    if (!checkInvalidSuiAddress(this.sdk.senderAddress)) {
      throw new ClmmpoolsError(
        'Invalid sender address: Ferra CLMM SDK requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }

    const userCoinAssets = await this._sdk.getOwnerCoinAssets(this.sdk.senderAddress)

    if (gasEstimationConfig) {
      const { isAdjustCoinA, isAdjustCoinB } = findAdjustCoin(swapParams)

      if ((swapParams.a2b && isAdjustCoinA) || (!swapParams.a2b && isAdjustCoinB)) {
        const gasOptimizedResult = await TransactionUtil.buildSwapTransactionWithoutTransferCoinsForGas(this._sdk, swapParams, userCoinAssets, gasEstimationConfig)
        return gasOptimizedResult
      }
    }

    return TransactionUtil.buildSwapTransactionWithoutTransferCoins(this.sdk, swapParams, userCoinAssets)
  }
}