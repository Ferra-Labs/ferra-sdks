import { Transaction, TransactionResult } from '@mysten/sui/transactions'
import { CreateFactoryParams, CreateLBPairParams } from '../interfaces/IFactory'
import { isValidSuiAddress } from '@mysten/sui/utils'
import Decimal from 'decimal.js'
import { SdkOptions } from '../sdk'
import {
  LBPair,
  AddLiquidityTxParams,
  RemoveLiquidityParams,
  ClosePositionParams,
  CollectPositionRewardsParams,
  CollectPositionFeesParams,
} from '../interfaces/IPair'
import { CoinAssist } from '../math'
import { CLOCK_ADDRESS, CoinAsset } from '../types'
import { SwapParams } from '../interfaces/ISwap'
import { ConfigErrorCode, DammPairsError } from '../errors/errors'
import { LockPositionParams } from '../interfaces'
import { encodeU32ToU128, encodeU64ToU256 } from './packed'

/**
 * Utility class for building DAMM protocol transactions
 * Provides static methods for factory, pair, liquidity, and swap operations
 */
export class TransactionUtil {
  /** Factory Operations */

  /**
   * Create a new DAMM factory
   * @param params - Factory creation parameters
   *   @param params.owner - Address of the factory owner
   *   @param params.feeRecipient - Address to receive protocol fees
   *   @param params.flashLoanFee - Fee percentage for flash loans
   * @param sdkOptions - SDK configuration options
   * @returns Transaction object for factory creation
   * @throws Error if addresses are invalid or fee is not provided
   */
  public static createFatory = (params: CreateFactoryParams, sdkOptions: SdkOptions) => {
    const {
      damm_pool: { published_at },
    } = sdkOptions
    const { feeRecipient, flashLoanFee, owner } = params

    // Validate owner address
    if (!isValidSuiAddress(owner)) {
      throw new Error('Invalid owner address')
    }

    // Validate fee recipient address
    if (!isValidSuiAddress(feeRecipient)) {
      throw new Error('Invalid fee recipient address')
    }

    // Validate flash loan fee
    const loanFee = Decimal(flashLoanFee)
    if (!loanFee) {
      throw new Error('Invalid flash loan fee')
    }

    const tx = new Transaction()

    // Call factory creation function
    tx.moveCall({
      target: `${published_at}::lb_factory::new`,
      arguments: [tx.pure.address(owner), tx.pure.address(feeRecipient), tx.pure.u256(flashLoanFee)],
    })

    return tx
  }

  /**
   * Creates a new LB pair on the DAMM factory
   * @param params - Parameters for creating the LB pair
   *   @param params.tokenXType - Type of token X (must be < tokenYType)
   *   @param params.tokenYType - Type of token Y (must be > tokenXType)
   *   @param params.activeId - Initial active bin ID
   *   @param params.binStep - Bin step in basis points
   * @param sdkOptions - SDK configuration options
   * @param tx - Optional existing transaction to add to
   * @returns Transaction object with pair creation
   * @throws Error if parameters are invalid
   */
  public static createLBPair = (params: CreateLBPairParams, sdkOptions: SdkOptions, tx?: Transaction): Transaction => {
    const {
      tokenXType,
      tokenYType,
      activeId,
      binStep,
      baseFactor,
      enableDynamicFee = true,
      enableFeeScheduler = true,
      feeMode = 0,
      isQuoteY = true,
      activationTimestamp
    } = params

    const {
      damm_pool: { published_at, config },
    } = sdkOptions
    const { global_config, pairs_id } = config ?? {}

    // Validate required configuration
    if (!global_config) throw new Error('Global Config ID is required')
    if (!pairs_id) throw new Error('Pairs ID is required')

    // Validate token types
    if (!tokenXType) throw new Error('Token X type is required')
    if (!tokenYType) throw new Error('Token Y type is required')
    if (tokenXType === tokenYType) throw new Error('Tokens must be different')

    // Validate active ID range (24-bit max)
    if (activeId < 0 || activeId > 0xffffff) throw new Error('Invalid active ID')

    // Validate bin step minimum
    if (binStep < 1) throw new Error('Bin step must be at least 1')

    // Create transaction if not provided
    tx ??= new Transaction()

    // Call create_lb_pair function
    tx.moveCall({
      target: `${published_at}::lb_factory::create_pair`,
      typeArguments: [tokenXType, tokenYType],
      arguments: [
        tx.object(global_config),
        tx.object(pairs_id),
        tx.pure.u32(activeId),
        tx.pure.u16(binStep),
        tx.pure.u32(baseFactor),
        tx.pure.u8(feeMode),
        tx.pure.bool(isQuoteY),
        tx.pure.bool(enableFeeScheduler),
        tx.pure.bool(enableDynamicFee),
        tx.pure.u64(activationTimestamp ?? Date.now()),
        tx.object(CLOCK_ADDRESS),
      ],
    })

    return tx
  }

