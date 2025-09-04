import BN from 'bn.js'
import Decimal from 'decimal.js'
import { coinWithBalance, Transaction, TransactionObjectArgument, TransactionResult } from '@mysten/sui/transactions'
import { CoinAssist } from '../math/coin-assist'
import { TickData } from '../types/clmm-pool'
import {
  ClmmIntegrateRouterWithPartnerModule,
  ClmmIntegratePoolModule,
  ClmmIntegrateRouterModule,
  ClmmIntegrateUtilsModule,
  CLOCK_ADDRESS,
} from '../types/sui'
import SDK, {
  AddLiquidityFixTokenParams,
  adjustForSlippage,
  asUintN,
  ClmmPoolUtil,
  CoinAsset,
  CoinPairType,
  CollectRewarderParams,
  d,
  getPackagerConfigs,
  normalizeCoinType,
  Percentage,
  Pool,
  SdkOptions,
  SwapParams,
  SwapUtils,
  ZERO,
} from '../index'
import { BasePath, OnePath, SwapWithRouterParams } from '../modules/router'
import { ClmmpoolsError, ConfigErrorCode, UtilsErrorCode } from '../errors/errors'

export type AdjustResult = {
  isAdjustCoinA: boolean
  isAdjustCoinB: boolean
}

/**
 * Determines which coins in a pair are SUI tokens that need adjustment
 * @param coinPair - Pair of coin types to check
 * @returns Object indicating which coins are SUI and need adjustment
 */
export function findAdjustCoin(coinPair: CoinPairType): AdjustResult {
  const isAdjustCoinA = CoinAssist.isSuiCoin(coinPair.coinTypeA)
  const isAdjustCoinB = CoinAssist.isSuiCoin(coinPair.coinTypeB)
  return { isAdjustCoinA, isAdjustCoinB }
}

export type BuildCoinResult = {
  targetCoin: TransactionObjectArgument
  remainCoins: CoinAsset[]
  isMintZeroCoin: boolean
  tragetCoinAmount: string
  originalSplitedCoin?: TransactionObjectArgument
}

type CoinInputInterval = {
  amountSecond: bigint
  amountFirst: bigint
}

/**
 * Calculates the reverse slippage amount for liquidity operations
 * @param slippageAmount - Amount affected by slippage
 * @param slippageRate - Slippage rate as decimal
 * @returns Adjusted amount string
 */
function reverseSlippageAmount(slippageAmount: number | string, slippageRate: number): string {
  return Decimal.ceil(d(slippageAmount).div(1 + slippageRate)).toString()
}

/**
 * Utility function for debugging transaction structure
 * @param transaction - Transaction to inspect
 * @param enablePrint - Whether to print command details
 */
export async function printTransaction(transaction: Transaction, enablePrint = true) {
  console.log(`Transaction inputs:`, transaction.getData().inputs)
  transaction.getData().commands.forEach((command, commandIndex) => {
    if (enablePrint) {
      console.log(`Command ${commandIndex}: `, command)
    }
  })
}

interface TransferredCoin {
  coinType: string
  coin: TransactionObjectArgument
}

/**
 * Transaction utility class for building CLMM-related transactions
 * Provides methods for liquidity operations, swaps, and coin management
 */
export class TransactionUtil {
  /**
   * Creates transaction parameters for collecting rewards and fees
   * @param sdk - SDK instance
   * @param transaction - Transaction to modify
   * @param rewarderParams - Parameters for reward collection
   * @param allCoinAssets - All available coin assets
   * @param coinAssetsA - Optional coin assets for token A
   * @param coinAssetsB - Optional coin assets for token B
   * @returns Modified transaction with reward collection logic
   */
  static createCollectRewarderAndFeeParams(
    sdk: SDK,
    transaction: Transaction,
    rewarderParams: CollectRewarderParams,
    allCoinAssets: CoinAsset[],
    coinAssetsA?: CoinAsset[],
    coinAssetsB?: CoinAsset[]
  ) {
    if (coinAssetsA === undefined) {
      coinAssetsA = [...allCoinAssets]
    }
    if (coinAssetsB === undefined) {
      coinAssetsB = [...allCoinAssets]
    }

    const normalizedCoinTypeA = normalizeCoinType(rewarderParams.coinTypeA)
    const normalizedCoinTypeB = normalizeCoinType(rewarderParams.coinTypeB)

    if (rewarderParams.collect_fee) {
      const zeroCoinAInput = TransactionUtil.buildCoinForAmount(transaction, coinAssetsA, BigInt(0), normalizedCoinTypeA, false)
      coinAssetsA = zeroCoinAInput.remainCoins

      const zeroCoinBInput = TransactionUtil.buildCoinForAmount(transaction, coinAssetsB, BigInt(0), normalizedCoinTypeB, false)
      coinAssetsB = zeroCoinBInput.remainCoins

      transaction = sdk.Position.createCollectFeePaylod(
        {
          pool_id: rewarderParams.pool_id,
          pos_id: rewarderParams.pos_id,
          coinTypeA: rewarderParams.coinTypeA,
          coinTypeB: rewarderParams.coinTypeB,
        },
        transaction,
        zeroCoinAInput.targetCoin,
        zeroCoinBInput.targetCoin
      )
    }

    const rewarderCoinInputs: TransactionObjectArgument[] = []
    rewarderParams.rewarder_coin_types.forEach((coinType) => {
      switch (normalizeCoinType(coinType)) {
        case normalizedCoinTypeA:
          rewarderCoinInputs.push(TransactionUtil.buildCoinForAmount(transaction, coinAssetsA!, BigInt(0), coinType, false).targetCoin)
          break
        case normalizedCoinTypeB:
          rewarderCoinInputs.push(TransactionUtil.buildCoinForAmount(transaction, coinAssetsB!, BigInt(0), coinType, false).targetCoin)
          break
        default:
          rewarderCoinInputs.push(TransactionUtil.buildCoinForAmount(transaction, allCoinAssets, BigInt(0), coinType, false).targetCoin)
          break
      }
    })

    transaction = sdk.Rewarder.createCollectRewarderPaylod(rewarderParams, transaction, rewarderCoinInputs)
    return transaction
  }

  /**
   * Adjusts transaction parameters to account for gas costs
   * @param sdk - SDK instance
   * @param availableCoins - Available coin assets
   * @param requiredAmount - Required amount for operation
   * @param transaction - Transaction to analyze
   * @returns Adjusted amount and optionally a new transaction
   */
  static async adjustTransactionForGas(
    sdk: SDK,
    availableCoins: CoinAsset[],
    requiredAmount: bigint,
    transaction: Transaction
  ): Promise<{ fixAmount: bigint; newTx?: Transaction }> {
    transaction.setSender(sdk.senderAddress)

    // Select coins that can cover the required amount
    const amountCoins = CoinAssist.selectCoinAssetGreaterThanOrEqual(availableCoins, requiredAmount).selectedCoins
    if (amountCoins.length === 0) {
      throw new ClmmpoolsError(`Insufficient balance`, UtilsErrorCode.InsufficientBalance)
    }

    const totalBalance = CoinAssist.calculateTotalBalance(availableCoins)
    // If remaining balance is sufficient, no gas adjustment needed
    if (totalBalance - requiredAmount > 1000000000) {
      return { fixAmount: requiredAmount }
    }

    // Estimate gas consumption for the transaction
    const estimatedGasCost = await sdk.fullClient.calculationTxGas(transaction)

    // Find coins that can cover gas costs
    const gasCoins = CoinAssist.selectCoinAssetGreaterThanOrEqual(
      availableCoins,
      BigInt(estimatedGasCost),
      amountCoins.map((coin) => coin.coinObjectId)
    ).selectedCoins

    // Adjust amount if insufficient gas
    if (gasCoins.length === 0) {
      // Reserve additional gas for split operations
      const totalGasNeeded = BigInt(estimatedGasCost) + BigInt(500)
      if (totalBalance - requiredAmount < totalGasNeeded) {
        requiredAmount -= totalGasNeeded
        if (requiredAmount < 0) {
          throw new ClmmpoolsError(`Insufficient balance for gas`, UtilsErrorCode.InsufficientBalance)
        }

        const newTransaction = new Transaction()
        return { fixAmount: requiredAmount, newTx: newTransaction }
      }
    }
    return { fixAmount: requiredAmount }
  }