  /**
   * Creates a new LB pair on the DAMM factory
   * @param params - Parameters for creating the LB pair
   *   @param params.tokenXType - Type of token X (must be < tokenYType)
   *   @param params.tokenYType - Type of token Y (must be > tokenXType)
   *   @param params.activeId - Initial active bin ID
   *   @param params.binStep - Bin step in basis points
   * @param sdkOptions - SDK configuration options
   * @param tx - Optional existing transaction to add to
   * @returns Transaction object with pair creation
   * @throws Error if parameters are invalid
   */
  public static createAndReturnLBPair = (
    params: CreateLBPairParams,
    sdkOptions: SdkOptions,
    tx?: Transaction
  ): [Pair: TransactionResult[number], RepayPair: TransactionResult[number], Transaction] => {
    const {
      tokenXType,
      tokenYType,
      activeId,
      binStep,
      baseFactor,
      enableDynamicFee = true,
      enableFeeScheduler = true,
      feeMode = 0,
      isQuoteY = true,
      activationTimestamp
    } = params

    const {
      damm_pool: { published_at, config },
    } = sdkOptions
    const { global_config, pairs_id } = config ?? {}

    // Validate required configuration
    if (!global_config) throw new Error('Global Config ID is required')
    if (!pairs_id) throw new Error('Pairs ID is required')

    // Validate token types
    if (!tokenXType) throw new Error('Token X type is required')
    if (!tokenYType) throw new Error('Token Y type is required')
    if (tokenXType === tokenYType) throw new Error('Tokens must be different')

    // Validate active ID range (24-bit max)
    if (activeId < 0 || activeId > 0xffffff) throw new Error('Invalid active ID')

    // Validate bin step minimum
    if (binStep < 1) throw new Error('Bin step must be at least 1')

    // Create transaction if not provided
    tx ??= new Transaction()

    // Call create_lb_pair function
    const [pair, repayPair] = tx.moveCall({
      target: `${published_at}::lb_factory::create_pair_with_receipt`,
      typeArguments: [tokenXType, tokenYType],
      arguments: [
        tx.object(global_config),
        tx.object(pairs_id),
        tx.pure.u32(activeId),
        tx.pure.u16(binStep),
        tx.pure.u32(baseFactor),
        tx.pure.u8(feeMode),
        tx.pure.bool(isQuoteY),
        tx.pure.bool(enableFeeScheduler),
        tx.pure.bool(enableDynamicFee),
        tx.pure.u64(activationTimestamp ?? Date.now()),
        tx.object(CLOCK_ADDRESS),
      ],
    })

    return [pair, repayPair, tx]
  }

  /**
   * Create a new liquidity position NFT
   * @param pair - The LBPair to create position for
   * @param sdkOptions - SDK configuration options
   * @param tx - Optional existing transaction to add to
   * @returns Tuple of [Transaction, position object]
   */
  public static createLbPosition(pair: LBPair, sdkOptions: SdkOptions, tx?: Transaction): [Transaction, TransactionResult[number]] {
    const {
      damm_pool: { published_at, config },
    } = sdkOptions

    const { global_config } = config ?? {}

    if (!global_config) {
      throw new DammPairsError('Global config is not set', ConfigErrorCode.InvalidConfig)
    }

    tx ??= new Transaction()

    // Open a new position and get the bucket
    const [bucket] = tx.moveCall({
      target: `${published_at}::lb_pair::open_position`,
      arguments: [tx.object(global_config), typeof pair.id == 'string' ? tx.object(pair.id) : pair.id],
      typeArguments: [pair.tokenXType, pair.tokenYType],
    })

    return [tx, bucket]
  }

  /**
   * Add liquidity to a position
   * @param pair - The LBPair to add liquidity to
   * @param params - Liquidity addition parameters
   *   @param params.ids - Array of bin IDs to add liquidity to
   *   @param params.distributionX - Distribution of token X across bins
   *   @param params.distributionY - Distribution of token Y across bins
   *   @param params.amountX - Token X amount to add
   *   @param params.amountY - Token Y amount to add
   *   @param params.position - Position object to add liquidity to
   * @param sdkOptions - SDK configuration options
   * @param tx - Optional existing transaction to add to
   * @returns Transaction object with liquidity addition
   */
  public static addLiquidity(
    pair: LBPair,
    { ids, distributionX, distributionY, amountX, amountY, position, minAmountX, minAmountY }: AddLiquidityTxParams,
    sdkOptions: SdkOptions,
    tx?: Transaction
  ) {
    const {
      damm_pool: { published_at, config },
    } = sdkOptions

    const { global_config } = config ?? {}

    if (!global_config) {
      throw new DammPairsError('Global config is not set', ConfigErrorCode.InvalidConfig)
    }

    tx ??= new Transaction()

    // Call add_liquidity function with distributions
    tx.moveCall({
      target: `${published_at}::lb_pair::add_liquidity`,
      arguments: [
        tx.object(global_config),
        typeof pair.id == 'string' ? tx.object(pair.id) : pair.id,
        position,
        tx.pure.vector('u32', ids),
        tx.pure.vector('u64', distributionX),
        tx.pure.vector('u64', distributionY),
        amountX,
        amountY,
        tx.pure.u64(minAmountX ?? 0),
        tx.pure.u64(minAmountY ?? 0),
        tx.object(CLOCK_ADDRESS),
      ],
      typeArguments: [pair.tokenXType, pair.tokenYType],
    })

    return tx
  }

  public static sharedTransferPair(
    pair: TransactionResult[number],
    pairReceipt: TransactionResult[number],
    pairTokenX: string,
    pairTokenY: string,
    sdkOptions: SdkOptions,
    tx?: Transaction
  ) {
    const {
      damm_pool: { published_at },
    } = sdkOptions

    tx ??= new Transaction()

    tx.moveCall({
      target: `${published_at}::lb_factory::share_pair`,
      arguments: [
        pair,
        pairReceipt,
      ],
      typeArguments: [pairTokenX, pairTokenY],
    })
  }

  /**
   * Remove liquidity from a position
   * @param pair - The LBPair to remove liquidity from
   * @param params - Liquidity removal parameters
   *   @param params.positionId - ID of the position to remove from
   *   @param params.binIds - Array of bin IDs to remove liquidity from
   *   @param params.binAmounts - Array of amounts to remove from each bin
   * @param sdkOptions - SDK configuration options
   * @param tx - Optional existing transaction to add to
   * @returns Tuple of [Transaction, coinA output, coinB output]
   */
  public static removeLiquidity(pair: LBPair, { binIds, positionId }: RemoveLiquidityParams, sdkOptions: SdkOptions, tx?: Transaction) {
    const {
      damm_pool: { published_at, config },
    } = sdkOptions

    const { global_config } = config ?? {}

    if (!global_config) {
      throw new DammPairsError('Global config is not set', ConfigErrorCode.InvalidConfig)
    }

    tx ??= new Transaction()

    // Call remove_liquidity and get output coins
    const [coinA, coinB] = tx.moveCall({
      target: `${published_at}::lb_pair::remove_liquidity`,
      arguments: [
        tx.object(global_config),
        tx.object(pair.id),
        tx.object(positionId),
        tx.pure.vector('u32', binIds),
        tx.pure.u64(0),
        tx.pure.u64(0),
        tx.object(CLOCK_ADDRESS),
      ],
      typeArguments: [pair.tokenXType, pair.tokenYType],
    })

    return [tx, coinA, coinB] as const
  }