  // -----------------------------------------liquidity-----------------------------------------------//
  /**
   * Builds add liquidity transaction with gas optimization for SUI tokens
   * @param sdk - SDK instance
   * @param allCoins - All available coin assets
   * @param liquidityParams - Parameters for adding liquidity
   * @param gasEstimationConfig - Gas estimation configuration
   * @param transaction - Optional existing transaction
   * @param inputCoinA - Optional pre-built coin A input
   * @param inputCoinB - Optional pre-built coin B input
   * @returns Transaction with gas-optimized liquidity addition
   */
  static async buildAddLiquidityFixTokenForGas(
    sdk: SDK,
    allCoins: CoinAsset[],
    liquidityParams: AddLiquidityFixTokenParams,
    gasEstimationConfig: {
      slippage: number
      curSqrtPrice: BN
    },
    transaction?: Transaction,
    inputCoinA?: TransactionObjectArgument,
    inputCoinB?: TransactionObjectArgument
  ): Promise<Transaction> {
    transaction = await TransactionUtil.buildAddLiquidityFixToken(sdk, allCoins, liquidityParams, transaction, inputCoinA, inputCoinB)

    const { isAdjustCoinA } = findAdjustCoin(liquidityParams)

    const suiTokenAmount = isAdjustCoinA ? liquidityParams.amount_a : liquidityParams.amount_b

    const gasAdjustmentResult = await TransactionUtil.adjustTransactionForGas(
      sdk,
      CoinAssist.getCoinAssets(isAdjustCoinA ? liquidityParams.coinTypeA : liquidityParams.coinTypeB, allCoins),
      BigInt(suiTokenAmount),
      transaction
    )

    const { fixAmount } = gasAdjustmentResult
    const { newTx } = gasAdjustmentResult

    if (newTx != null) {
      let coinAInputs: BuildCoinResult
      let coinBInputs: BuildCoinResult

      if (isAdjustCoinA) {
        liquidityParams.amount_a = Number(fixAmount)
        coinAInputs = TransactionUtil.buildAddLiquidityFixTokenCoinInput(
          newTx,
          !liquidityParams.fix_amount_a,
          fixAmount.toString(),
          liquidityParams.slippage,
          liquidityParams.coinTypeA,
          allCoins,
          false,
          true
        )
        coinBInputs = TransactionUtil.buildAddLiquidityFixTokenCoinInput(
          newTx,
          liquidityParams.fix_amount_a,
          liquidityParams.amount_b,
          liquidityParams.slippage,
          liquidityParams.coinTypeB,
          allCoins,
          false,
          true
        )
      } else {
        liquidityParams.amount_b = Number(fixAmount)
        coinAInputs = TransactionUtil.buildAddLiquidityFixTokenCoinInput(
          newTx,
          !liquidityParams.fix_amount_a,
          liquidityParams.amount_a,
          liquidityParams.slippage,
          liquidityParams.coinTypeA,
          allCoins,
          false,
          true
        )
        coinBInputs = TransactionUtil.buildAddLiquidityFixTokenCoinInput(
          newTx,
          liquidityParams.fix_amount_a,
          fixAmount.toString(),
          liquidityParams.slippage,
          liquidityParams.coinTypeB,
          allCoins,
          false,
          true
        )
        liquidityParams = TransactionUtil.fixAddLiquidityFixTokenParams(liquidityParams, gasEstimationConfig.slippage, gasEstimationConfig.curSqrtPrice)

        transaction = await TransactionUtil.buildAddLiquidityFixTokenArgs(newTx, sdk, allCoins, liquidityParams, coinAInputs, coinBInputs)
        return transaction
      }
    }
    return transaction
  }

  /**
   * Builds basic add liquidity transaction
   * @param sdk - SDK instance
   * @param allCoinAssets - All available coin assets
   * @param liquidityParams - Parameters for adding liquidity
   * @param transaction - Optional existing transaction
   * @param inputCoinA - Optional pre-built coin A input
   * @param inputCoinB - Optional pre-built coin B input
   * @returns Transaction for adding liquidity
   */
  static async buildAddLiquidityFixToken(
    sdk: SDK,
    allCoinAssets: CoinAsset[],
    liquidityParams: AddLiquidityFixTokenParams,
    transaction?: Transaction,
    inputCoinA?: TransactionObjectArgument,
    inputCoinB?: TransactionObjectArgument
  ): Promise<Transaction> {
    if (sdk.senderAddress.length === 0) {
      throw Error('SDK sender address is required but not configured')
    }

    transaction = transaction || new Transaction()

    let coinAInputs: BuildCoinResult
    let coinBInputs: BuildCoinResult

    if (inputCoinA == null || inputCoinB == null) {
      coinAInputs = TransactionUtil.buildAddLiquidityFixTokenCoinInput(
        transaction,
        !liquidityParams.fix_amount_a,
        liquidityParams.amount_a,
        liquidityParams.slippage,
        liquidityParams.coinTypeA,
        allCoinAssets,
        false,
        true
      )
      coinBInputs = TransactionUtil.buildAddLiquidityFixTokenCoinInput(
        transaction,
        liquidityParams.fix_amount_a,
        liquidityParams.amount_b,
        liquidityParams.slippage,
        liquidityParams.coinTypeB,
        allCoinAssets,
        false,
        true
      )
    } else {
      coinAInputs = {
        targetCoin: inputCoinA,
        remainCoins: [],
        isMintZeroCoin: false,
        tragetCoinAmount: '0',
      }
      coinBInputs = {
        targetCoin: inputCoinB,
        remainCoins: [],
        isMintZeroCoin: false,
        tragetCoinAmount: '0',
      }
    }

    transaction = TransactionUtil.buildAddLiquidityFixTokenArgs(
      transaction,
      sdk,
      allCoinAssets,
      liquidityParams as AddLiquidityFixTokenParams,
      coinAInputs,
      coinBInputs
    )
    return transaction
  }

  /**
   * Builds coin input for add liquidity operations with slippage handling
   * @param transaction - Transaction to modify
   * @param needIntervalAmount - Whether amount needs interval calculation
   * @param amount - Amount to use
   * @param slippageRate - Slippage rate
   * @param coinType - Type of coin
   * @param allCoinAssets - Available coin assets
   * @param buildVector - Whether to build as vector
   * @param fixAmount - Whether to fix amount exactly
   * @returns Built coin result
   */
  public static buildAddLiquidityFixTokenCoinInput(
    transaction: Transaction,
    needIntervalAmount: boolean,
    amount: number | string,
    slippageRate: number,
    coinType: string,
    allCoinAssets: CoinAsset[],
    buildVector = true,
    fixAmount = true
  ): BuildCoinResult {
    return needIntervalAmount
      ? TransactionUtil.buildCoinForAmountInterval(
          transaction,
          allCoinAssets,
          { amountSecond: BigInt(reverseSlippageAmount(amount, slippageRate)), amountFirst: BigInt(amount) },
          coinType,
          buildVector,
          fixAmount
        )
      : TransactionUtil.buildCoinForAmount(transaction, allCoinAssets, BigInt(amount), coinType, buildVector, fixAmount)
  }

  /**
   * Adjusts liquidity parameters based on current pool state
   * @param liquidityParams - Original liquidity parameters
   * @param slippageRate - Slippage tolerance
   * @param currentSqrtPrice - Current pool sqrt price
   * @returns Adjusted liquidity parameters
   */
  static fixAddLiquidityFixTokenParams(liquidityParams: AddLiquidityFixTokenParams, slippageRate: number, currentSqrtPrice: BN): AddLiquidityFixTokenParams {
    const fixedCoinAmount = liquidityParams.fix_amount_a ? liquidityParams.amount_a : liquidityParams.amount_b
    const liquidityCalculation = ClmmPoolUtil.estLiquidityAndcoinAmountFromOneAmounts(
      Number(liquidityParams.tick_lower),
      Number(liquidityParams.tick_upper),
      new BN(fixedCoinAmount),
      liquidityParams.fix_amount_a,
      true,
      slippageRate,
      currentSqrtPrice
    )

    liquidityParams.amount_a = liquidityParams.fix_amount_a ? liquidityParams.amount_a : liquidityCalculation.tokenMaxA.toNumber()
    liquidityParams.amount_b = liquidityParams.fix_amount_a ? liquidityCalculation.tokenMaxB.toNumber() : liquidityParams.amount_b

    return liquidityParams
  }

  /**
   * Builds the core arguments for add liquidity transaction
   * @param transaction - Transaction to modify
   * @param sdk - SDK instance
   * @param allCoinAssets - All available coin assets
   * @param liquidityParams - Liquidity parameters
   * @param coinAInputs - Coin A input result
   * @param coinBInputs - Coin B input result
   * @returns Transaction with liquidity arguments
   */
  private static buildAddLiquidityFixTokenArgs(
    transaction: Transaction,
    sdk: SDK,
    allCoinAssets: CoinAsset[],
    liquidityParams: AddLiquidityFixTokenParams,
    coinAInputs: BuildCoinResult,
    coinBInputs: BuildCoinResult
  ) {
    const typeArguments = [liquidityParams.coinTypeA, liquidityParams.coinTypeB]
    const functionName = liquidityParams.is_open ? 'open_position_with_liquidity_by_fix_coin' : 'add_liquidity_by_fix_coin'
    const { clmm_pool, integrate } = sdk.sdkOptions

    if (!liquidityParams.is_open) {
      transaction = TransactionUtil.createCollectRewarderAndFeeParams(
        sdk,
        transaction,
        liquidityParams,
        allCoinAssets,
        coinAInputs.remainCoins,
        coinBInputs.remainCoins
      )
    }

    const clmmConfiguration = getPackagerConfigs(clmm_pool)
    const transactionArgs = liquidityParams.is_open
      ? [
          transaction.object(clmmConfiguration.global_config_id),
          transaction.object(liquidityParams.pool_id),
          transaction.pure.u32(Number(asUintN(BigInt(liquidityParams.tick_lower)).toString())),
          transaction.pure.u32(Number(asUintN(BigInt(liquidityParams.tick_upper)).toString())),
          coinAInputs.targetCoin,
          coinBInputs.targetCoin,
          transaction.pure.u64(liquidityParams.amount_a),
          transaction.pure.u64(liquidityParams.amount_b),
          transaction.pure.bool(liquidityParams.fix_amount_a),
          transaction.object(CLOCK_ADDRESS),
        ]
      : [
          transaction.object(clmmConfiguration.global_config_id),
          transaction.object(liquidityParams.pool_id),
          transaction.object(liquidityParams.pos_id),
          coinAInputs.targetCoin,
          coinBInputs.targetCoin,
          transaction.pure.u64(liquidityParams.amount_a),
          transaction.pure.u64(liquidityParams.amount_b),
          transaction.pure.bool(liquidityParams.fix_amount_a),
          transaction.object(CLOCK_ADDRESS),
        ]

    transaction.moveCall({
      target: `${integrate.published_at}::${ClmmIntegratePoolModule}::${functionName}`,
      typeArguments,
      arguments: transactionArgs,
    })
    return transaction
  }

  // -------------------------------------------swap--------------------------------------------------//
  /**
   * Builds swap transaction with gas optimization for SUI tokens
   * @param sdk - SDK instance
   * @param swapParams - Parameters for swap
   * @param allCoinAssets - All available coin assets
   * @param gasEstimationConfig - Gas estimation configuration
   * @returns Gas-optimized swap transaction
   */
  static async buildSwapTransactionForGas(
    sdk: SDK,
    swapParams: SwapParams,
    allCoinAssets: CoinAsset[],
    gasEstimationConfig: {
      byAmountIn: boolean
      slippage: Percentage
      decimalsA: number
      decimalsB: number
      swapTicks: Array<TickData>
      currentPool: Pool
    }
  ): Promise<Transaction> {
    let transaction = TransactionUtil.buildSwapTransaction(sdk, swapParams, allCoinAssets)
    transaction.setSender(sdk.senderAddress)

    const gasAdjustmentResult = await TransactionUtil.adjustTransactionForGas(
      sdk,
      CoinAssist.getCoinAssets(swapParams.a2b ? swapParams.coinTypeA : swapParams.coinTypeB, allCoinAssets),
      BigInt(swapParams.by_amount_in ? swapParams.amount : swapParams.amount_limit),
      transaction
    )

    const { fixAmount, newTx } = gasAdjustmentResult

    if (newTx !== undefined) {
      newTx.setSender(sdk.senderAddress)
      if (swapParams.by_amount_in) {
        swapParams.amount = fixAmount.toString()
      } else {
        swapParams.amount_limit = fixAmount.toString()
      }
      swapParams = await TransactionUtil.fixSwapParams(sdk, swapParams, gasEstimationConfig)

      const coinAInput = TransactionUtil.buildCoinForAmount(
        transaction,
        allCoinAssets,
        swapParams.a2b ? BigInt(swapParams.by_amount_in ? swapParams.amount : swapParams.amount_limit) : BigInt(0),
        swapParams.coinTypeA
      )

      const coinBInput = TransactionUtil.buildCoinForAmount(
        transaction,
        allCoinAssets,
        swapParams.a2b ? BigInt(0) : BigInt(swapParams.by_amount_in ? swapParams.amount : swapParams.amount_limit),
        swapParams.coinTypeB
      )

      transaction = TransactionUtil.buildSwapTransactionArgs(newTx, swapParams, sdk.sdkOptions, coinAInput, coinBInput)
    }

    return transaction
  }

  /**
   * Builds basic swap transaction
   * @param sdk - SDK instance
   * @param swapParams - Parameters for swap
   * @param allCoinAssets - All available coin assets
   * @returns Swap transaction
   */
  static buildSwapTransaction(sdk: SDK, swapParams: SwapParams, allCoinAssets: CoinAsset[]): Transaction {
    let transaction = new Transaction()
    transaction.setSender(sdk.senderAddress)

    const coinAInput = TransactionUtil.buildCoinForAmount(
      transaction,
      allCoinAssets,
      swapParams.a2b ? BigInt(swapParams.by_amount_in ? swapParams.amount : swapParams.amount_limit) : BigInt(0),
      swapParams.coinTypeA,
      false
    )

    const coinBInput = TransactionUtil.buildCoinForAmount(
      transaction,
      allCoinAssets,
      swapParams.a2b ? BigInt(0) : BigInt(swapParams.by_amount_in ? swapParams.amount : swapParams.amount_limit),
      swapParams.coinTypeB,
      false
    )

    transaction = TransactionUtil.buildSwapTransactionArgs(transaction, swapParams, sdk.sdkOptions, coinAInput, coinBInput)
    return transaction
  }

  /**
   * Builds the core arguments for swap transaction
   * @param transaction - Transaction to modify
   * @param swapParams - Swap parameters
   * @param sdkOptions - SDK configuration options
   * @param coinAInput - Coin A input result
   * @param coinBInput - Coin B input result
   * @returns Transaction with swap arguments
   */
  static buildSwapTransactionArgs(
    transaction: Transaction,
    swapParams: SwapParams,
    sdkOptions: SdkOptions,
    coinAInput: BuildCoinResult,
    coinBInput: BuildCoinResult
  ): Transaction {
    const { clmm_pool, integrate } = sdkOptions

    const sqrtPriceLimit = SwapUtils.getDefaultSqrtPriceLimit(swapParams.a2b)
    const typeArguments = [swapParams.coinTypeA, swapParams.coinTypeB]
    const { global_config_id } = getPackagerConfigs(clmm_pool)

    if (global_config_id === undefined) {
      throw Error('CLMM global config ID is undefined')
    }

    const hasSwapPartner = swapParams.swap_partner !== undefined

    const functionName = hasSwapPartner
      ? swapParams.a2b
        ? 'swap_a2b_with_partner'
        : 'swap_b2a_with_partner'
      : swapParams.a2b
      ? 'swap_a2b'
      : 'swap_b2a'

    const transactionArgs = hasSwapPartner
      ? [
          transaction.object(global_config_id),
          transaction.object(swapParams.pool_id),
          transaction.object(swapParams.swap_partner!),
          coinAInput.targetCoin,
          coinBInput.targetCoin,
          transaction.pure.bool(swapParams.by_amount_in),
          transaction.pure.u64(swapParams.amount),
          transaction.pure.u64(swapParams.amount_limit),
          transaction.pure.u128(sqrtPriceLimit.toString()),
          transaction.object(CLOCK_ADDRESS),
        ]
      : [
          transaction.object(global_config_id),
          transaction.object(swapParams.pool_id),
          coinAInput.targetCoin,
          coinBInput.targetCoin,
          transaction.pure.bool(swapParams.by_amount_in),
          transaction.pure.u64(swapParams.amount),
          transaction.pure.u64(swapParams.amount_limit),
          transaction.pure.u128(sqrtPriceLimit.toString()),
          transaction.object(CLOCK_ADDRESS),
        ]

    transaction.moveCall({
      target: `${integrate.published_at}::${ClmmIntegratePoolModule}::${functionName}`,
      typeArguments,
      arguments: transactionArgs,
    })
    return transaction
  }