  /**
   * Close a liquidity position and burn the position NFT
   * @param pair - The LBPair containing the position
   * @param params - Position closing parameters
   *   @param params.positionId - ID of the position to close
   * @param sdkOptions - SDK configuration options
   * @param tx - Optional existing transaction to add to
   * @returns Tuple containing the transaction
   * @throws DammPairsError if global config is not set
   *
   * @example
   * ```typescript
   * const [tx] = TransactionUtil.closePosition(pair, { positionId: "0x123..." }, sdkOptions);
   * ```
   */
  public static closePosition(pair: LBPair, { positionId }: ClosePositionParams, sdkOptions: SdkOptions, tx?: Transaction) {
    const {
      damm_pool: { published_at, config },
    } = sdkOptions

    const { global_config } = config ?? {}

    if (!global_config) {
      throw new DammPairsError('Global config is not set', ConfigErrorCode.InvalidConfig)
    }
    tx ??= new Transaction()

    // Call remove_liquidity and get output coins
    tx.moveCall({
      target: `${published_at}::lb_pair::close_position`,
      arguments: [tx.object(global_config), tx.object(pair.id), tx.object(positionId)],
      typeArguments: [pair.tokenXType, pair.tokenYType],
    })

    return [tx] as const
  }

  /** Swap Operations */

  /**
   * Create a swap transaction
   * @param params - Swap parameters
   *   @param params.pairId - ID of the pair to swap on
   *   @param params.xtoy - Direction of swap (true = X to Y)
   *   @param params.recipient - Address to receive output tokens
   *   @param params.coinX - Input coin X object
   *   @param params.coinY - Input coin Y object
   *   @param params.coinTypeX - Type of token X
   *   @param params.coinTypeY - Type of token Y
   * @param sdkOptions - SDK configuration options
   * @param tx - Optional existing transaction to add to
   * @returns Tuple of [Transaction, coinX receipt, coinY receipt]
   */
  public static createSwapTx(
    { coinX, coinY, pairId, xtoy, minAmountOut, coinTypeX, coinTypeY }: SwapParams,
    sdkOptions: SdkOptions,
    tx?: Transaction
  ) {
    const {
      damm_pool: { published_at, config },
    } = sdkOptions

    const { global_config } = config ?? {}

    if (!global_config) {
      throw new DammPairsError('Global config is not set', ConfigErrorCode.InvalidConfig)
    }

    tx ??= new Transaction()

    // Call swap function and get output receipts
    const [coinXReceipt, coinYReceipt] = tx.moveCall({
      target: `${published_at}::lb_pair::swap`,
      arguments: [
        tx.object(global_config),
        tx.object(pairId),
        tx.pure.bool(xtoy),
        tx.pure.u64(minAmountOut ?? 0n),
        coinX,
        coinY,
        tx.object(CLOCK_ADDRESS),
      ],
      typeArguments: [coinTypeX, coinTypeY],
    })

    return [tx, coinXReceipt, coinYReceipt] as const
  }

  /** Coin Management */