  // -------------------------------------swap-without-transfer-coin-----------------------------------------//
  /**
   * Builds swap transaction without automatic coin transfers, with gas optimization
   * @param sdk - SDK instance
   * @param swapParams - Parameters for swap
   * @param allCoinAssets - All available coin assets
   * @param gasEstimationConfig - Gas estimation configuration
   * @returns Object containing transaction and coin arguments for manual handling
   */
  static async buildSwapTransactionWithoutTransferCoinsForGas(
    sdk: SDK,
    swapParams: SwapParams,
    allCoinAssets: CoinAsset[],
    gasEstimationConfig: {
      byAmountIn: boolean
      slippage: Percentage
      decimalsA: number
      decimalsB: number
      swapTicks: Array<TickData>
      currentPool: Pool
    }
  ): Promise<{ tx: Transaction; coinABs: TransactionObjectArgument[] }> {
    let { tx, coinABs } = TransactionUtil.buildSwapTransactionWithoutTransferCoins(sdk, swapParams, allCoinAssets)
    tx.setSender(sdk.senderAddress)

    const gasAdjustmentResult = await TransactionUtil.adjustTransactionForGas(
      sdk,
      CoinAssist.getCoinAssets(swapParams.a2b ? swapParams.coinTypeA : swapParams.coinTypeB, allCoinAssets),
      BigInt(swapParams.by_amount_in ? swapParams.amount : swapParams.amount_limit),
      tx
    )

    const { fixAmount, newTx } = gasAdjustmentResult

    if (newTx !== undefined) {
      newTx.setSender(sdk.senderAddress)
      if (swapParams.by_amount_in) {
        swapParams.amount = fixAmount.toString()
      } else {
        swapParams.amount_limit = fixAmount.toString()
      }
      swapParams = await TransactionUtil.fixSwapParams(sdk, swapParams, gasEstimationConfig)

      const coinAInput = TransactionUtil.buildCoinForAmount(
        tx,
        allCoinAssets,
        swapParams.a2b ? BigInt(swapParams.by_amount_in ? swapParams.amount : swapParams.amount_limit) : BigInt(0),
        swapParams.coinTypeA,
        false,
        true
      )

      const coinBInput = TransactionUtil.buildCoinForAmount(
        tx,
        allCoinAssets,
        swapParams.a2b ? BigInt(0) : BigInt(swapParams.by_amount_in ? swapParams.amount : swapParams.amount_limit),
        swapParams.coinTypeB,
        false,
        true
      )

      const swapResult = TransactionUtil.buildSwapTransactionWithoutTransferCoinArgs(
        sdk,
        newTx,
        swapParams,
        sdk.sdkOptions,
        coinAInput,
        coinBInput
      )
      tx = swapResult.tx
      coinABs = swapResult.txRes
    }

    return { tx, coinABs }
  }

  /**
   * Builds swap transaction without automatic coin transfers
   * @param sdk - SDK instance
   * @param swapParams - Parameters for swap
   * @param allCoinAssets - All available coin assets
   * @returns Object containing transaction and coin arguments for manual handling
   */
  static buildSwapTransactionWithoutTransferCoins(
    sdk: SDK,
    swapParams: SwapParams,
    allCoinAssets: CoinAsset[]
  ): { tx: Transaction; coinABs: TransactionObjectArgument[] } {
    const transaction = new Transaction()
    transaction.setSender(sdk.senderAddress)

    // Fixed amount must be set to true to support amount limits
    const coinAInput = TransactionUtil.buildCoinForAmount(
      transaction,
      allCoinAssets,
      swapParams.a2b ? BigInt(swapParams.by_amount_in ? swapParams.amount : swapParams.amount_limit) : BigInt(0),
      swapParams.coinTypeA,
      false,
      true
    )

    const coinBInput = TransactionUtil.buildCoinForAmount(
      transaction,
      allCoinAssets,
      swapParams.a2b ? BigInt(0) : BigInt(swapParams.by_amount_in ? swapParams.amount : swapParams.amount_limit),
      swapParams.coinTypeB,
      false,
      true
    )

    const swapResult = TransactionUtil.buildSwapTransactionWithoutTransferCoinArgs(
      sdk,
      transaction,
      swapParams,
      sdk.sdkOptions,
      coinAInput,
      coinBInput
    )
    return { tx: swapResult.tx, coinABs: swapResult.txRes }
  }

  /**
   * Builds swap transaction arguments without automatic transfers
   * @param sdk - SDK instance
   * @param transaction - Transaction to modify
   * @param swapParams - Swap parameters
   * @param sdkOptions - SDK configuration options
   * @param coinAInput - Coin A input result
   * @param coinBInput - Coin B input result
   * @returns Object containing transaction and resulting coin arguments
   */
  static buildSwapTransactionWithoutTransferCoinArgs(
    sdk: SDK,
    transaction: Transaction,
    swapParams: SwapParams,
    sdkOptions: SdkOptions,
    coinAInput: BuildCoinResult,
    coinBInput: BuildCoinResult
  ): { tx: Transaction; txRes: TransactionObjectArgument[] } {
    const { clmm_pool, integrate } = sdkOptions

    const sqrtPriceLimit = SwapUtils.getDefaultSqrtPriceLimit(swapParams.a2b)

    const { global_config_id } = getPackagerConfigs(clmm_pool)

    if (global_config_id === undefined) {
      throw Error('CLMM global config ID is undefined')
    }

    const hasSwapPartner = swapParams.swap_partner !== undefined

    const functionName = hasSwapPartner ? 'swap_with_partner' : 'swap'

    const moduleName = hasSwapPartner ? ClmmIntegrateRouterWithPartnerModule : ClmmIntegrateRouterModule

    const transactionArgs = hasSwapPartner
      ? [
          transaction.object(global_config_id),
          transaction.object(swapParams.pool_id),
          transaction.object(swapParams.swap_partner!),
          coinAInput.targetCoin,
          coinBInput.targetCoin,
          transaction.pure.bool(swapParams.a2b),
          transaction.pure.bool(swapParams.by_amount_in),
          transaction.pure.u64(swapParams.amount),
          transaction.pure.u128(sqrtPriceLimit.toString()),
          transaction.pure.bool(false), // use coin value always set false
          transaction.object(CLOCK_ADDRESS),
        ]
      : [
          transaction.object(global_config_id),
          transaction.object(swapParams.pool_id),
          coinAInput.targetCoin,
          coinBInput.targetCoin,
          transaction.pure.bool(swapParams.a2b),
          transaction.pure.bool(swapParams.by_amount_in),
          transaction.pure.u64(swapParams.amount),
          transaction.pure.u128(sqrtPriceLimit.toString()),
          transaction.pure.bool(false), // use coin value always set false
          transaction.object(CLOCK_ADDRESS),
        ]

    const typeArguments = [swapParams.coinTypeA, swapParams.coinTypeB]
    const resultingCoins: TransactionObjectArgument[] = transaction.moveCall({
      target: `${integrate.published_at}::${moduleName}::${functionName}`,
      typeArguments,
      arguments: transactionArgs,
    })

    if (swapParams.by_amount_in) {
      const outputCoinType = swapParams.a2b ? swapParams.coinTypeB : swapParams.coinTypeA
      const outputCoin = swapParams.a2b ? resultingCoins[1] : resultingCoins[0]
      const minimumOutputAmount = Number(swapParams.amount_limit)
      this.checkCoinThreshold(sdk, swapParams.by_amount_in, transaction, outputCoin, minimumOutputAmount, outputCoinType)
    }

    return { tx: transaction, txRes: resultingCoins }
  }

  /**
   * Fixes swap parameters by recalculating limits based on current pool state
   * @param sdk - SDK instance
   * @param swapParams - Original swap parameters
   * @param gasEstimationConfig - Gas estimation configuration
   * @returns Updated swap parameters with correct limits
   */
  static async fixSwapParams(
    sdk: SDK,
    swapParams: SwapParams,
    gasEstimationConfig: {
      byAmountIn: boolean
      slippage: Percentage
      decimalsA: number
      decimalsB: number
      swapTicks: Array<TickData>
      currentPool: Pool
    }
  ): Promise<SwapParams> {
    const { currentPool } = gasEstimationConfig
    try {
      const preSwapResult: any = await sdk.Swap.preswap({
        decimalsA: gasEstimationConfig.decimalsA,
        decimalsB: gasEstimationConfig.decimalsB,
        a2b: swapParams.a2b,
        byAmountIn: swapParams.by_amount_in,
        amount: swapParams.amount,
        pool: currentPool,
        currentSqrtPrice: currentPool.current_sqrt_price,
        coinTypeA: currentPool.coinTypeA,
        coinTypeB: currentPool.coinTypeB,
      })

      const expectedAmount = gasEstimationConfig.byAmountIn ? preSwapResult.estimatedAmountOut : preSwapResult.estimatedAmountIn

      const slippageAdjustedLimit = adjustForSlippage(expectedAmount, gasEstimationConfig.slippage, !gasEstimationConfig.byAmountIn)
      swapParams.amount_limit = slippageAdjustedLimit.toString()
    } catch (error) {
      console.log('fixSwapParams error:', error)
    }

    return swapParams
  }

  /**
   * Asynchronously builds coin input for a specific amount
   * @param sdk - SDK instance
   * @param transaction - Transaction to modify
   * @param amount - Amount to build coin for
   * @param coinType - Type of coin
   * @param buildVector - Whether to build as vector
   * @param fixAmount - Whether to fix amount exactly
   * @returns Transaction object argument or undefined
   */
  public static async syncBuildCoinInputForAmount(
    sdk: SDK,
    transaction: Transaction,
    amount: bigint,
    coinType: string,
    buildVector = true,
    fixAmount = true
  ): Promise<TransactionObjectArgument | undefined> {
    if (sdk.senderAddress.length === 0) {
      throw Error('SDK sender address is required but not configured')
    }

    const userCoins = await sdk.getOwnerCoinAssets(sdk.senderAddress, coinType)
    const coinInput: any = TransactionUtil.buildCoinForAmount(transaction, userCoins, amount, coinType, buildVector, fixAmount)!.targetCoin

    return coinInput
  }

  /**
   * Builds coin input for a specific amount from available assets
   * @param transaction - Transaction to modify
   * @param availableCoins - Available coin assets
   * @param amount - Amount to build coin for
   * @param coinType - Type of coin
   * @param buildVector - Whether to build as vector
   * @param fixAmount - Whether to fix amount exactly
   * @returns Built coin result
   */
  public static buildCoinForAmount(
    transaction: Transaction,
    availableCoins: CoinAsset[],
    amount: bigint,
    coinType: string,
    buildVector = true,
    fixAmount = true
  ): BuildCoinResult {
    const filteredCoinAssets: CoinAsset[] = CoinAssist.getCoinAssets(coinType, availableCoins)

    // Handle zero amount by minting zero coin
    if (amount === BigInt(0)) {
      return TransactionUtil.buildZeroValueCoin(availableCoins, transaction, coinType, buildVector)
    }

    const totalAvailableAmount = CoinAssist.calculateTotalBalance(filteredCoinAssets)
    if (totalAvailableAmount < amount) {
      throw new ClmmpoolsError(
        `Insufficient balance: available ${totalAvailableAmount} for ${coinType}, required ${amount}`,
        UtilsErrorCode.InsufficientBalance
      )
    }

    return TransactionUtil.buildCoin(transaction, availableCoins, filteredCoinAssets, amount, coinType, buildVector, fixAmount)
  }

  /**
   * Builds coin with specific balance using coinWithBalance utility
   * @param amount - Amount for the coin
   * @param coinType - Type of coin
   * @returns Transaction object argument for the coin
   */
  public static buildCoinWithBalance(amount: bigint, coinType: string): TransactionObjectArgument {
    if (amount === BigInt(0)) {
      if (CoinAssist.isSuiCoin(coinType)) {
        return coinWithBalance({ balance: amount, useGasCoin: false })
      }
    }

    return coinWithBalance({ balance: amount, type: coinType })
  }

  /**
   * Builds vector of coins for transaction use
   * @param transaction - Transaction to modify
   * @param availableCoins - All available coin assets
   * @param targetCoinAssets - Target coin assets to use
   * @param amount - Amount needed
   * @param coinType - Type of coin
   * @param fixAmount - Whether to fix amount exactly
   * @returns Built coin result as vector
   */
  private static buildVectorCoin(
    transaction: Transaction,
    availableCoins: CoinAsset[],
    targetCoinAssets: CoinAsset[],
    amount: bigint,
    coinType: string,
    fixAmount = true
  ) {
    if (CoinAssist.isSuiCoin(coinType)) {
      const splitCoin = transaction.splitCoins(transaction.gas, [transaction.pure.u64(amount)])
      return {
        targetCoin: transaction.makeMoveVec({ elements: [splitCoin] }),
        remainCoins: availableCoins,
        tragetCoinAmount: amount.toString(),
        isMintZeroCoin: false,
        originalSplitedCoin: transaction.gas,
      }
    }

    const { targetCoin, originalSplitedCoin, tragetCoinAmount, selectedCoinsResult, coinObjectIds } = this.buildSplitTargetCoin(
      transaction,
      amount,
      targetCoinAssets,
      fixAmount
    )

    if (fixAmount) {
      return {
        targetCoin: transaction.makeMoveVec({ elements: [targetCoin] }),
        remainCoins: selectedCoinsResult.remainCoins,
        originalSplitedCoin,
        tragetCoinAmount,
        isMintZeroCoin: false,
      }
    }

    return {
      targetCoin: transaction.makeMoveVec({ elements: coinObjectIds.map((id) => transaction.object(id)) }),
      remainCoins: selectedCoinsResult.remainCoins,
      tragetCoinAmount: selectedCoinsResult.amountArray.reduce((accumulator, currentValue) => Number(accumulator) + Number(currentValue), 0).toString(),
      isMintZeroCoin: false,
    }
  }

  /**
   * Builds single coin for transaction use
   * @param transaction - Transaction to modify
   * @param targetCoinAssets - Target coin assets to use
   * @param amount - Amount needed
   * @param coinType - Type of coin
   * @param fixAmount - Whether to fix amount exactly
   * @returns Built coin result as single coin
   */
  private static buildOneCoin(transaction: Transaction, targetCoinAssets: CoinAsset[], amount: bigint, coinType: string, fixAmount = true) {
    if (CoinAssist.isSuiCoin(coinType)) {
      if (amount === 0n && targetCoinAssets.length > 1) {
        const coinSelection = CoinAssist.selectCoinObjectIdGreaterThanOrEqual(targetCoinAssets, amount)
        return {
          targetCoin: transaction.object(coinSelection.objectArray[0]),
          remainCoins: coinSelection.remainCoins,
          tragetCoinAmount: coinSelection.amountArray[0],
          isMintZeroCoin: false,
        }
      }
      const coinSelection = CoinAssist.selectCoinObjectIdGreaterThanOrEqual(targetCoinAssets, amount)
      const splitCoin = transaction.splitCoins(transaction.gas, [transaction.pure.u64(amount)])
      return {
        targetCoin: splitCoin,
        remainCoins: coinSelection.remainCoins,
        tragetCoinAmount: amount.toString(),
        isMintZeroCoin: false,
        originalSplitedCoin: transaction.gas,
      }
    }

    const { targetCoin, originalSplitedCoin, tragetCoinAmount, selectedCoinsResult } = this.buildSplitTargetCoin(
      transaction,
      amount,
      targetCoinAssets,
      fixAmount
    )

    return {
      targetCoin,
      remainCoins: selectedCoinsResult.remainCoins,
      originalSplitedCoin,
      tragetCoinAmount,
      isMintZeroCoin: false,
    }
  }