  /**
   * Build a coin object with specific amount from user's coin assets
   * @param tx - Transaction object
   * @param coinAssets - Array of user's coin assets
   * @param coinType - Type of coin to build
   * @param amount - Amount needed
   * @returns Transaction result with coin object
   */
  public static buildCoinAmount(tx: Transaction, coinAssets: CoinAsset[], coinType: string, amount: bigint): TransactionResult[number] {
    // Handle SUI coin specially (uses gas object)
    if (CoinAssist.isSuiCoin(coinType)) {
      if (amount === BigInt(0)) {
        return TransactionUtil.callMintZeroValueCoin(tx, coinType)
      }

      const [amountCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)])
      return amountCoin
    }

    // For other coins, select and merge as needed
    const { targetCoin } = this.buildSpitTargeCoin(tx, amount, coinAssets, true)

    return targetCoin
  }

  /**
   * Create a zero-value coin object for a specific coin type
   * @param txb - Transaction builder instance
   * @param coinType - The type identifier of the coin to create
   * @returns TransactionResult representing a zero-value coin
   *
   * @example
   * ```typescript
   * const zeroCoin = TransactionUtil.callMintZeroValueCoin(tx, "0x2::sui::SUI");
   * ```
   */
  static callMintZeroValueCoin = (txb: Transaction, coinType: string) => {
    return txb.moveCall({
      target: '0x2::coin::zero',
      typeArguments: [coinType],
    })[0]
  }

  /**
   * Build a coin object by selecting and merging user's coins to meet amount requirement
   * @param tx - Transaction object to add operations to
   * @param amount - Required amount of coins
   * @param coinAssets - Array of available coin assets from user's wallet
   * @param fixAmount - Whether to split exact amount if total exceeds requirement
   * @returns Object containing target coin and selection metadata
   *
   * @example
   * ```typescript
   * const result = TransactionUtil.buildSpitTargeCoin(tx, 1000000n, userCoins, true);
   * // result.targetCoin contains the coin object with required amount
   * ```
   */
  private static buildSpitTargeCoin(tx: Transaction, amount: bigint, coinAssets: CoinAsset[], fixAmount: boolean) {
    // Select coins that sum to at least the required amount
    const selectedCoinsResult = CoinAssist.selectCoinObjectIdGreaterThanOrEqual(coinAssets, amount)
    const totalSelectedCoinAmount = selectedCoinsResult.amountArray.reduce((a, b) => Number(a) + Number(b), 0).toString()
    const coinObjectIds = selectedCoinsResult.objectArray

    // Use first coin as primary, merge others into it
    const [primaryCoinA, ...mergeCoinAs] = coinObjectIds
    const primaryCoinAObject = tx.object(primaryCoinA)

    let targetCoin: any = primaryCoinAObject
    const tragetCoinAmount = selectedCoinsResult.amountArray.reduce((a, b) => Number(a) + Number(b), 0).toString()
    let originalSplitedCoin

    // Merge additional coins if needed
    if (mergeCoinAs.length > 0) {
      tx.mergeCoins(
        primaryCoinAObject,
        mergeCoinAs.map((coin) => tx.object(coin))
      )
    }

    // Split exact amount if total exceeds requirement
    if (fixAmount && Number(totalSelectedCoinAmount) > Number(amount)) {
      targetCoin = tx.splitCoins(primaryCoinAObject, [tx.pure.u64(amount)])
      originalSplitedCoin = primaryCoinAObject
    }

    return {
      originalSplitedCoin,
      targetCoin,
      tragetCoinAmount,
      selectedCoinsResult,
      coinObjectIds,
    }
  }

  /**
   * Collect accumulated rewards from a position
   * @param params - Reward collection parameters
   *   @param params.pairId - ID of the pair containing the position
   *   @param params.positionId - ID of the position to collect rewards from
   *   @param params.rewardCoin - Type of reward coin to collect
   *   @param params.typeX - Type of token X in the pair
   *   @param params.typeY - Type of token Y in the pair
   * @param sdkOptions - SDK configuration options
   * @param tx - Optional existing transaction to add to
   * @returns Tuple of [Transaction, reward coin object]
   * @throws DammPairsError if global config or reward vault is not set
   *
   * @example
   * ```typescript
   * const [tx, rewardCoin] = TransactionUtil.collectPositionRewards({
   *   pairId: "0x123...",
   *   positionId: "0x456...",
   *   rewardCoin: "0x789::token::TOKEN",
   *   typeX: "0x2::sui::SUI",
   *   typeY: "0xabc::usdc::USDC"
   * }, sdkOptions);
   * ```
   */
  static collectPositionRewards(
    { pairId, positionId, rewardCoin, typeX, typeY, binIds }: CollectPositionRewardsParams,
    sdkOptions: SdkOptions,
    tx?: Transaction
  ) {
    const {
      damm_pool: { published_at, config },
    } = sdkOptions

    const { global_config, reward_vault } = config ?? {}

    if (!global_config) {
      throw new DammPairsError('Global config is not set', ConfigErrorCode.InvalidConfig)
    }

    if (!reward_vault) {
      throw new DammPairsError('Reward vault is not set', ConfigErrorCode.InvalidConfig)
    }

    tx ??= new Transaction()
    const coin = tx.moveCall({
      target: `${published_at}::lb_pair::collect_position_rewards`,
      arguments: [
        tx.object(global_config),
        tx.object(pairId),
        tx.pure.vector('u32', binIds),
        tx.object(positionId),
        tx.object(reward_vault),
        tx.object(CLOCK_ADDRESS),
      ],
      typeArguments: [typeX, typeY, rewardCoin],
    })

    return [tx, coin] as const
  }

  /**
   * Get the amount of pending rewards for a position (view function)
   * @param params - Reward query parameters
   *   @param params.pairId - ID of the pair containing the position
   *   @param params.positionId - ID of the position to query rewards for
   *   @param params.rewardCoin - Type of reward coin to query
   *   @param params.typeX - Type of token X in the pair
   *   @param params.typeY - Type of token Y in the pair
   * @param sdkOptions - SDK configuration options
   * @param tx - Optional existing transaction to add to
   * @returns Tuple of [Transaction, amount result]
   *
   * @example
   * ```typescript
   * const [tx, amount] = await TransactionUtil.getPositionRewards({
   *   pairId: "0x123...",
   *   positionId: "0x456...",
   *   rewardCoin: "0x789::token::TOKEN",
   *   typeX: "0x2::sui::SUI",
   *   typeY: "0xabc::usdc::USDC"
   * }, sdkOptions);
   * ```
   */
  static async getPositionRewards(
    { pairId, positionId, rewardCoin, typeX, typeY, binIds }: CollectPositionRewardsParams,
    sdkOptions: SdkOptions,
    tx?: Transaction
  ) {
    const {
      damm_pool: { published_at },
    } = sdkOptions

    tx ??= new Transaction()
    const amount = tx.moveCall({
      target: `${published_at}::lb_pair::get_pending_rewards`,
      arguments: [tx.object(pairId), tx.object(positionId), tx.pure.vector('u32', binIds), tx.object(CLOCK_ADDRESS)],
      typeArguments: [typeX, typeY, rewardCoin],
    })

    return [tx, amount] as const
  }

  /**
   * Collect accumulated fees from specific bins of a position
   * @param params - Fee collection parameters
   *   @param params.pairId - ID of the pair containing the position
   *   @param params.positionId - ID of the position to collect fees from
   *   @param params.binIds - Array of bin IDs to collect fees from
   *   @param params.typeX - Type of token X in the pair
   *   @param params.typeY - Type of token Y in the pair
   * @param sdkOptions - SDK configuration options
   * @param tx - Optional existing transaction to add to
   * @returns Tuple of [Transaction, coinX fees, coinY fees]
   * @throws DammPairsError if global config or reward vault is not set
   *
   * @example
   * ```typescript
   * const [tx, feesX, feesY] = TransactionUtil.collectPositionFees({
   *   pairId: "0x123...",
   *   positionId: "0x456...",
   *   binIds: [8388608, 8388609],
   *   typeX: "0x2::sui::SUI",
   *   typeY: "0xabc::usdc::USDC"
   * }, sdkOptions);
   * ```
   */
  static collectPositionFees(
    { pairId, positionId, binIds, typeX, typeY }: CollectPositionFeesParams,
    sdkOptions: SdkOptions,
    tx?: Transaction
  ) {
    const {
      damm_pool: { published_at, config },
    } = sdkOptions

    const { global_config, reward_vault } = config ?? {}

    if (!global_config) {
      throw new DammPairsError('Global config is not set', ConfigErrorCode.InvalidConfig)
    }

    if (!reward_vault) {
      throw new DammPairsError('Reward vault is not set', ConfigErrorCode.InvalidConfig)
    }

    tx ??= new Transaction()
    const [coinX, coinY] = tx.moveCall({
      target: `${published_at}::lb_pair::collect_position_fees`,
      arguments: [tx.object(global_config), tx.object(pairId), tx.object(positionId), tx.pure.vector('u32', binIds)],
      typeArguments: [typeX, typeY],
    })

    return [tx, coinX, coinY] as const
  }

  /**
   * Lock a position until a specified timestamp to prevent modifications
   * @param params - Position locking parameters
   *   @param params.positionId - ID of the position to lock
   *   @param params.untilTimestamp - Timestamp (in milliseconds) until which position should be locked
   *   @param params.pairId - ID of the pair containing the position
   *   @param params.typeX - Type of token X in the pair
   *   @param params.typeY - Type of token Y in the pair
   * @param sdkOptions - SDK configuration options
   * @param tx - Optional existing transaction to add to
   * @returns Tuple containing the transaction
   * @throws DammPairsError if global config is not set
   *
   * @example
   * ```typescript
   * const lockUntil = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
   * const [tx] = TransactionUtil.lockPosition({
   *   positionId: "0x123...",
   *   untilTimestamp: lockUntil,
   *   pairId: "0x456...",
   *   typeX: "0x2::sui::SUI",
   *   typeY: "0xabc::usdc::USDC"
   * }, sdkOptions);
   * ```
   */
  static lockPosition({ positionId, untilTimestamp, pairId, typeX, typeY }: LockPositionParams, sdkOptions: SdkOptions, tx?: Transaction) {
    const {
      damm_pool: { published_at, config },
    } = sdkOptions

    const { global_config, reward_vault } = config ?? {}

    if (!global_config) {
      throw new DammPairsError('Global config is not set', ConfigErrorCode.InvalidConfig)
    }

    tx ??= new Transaction()
    tx.moveCall({
      target: `${published_at}::lb_pair::lock_position`,
      arguments: [
        tx.object(global_config),
        typeof pairId === 'string' ? tx.object(pairId) : pairId,
        typeof positionId === 'string' ? tx.object(positionId) : positionId,
        tx.pure.u64(untilTimestamp),
        tx.object(CLOCK_ADDRESS),
      ],
      typeArguments: [typeX, typeY],
    })

    return [tx] as const
  }

  /**
   * Get the total amount of pending fees for specific bins of a position (view function)
   * @param params - Fee query parameters
   *   @param params.pairId - ID of the pair containing the position
   *   @param params.positionId - ID of the position to query fees for
   *   @param params.binIds - Array of bin IDs to query fees for
   *   @param params.typeX - Type of token X in the pair
   *   @param params.typeY - Type of token Y in the pair
   * @param sdkOptions - SDK configuration options
   * @param tx - Optional existing transaction to add to
   * @returns Tuple of [Transaction, fees amount result]
   *
   * @example
   * ```typescript
   * const [tx, feesAmount] = await TransactionUtil.getPositionFees({
   *   pairId: "0x123...",
   *   positionId: "0x456...",
   *   binIds: [8388608, 8388609, 8388610],
   *   typeX: "0x2::sui::SUI",
   *   typeY: "0xabc::usdc::USDC"
   * }, sdkOptions);
   * ```
   */
  static async getPositionFees(
    { pairId, positionId, binIds, typeX, typeY }: CollectPositionFeesParams,
    sdkOptions: SdkOptions,
    tx?: Transaction
  ) {
    const {
      damm_pool: { published_at },
    } = sdkOptions

    tx ??= new Transaction()
    const [_, __, feeX, feeY] = tx.moveCall({
      target: `${published_at}::lb_pair::get_pending_fees`,
      arguments: [tx.object(pairId), tx.object(positionId), tx.pure.vector('u32', binIds)],
      typeArguments: [typeX, typeY],
    })

    return [tx, feeX, feeY] as const
  }
}