  /**
   * Builds split target coin by merging and splitting as needed
   * @param transaction - Transaction to modify
   * @param amount - Amount needed
   * @param targetCoinAssets - Coin assets to use
   * @param fixAmount - Whether to fix amount exactly
   * @returns Split coin result with metadata
   */
  private static buildSplitTargetCoin(transaction: Transaction, amount: bigint, targetCoinAssets: CoinAsset[], fixAmount: boolean) {
    const coinSelection = CoinAssist.selectCoinObjectIdGreaterThanOrEqual(targetCoinAssets, amount)
    const totalSelectedAmount = coinSelection.amountArray.reduce((accumulator, currentValue) => Number(accumulator) + Number(currentValue), 0).toString()
    const coinObjectIds = coinSelection.objectArray

    const [primaryCoinId, ...mergeCoins] = coinObjectIds
    const primaryCoinObject = transaction.object(primaryCoinId)

    let targetCoin: any = primaryCoinObject
    const targetCoinAmount = coinSelection.amountArray.reduce((accumulator, currentValue) => Number(accumulator) + Number(currentValue), 0).toString()
    let originalSplitedCoin

    if (mergeCoins.length > 0) {
      transaction.mergeCoins(
        primaryCoinObject,
        mergeCoins.map((coinId) => transaction.object(coinId))
      )
    }

    if (fixAmount && Number(totalSelectedAmount) > Number(amount)) {
      targetCoin = transaction.splitCoins(primaryCoinObject, [transaction.pure.u64(amount)])
      originalSplitedCoin = primaryCoinObject
    }

    return {
      originalSplitedCoin,
      targetCoin,
      tragetCoinAmount: targetCoinAmount,
      selectedCoinsResult: coinSelection,
      coinObjectIds,
    }
  }

  /**
   * Generic coin building method that delegates to vector or single coin building
   * @param transaction - Transaction to modify
   * @param availableCoins - All available coin assets
   * @param targetCoinAssets - Target coin assets to use
   * @param amount - Amount needed
   * @param coinType - Type of coin
   * @param buildVector - Whether to build as vector
   * @param fixAmount - Whether to fix amount exactly
   * @returns Built coin result
   */
  private static buildCoin(
    transaction: Transaction,
    availableCoins: CoinAsset[],
    targetCoinAssets: CoinAsset[],
    amount: bigint,
    coinType: string,
    buildVector = true,
    fixAmount = true
  ): BuildCoinResult {
    if (buildVector) {
      return this.buildVectorCoin(transaction, availableCoins, targetCoinAssets, amount, coinType, fixAmount)
    }

    return this.buildOneCoin(transaction, targetCoinAssets, amount, coinType, fixAmount)
  }

  /**
   * Builds zero-value coin for cases where no amount is needed
   * @param availableCoins - All available coin assets
   * @param transaction - Transaction to modify
   * @param coinType - Type of coin to mint
   * @param buildVector - Whether to build as vector
   * @returns Built zero coin result
   */
  private static buildZeroValueCoin(availableCoins: CoinAsset[], transaction: Transaction, coinType: string, buildVector = true): BuildCoinResult {
    const zeroCoin = TransactionUtil.callMintZeroValueCoin(transaction, coinType)
    let targetCoin: any

    if (buildVector) {
      targetCoin = transaction.makeMoveVec({ elements: [zeroCoin] })
    } else {
      targetCoin = zeroCoin
    }

    return {
      targetCoin,
      remainCoins: availableCoins,
      isMintZeroCoin: true,
      tragetCoinAmount: '0',
    }
  }

  /**
   * Builds coin for amount with interval support (for slippage handling)
   * @param transaction - Transaction to modify
   * @param availableCoins - All available coin assets
   * @param amounts - Amount interval with first and second options
   * @param coinType - Type of coin
   * @param buildVector - Whether to build as vector
   * @param fixAmount - Whether to fix amount exactly
   * @returns Built coin result using interval logic
   */
  public static buildCoinForAmountInterval(
    transaction: Transaction,
    availableCoins: CoinAsset[],
    amounts: CoinInputInterval,
    coinType: string,
    buildVector = true,
    fixAmount = true
  ): BuildCoinResult {
    const targetCoinAssets: CoinAsset[] = CoinAssist.getCoinAssets(coinType, availableCoins)

    if (amounts.amountFirst === BigInt(0)) {
      if (targetCoinAssets.length > 0) {
        return TransactionUtil.buildCoin(transaction, [...availableCoins], [...targetCoinAssets], amounts.amountFirst, coinType, buildVector, fixAmount)
      }
      return TransactionUtil.buildZeroValueCoin(availableCoins, transaction, coinType, buildVector)
    }

    const totalAvailableAmount = CoinAssist.calculateTotalBalance(targetCoinAssets)

    if (totalAvailableAmount >= amounts.amountFirst) {
      return TransactionUtil.buildCoin(transaction, [...availableCoins], [...targetCoinAssets], amounts.amountFirst, coinType, buildVector, fixAmount)
    }

    if (totalAvailableAmount < amounts.amountSecond) {
      throw new ClmmpoolsError(
        `Insufficient balance: available ${totalAvailableAmount} for ${coinType}, required ${amounts.amountSecond}`,
        UtilsErrorCode.InsufficientBalance
      )
    }

    return TransactionUtil.buildCoin(transaction, [...availableCoins], [...targetCoinAssets], amounts.amountSecond, coinType, buildVector, fixAmount)
  }

  /**
   * Calls the Move function to mint a zero-value coin
   * @param transaction - Transaction to modify
   * @param coinType - Type of coin to mint
   * @returns Transaction object argument for zero coin
   */
  static callMintZeroValueCoin = (transaction: Transaction, coinType: string) => {
    return transaction.moveCall({
      target: '0x2::coin::zero',
      typeArguments: [coinType],
    })
  }

  // ------------------------------------------router-v1-------------------------------------------------//
  /**
   * Builds router swap transaction for multi-path swapping
   * @param sdk - SDK instance
   * @param routerParams - Router swap parameters
   * @param isAmountIn - Whether amount is input (true) or output (false)
   * @param allCoinAssets - All available coin assets
   * @param recipient - Optional recipient address for transfers
   * @returns Router swap transaction
   */
  public static async buildRouterSwapTransaction(
    sdk: SDK,
    routerParams: SwapWithRouterParams,
    isAmountIn: boolean,
    allCoinAssets: CoinAsset[],
    recipient?: string
  ): Promise<Transaction> {
    let transaction = new Transaction()

    // Router cannot support partners when split path length exceeds 1
    // Router v1 returns one best path; router v2 must set allow split to false
    if (routerParams.paths.length > 1) {
      routerParams.partner = ''
    }

    transaction = await this.buildRouterBasePathTx(sdk, routerParams, isAmountIn, allCoinAssets, transaction, recipient)
    return transaction
  }

  /**
   * Builds the base path transaction for router swaps
   * @param sdk - SDK instance
   * @param routerParams - Router swap parameters
   * @param isAmountIn - Whether amount is input
   * @param allCoinAssets - All available coin assets
   * @param transaction - Transaction to modify
   * @param recipient - Optional recipient address
   * @returns Modified transaction with router swap logic
   */
  static async buildRouterBasePathTx(
    sdk: SDK,
    routerParams: SwapWithRouterParams,
    isAmountIn: boolean,
    allCoinAssets: CoinAsset[],
    transaction: Transaction,
    recipient?: string
  ) {
    const validSwapPaths = routerParams.paths.filter((path) => path && path.poolAddress)
    const totalInputAmount = Number(validSwapPaths.reduce((total, path) => total.add(path.amountIn), ZERO).toString())
    const totalOutputAmount = Number(validSwapPaths.reduce((total, path) => total.add(path.amountOut), ZERO).toString())

    const slippageAdjustedLimit = isAmountIn
      ? Math.round(Number(totalOutputAmount.toString()) * (1 - routerParams.priceSlippagePoint))
      : Math.round(Number(totalInputAmount.toString()) * (1 + routerParams.priceSlippagePoint))

    const sourceCoinType = routerParams.paths[0].coinType[0]
    const targetCoinType = routerParams.paths[0].coinType[routerParams.paths[0].coinType.length - 1]

    // When fixing amount out, fromCoin amount must be set to limit for slippage support
    const sourceCoinBuildResult = TransactionUtil.buildCoinForAmount(
      transaction,
      allCoinAssets,
      isAmountIn ? BigInt(totalInputAmount) : BigInt(slippageAdjustedLimit),
      sourceCoinType,
      false,
      true
    )
    const hasSplitSourceCoin = sourceCoinBuildResult.originalSplitedCoin !== undefined
    const targetCoinBuildResult = TransactionUtil.buildCoinForAmount(transaction, allCoinAssets, 0n, targetCoinType, false)

    const routerSwapResult = await this.buildRouterBasePathReturnCoins(
      sdk,
      routerParams,
      isAmountIn,
      sourceCoinBuildResult,
      targetCoinBuildResult,
      transaction
    )

    const coinsToTransfer: TransferredCoin[] = []
    const { toCoin, fromCoin } = routerSwapResult
    transaction = routerSwapResult.tx

    if (targetCoinBuildResult.isMintZeroCoin) {
      coinsToTransfer.push({
        coinType: targetCoinType,
        coin: toCoin,
      })
    } else if (targetCoinBuildResult.originalSplitedCoin !== undefined) {
      transaction.mergeCoins(targetCoinBuildResult.originalSplitedCoin!, [toCoin])
    } else {
      transaction.mergeCoins(targetCoinBuildResult.targetCoin, [toCoin])
    }

    if (hasSplitSourceCoin) {
      const originalSourceCoin = sourceCoinBuildResult?.originalSplitedCoin as TransactionObjectArgument
      transaction.mergeCoins(originalSourceCoin, [fromCoin])
    } else {
      coinsToTransfer.push({
        coinType: sourceCoinType,
        coin: fromCoin,
      })
    }

    for (let transferIndex = 0; transferIndex < coinsToTransfer.length; transferIndex++) {
      this.buildTransferCoin(sdk, transaction, coinsToTransfer[transferIndex].coin, coinsToTransfer[transferIndex].coinType, recipient)
    }

    return transaction
  }

  /**
   * Builds router swap operations and returns resulting coins
   * @param sdk - SDK instance
   * @param routerParams - Router swap parameters
   * @param isAmountIn - Whether amount is input
   * @param sourceCoinResult - Source coin build result
   * @param targetCoinResult - Target coin build result
   * @param transaction - Transaction to modify
   * @returns Object with resulting coins and modified transaction
   */
  static async buildRouterBasePathReturnCoins(
    sdk: SDK,
    routerParams: SwapWithRouterParams,
    isAmountIn: boolean,
    sourceCoinResult: BuildCoinResult,
    targetCoinResult: BuildCoinResult,
    transaction: Transaction
  ) {
    const { clmm_pool, integrate } = sdk.sdkOptions
    const globalConfigId = getPackagerConfigs(clmm_pool).global_config_id

    const validSwapPaths = routerParams.paths.filter((path) => path && path.poolAddress)

    const totalInputAmount = Number(validSwapPaths.reduce((total, path) => total.add(path.amountIn), ZERO).toString())
    const totalOutputAmount = Number(validSwapPaths.reduce((total, path) => total.add(path.amountOut), ZERO).toString())

    const slippageAdjustedLimit = isAmountIn
      ? Math.round(Number(totalOutputAmount.toString()) * (1 - routerParams.priceSlippagePoint))
      : Math.round(Number(totalInputAmount.toString()) * (1 + routerParams.priceSlippagePoint))

    const sourceCoinType = routerParams.paths[0].coinType[0]
    const targetCoinType = routerParams.paths[0].coinType[routerParams.paths[0].coinType.length - 1]

    let sourceCoin = sourceCoinResult.targetCoin as TransactionObjectArgument
    let targetCoin
    if (targetCoinResult.isMintZeroCoin || targetCoinResult.originalSplitedCoin !== undefined) {
      targetCoin = targetCoinResult.targetCoin as TransactionObjectArgument
    } else {
      targetCoin = TransactionUtil.callMintZeroValueCoin(transaction, targetCoinType)
    }

    const hasPartner = routerParams.partner !== ''

    const moduleToUse = hasPartner ? ClmmIntegrateRouterWithPartnerModule : ClmmIntegrateRouterModule

    for (const swapPath of validSwapPaths) {
      if (swapPath.poolAddress.length === 1) {
        const isA2B = swapPath.a2b[0]
        const swapParameters = {
          amount: Number(swapPath.amountIn.toString()),
          amountLimit: slippageAdjustedLimit,
          poolCoinA: swapPath.a2b[0] ? sourceCoinType : targetCoinType,
          poolCoinB: swapPath.a2b[0] ? targetCoinType : sourceCoinType,
        }

        const functionName = hasPartner ? 'swap_with_partner' : 'swap'

        const coinA = isA2B ? sourceCoin : targetCoin
        const coinB = isA2B ? targetCoin : sourceCoin
        const swapAmount = isAmountIn ? swapPath.amountIn.toString() : swapPath.amountOut.toString()

        const priceLimit = SwapUtils.getDefaultSqrtPriceLimit(isA2B).toString()
        const transactionArgs: any = hasPartner
          ? [
              transaction.object(globalConfigId),
              transaction.object(swapPath.poolAddress[0]),
              transaction.object(routerParams.partner),
              coinA,
              coinB,
              transaction.pure.bool(isA2B),
              transaction.pure.bool(isAmountIn),
              transaction.pure.u64(swapAmount),
              transaction.pure.u128(priceLimit),
              transaction.pure.bool(false),
              transaction.object(CLOCK_ADDRESS),
            ]
          : [
              transaction.object(globalConfigId),
              transaction.object(swapPath.poolAddress[0]),
              coinA,
              coinB,
              transaction.pure.bool(isA2B),
              transaction.pure.bool(isAmountIn),
              transaction.pure.u64(swapAmount),
              transaction.pure.u128(priceLimit),
              transaction.pure.bool(false),
              transaction.object(CLOCK_ADDRESS),
            ]

        const typeArguments = [swapParameters.poolCoinA, swapParameters.poolCoinB]

        const resultingCoins: TransactionObjectArgument[] = transaction.moveCall({
          target: `${sdk.sdkOptions.integrate.published_at}::${moduleToUse}::${functionName}`,
          typeArguments,
          arguments: transactionArgs,
        })
        sourceCoin = isA2B ? resultingCoins[0] : resultingCoins[1]
        targetCoin = isA2B ? resultingCoins[1] : resultingCoins[0]
      } else {
        const firstStepAmount = isAmountIn ? swapPath.amountIn : swapPath.rawAmountLimit[0]
        const secondStepAmount = isAmountIn ? 0 : swapPath.amountOut

        let functionName = ''
        if (swapPath.a2b[0]) {
          if (swapPath.a2b[1]) {
            functionName = 'swap_ab_bc'
          } else {
            functionName = 'swap_ab_cb'
          }
        } else if (swapPath.a2b[1]) {
          functionName = 'swap_ba_bc'
        } else {
          functionName = 'swap_ba_cb'
        }

        if (hasPartner) {
          functionName = `${functionName}_with_partner`
        }

        const firstPriceLimit = SwapUtils.getDefaultSqrtPriceLimit(swapPath.a2b[0])
        const secondPriceLimit = SwapUtils.getDefaultSqrtPriceLimit(swapPath.a2b[1])
        const transactionArgs: any = hasPartner
          ? [
              transaction.object(globalConfigId),
              transaction.object(swapPath.poolAddress[0]),
              transaction.object(swapPath.poolAddress[1]),
              transaction.object(routerParams.partner),
              sourceCoin,
              targetCoin,
              transaction.pure.bool(isAmountIn),
              transaction.pure.u64(firstStepAmount.toString()),
              transaction.pure.u64(secondStepAmount.toString()),
              transaction.pure.u128(firstPriceLimit.toString()),
              transaction.pure.u128(secondPriceLimit.toString()),
              transaction.object(CLOCK_ADDRESS),
            ]
          : [
              transaction.object(globalConfigId),
              transaction.object(swapPath.poolAddress[0]),
              transaction.object(swapPath.poolAddress[1]),
              sourceCoin,
              targetCoin,
              transaction.pure.bool(isAmountIn),
              transaction.pure.u64(firstStepAmount.toString()),
              transaction.pure.u64(secondStepAmount.toString()),
              transaction.pure.u128(firstPriceLimit.toString()),
              transaction.pure.u128(secondPriceLimit.toString()),
              transaction.object(CLOCK_ADDRESS),
            ]
        const typeArguments = [swapPath.coinType[0], swapPath.coinType[1], swapPath.coinType[2]]
        const swapResultCoins = transaction.moveCall({
          target: `${integrate.published_at}::${moduleToUse}::${functionName}`,
          typeArguments,
          arguments: transactionArgs,
        })
        sourceCoin = swapResultCoins[0] as TransactionObjectArgument
        targetCoin = swapResultCoins[1] as TransactionObjectArgument
      }
    }

    this.checkCoinThreshold(sdk, isAmountIn, transaction, targetCoin, slippageAdjustedLimit, targetCoinType)
    return { fromCoin: sourceCoin, toCoin: targetCoin, tx: transaction }
  }

  /**
   * Validates that output coin meets minimum threshold requirements
   * @param sdk - SDK instance
   * @param isAmountIn - Whether amount is input
   * @param transaction - Transaction to modify
   * @param outputCoin - Coin to check
   * @param minimumAmount - Minimum required amount
   * @param coinType - Type of coin being checked
   */
  static checkCoinThreshold(
    sdk: SDK,
    isAmountIn: boolean,
    transaction: Transaction,
    outputCoin: TransactionObjectArgument,
    minimumAmount: number,
    coinType: string
  ) {
    if (isAmountIn) {
      transaction.moveCall({
        target: `${sdk.sdkOptions.integrate.published_at}::${ClmmIntegrateRouterModule}::check_coin_threshold`,
        typeArguments: [coinType],
        arguments: [outputCoin, transaction.pure.u64(minimumAmount)],
      })
    }
  }

  /**
   * Builds CLMM base path transaction for individual swap steps
   * @param sdk - SDK instance
   * @param basePath - Base path configuration
   * @param transaction - Transaction to modify
   * @param isAmountIn - Whether amount is input
   * @param sourceCoin - Source coin argument
   * @param targetCoin - Target coin argument
   * @param isMiddleStep - Whether this is a middle step in multi-hop
   * @param partnerAddress - Partner address for fees
   * @returns Object with resulting coins and transaction
   */
  private static buildClmmBasePathTx(
    sdk: SDK,
    basePath: BasePath,
    transaction: Transaction,
    isAmountIn: boolean,
    sourceCoin: TransactionObjectArgument,
    targetCoin: TransactionObjectArgument,
    isMiddleStep: boolean,
    partnerAddress: string
  ) {
    const { clmm_pool, integrate } = sdk.sdkOptions
    const globalConfigId = getPackagerConfigs(clmm_pool).global_config_id
    let coinA = basePath.direction ? sourceCoin : targetCoin
    let coinB = basePath.direction ? targetCoin : sourceCoin
    const hasPartner = partnerAddress !== ''
    const moduleToUse = hasPartner ? ClmmIntegrateRouterWithPartnerModule : ClmmIntegrateRouterModule
    const functionName = hasPartner ? 'swap_with_partner' : 'swap'
    const swapAmount = isAmountIn ? basePath.inputAmount.toString() : basePath.outputAmount.toString()
    const priceLimit = SwapUtils.getDefaultSqrtPriceLimit(basePath.direction)

    const transactionArgs: any = hasPartner
      ? [
          transaction.object(globalConfigId),
          transaction.object(basePath.poolAddress),
          transaction.object(partnerAddress),
          coinA,
          coinB,
          transaction.pure.bool(basePath.direction),
          transaction.pure.bool(isAmountIn),
          transaction.pure.u64(swapAmount),
          transaction.pure.u128(priceLimit.toString()),
          transaction.pure.bool(isMiddleStep),
          transaction.object(CLOCK_ADDRESS),
        ]
      : [
          transaction.object(globalConfigId),
          transaction.object(basePath.poolAddress),
          coinA,
          coinB,
          transaction.pure.bool(basePath.direction),
          transaction.pure.bool(isAmountIn),
          transaction.pure.u64(swapAmount),
          transaction.pure.u128(priceLimit.toString()),
          transaction.pure.bool(isMiddleStep),
          transaction.object(CLOCK_ADDRESS),
        ]

    const typeArguments = basePath.direction ? [basePath.fromCoin, basePath.toCoin] : [basePath.toCoin, basePath.fromCoin]

    const resultingCoins: TransactionObjectArgument[] = transaction.moveCall({
      target: `${integrate.published_at}::${moduleToUse}::${functionName}`,
      typeArguments,
      arguments: transactionArgs,
    })

    coinA = resultingCoins[0] as any
    coinB = resultingCoins[1] as any

    sourceCoin = basePath.direction ? coinA : coinB
    targetCoin = basePath.direction ? coinB : coinA

    return {
      from: sourceCoin,
      to: targetCoin,
      tx: transaction,
    }
  }

  /**
   * Builds coin type pairs for multi-hop routing
   * @param coinTypes - Array of coin types in the path
   * @param partitionQuantities - Quantities for each partition
   * @returns Array of coin type pairs for routing
   */
  static buildCoinTypePair(coinTypes: string[], partitionQuantities: number[]): string[][] {
    const coinTypePairs: string[][] = []

    if (coinTypes.length === 2) {
      const directPair: string[] = []
      directPair.push(coinTypes[0], coinTypes[1])
      coinTypePairs.push(directPair)
    } else {
      const directRoutePair: string[] = []
      directRoutePair.push(coinTypes[0], coinTypes[coinTypes.length - 1])
      coinTypePairs.push(directRoutePair)

      for (let pathIndex = 1; pathIndex < coinTypes.length - 1; pathIndex += 1) {
        if (partitionQuantities[pathIndex - 1] === 0) {
          continue
        }
        const intermediateRoutePair: string[] = []
        intermediateRoutePair.push(coinTypes[0], coinTypes[pathIndex], coinTypes[coinTypes.length - 1])
        coinTypePairs.push(intermediateRoutePair)
      }
    }
    return coinTypePairs
  }

  // ------------------------------------------utils-------------------------------------------------//
  /**
   * Transfers coin to sender using Move call
   * @param sdk - SDK instance
   * @param transaction - Transaction to modify
   * @param coinToTransfer - Coin to transfer
   * @param coinType - Type of coin
   */
  static buildTransferCoinToSender(sdk: SDK, transaction: Transaction, coinToTransfer: TransactionObjectArgument, coinType: string) {
    transaction.moveCall({
      target: `${sdk.sdkOptions.integrate.published_at}::${ClmmIntegrateUtilsModule}::transfer_coin_to_sender`,
      typeArguments: [coinType],
      arguments: [coinToTransfer],
    })
  }

  /**
   * Transfers coin to specified recipient or sender if no recipient provided
   * @param sdk - SDK instance
   * @param transaction - Transaction to modify
   * @param coinToTransfer - Coin to transfer
   * @param coinType - Type of coin
   * @param recipient - Optional recipient address
   */
  static buildTransferCoin(sdk: SDK, transaction: Transaction, coinToTransfer: TransactionObjectArgument, coinType: string, recipient?: string) {
    if (recipient != null) {
      transaction.transferObjects([coinToTransfer], transaction.pure.address(recipient))
    } else {
      TransactionUtil.buildTransferCoinToSender(sdk, transaction, coinToTransfer, coinType)
    }
  }

  static buildLockPosition(
    args: {
      positionId: string
      untilTimestamp: number
      poolId: string
      typeA: string
      typeB: string
    },
    sdkOptions: SdkOptions,
    tx?: Transaction
  ) {
    const {
      integrate: { package_id },
      clmm_pool: { config }
    } = sdkOptions

    const { global_config_id } = config ?? {}

    if (!global_config_id) {
      throw new ClmmpoolsError('Global config is not set', ConfigErrorCode.InvalidConfig)
    }

    tx ??= new Transaction()
    tx.moveCall({
      target: `${package_id}::pool_script::lock_position`,
      arguments: [
        tx.object(global_config_id),
        tx.object(args.poolId),
        tx.object(args.positionId),
        tx.pure.u64(args.untilTimestamp),
        tx.object(CLOCK_ADDRESS),
      ],
      typeArguments: [args.typeA, args.typeB],
    })

    return [tx] as const
  }
}