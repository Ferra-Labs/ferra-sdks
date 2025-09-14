import { isValidSuiAddress, normalizeStructTag, parseStructTag } from '@mysten/sui/utils'
import { IModule } from '../interfaces/IModule'
import { FerraDlmmSDK } from '../sdk'
import { CachedContent } from '../utils/cached-content'
import { Amounts, BinData, LBPair, LbPairBinData, LBPosition } from '../interfaces/IPair'
import type { SuiObjectResponse, SuiParsedData } from '@mysten/sui/client'
import { checkInvalidSuiAddress, RpcBatcher, TransactionUtil } from '../utils'
import { DlmmPairsError, UtilsErrorCode } from '../errors/errors'
import { LbPositionOnChain, PositionBinOnchain, PositionInfoOnChain, PositionReward } from '../interfaces/IPosition'

import { getAmountOutOfBin } from '../utils/bin_helper'
import { Transaction } from '@mysten/sui/transactions'
import { inspect } from 'util'
import { bcs } from '@mysten/sui/bcs'
import { CLOCK_ADDRESS } from '../types'

/**
 * Module for managing DLMM positions
 * Handles fetching and parsing of liquidity positions and their associated bins
 */
export class PositionModule implements IModule {
  protected _sdk: FerraDlmmSDK

  /**
   * Cache storage for position data
   */
  private readonly _cache: Record<string, CachedContent> = {}

  /**
   * Initialize the position module with SDK instance
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
   * Fetch a single liquidity position by ID
   * @param positionId - The object ID of the position to fetch
   * @returns Promise resolving to LBPosition data
   * @throws Error if position ID is invalid or position not found
   */
  public async getLbPosition(positionId: string): Promise<LBPosition> {
    // Validate position ID format
    if (!isValidSuiAddress(positionId)) {
      throw new Error('Position not found')
    }

    const suiClient = this.sdk.fullClient

    // Fetch position object from chain
    const lpPairWapper = await suiClient.getObject({
      id: positionId,
      options: {
        showContent: true,
        showType: true,
      },
    })

    // Validate response has required data
    if (!lpPairWapper.data || !lpPairWapper.data.type) {
      throw new Error('Position not found')
    }

    // Parse position content from on-chain data
    const data = this.parsePositionContent(lpPairWapper.data.type, lpPairWapper.data.content, lpPairWapper.data.version)

    if (!data) {
      throw new Error('Invalid position content')
    }

    return data
  }

  /**
   * Fetch all liquidity positions owned by the current sender
   * @returns Promise resolving to array of LBPosition data
   * @throws DlmmPairsError if sender address is invalid
   */
  public async getLbPositions(pairIds: string[]): Promise<LBPosition[]> {
    const suiClient = this.sdk.fullClient
    const sender = this.sdk.senderAddress
    const {
      dlmm_pool: { package_id, published_at },
    } = this.sdk.sdkOptions

    // Validate sender address
    if (!checkInvalidSuiAddress(this.sdk.senderAddress)) {
      throw new DlmmPairsError(
        'Invalid sender address: ferra clmm sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }

    // Create RPC batcher for paginated fetching
    const positionsFetcher = new RpcBatcher(async () => {
      const objects = await suiClient.getOwnedObjects({
        owner: sender,
        filter: {
          MatchAny: [
            {
              StructType: `${package_id}::lb_position::LBPosition`,
            },{
              StructType: `${published_at}::lb_position::LBPosition`,
            },
          ],
        },
        options: {
          showContent: true,
          showType: true,
        },
      })

      return {
        data: objects.data,
        hasNextPage: objects.hasNextPage,
        nextCursor: objects.nextCursor ?? null,
      }
    })

    // Fetch all positions
    const positions = await positionsFetcher.fetchAll()

    // Parse and filter valid positions
    return positions
      .map((p) => {
        if (!p.data || !p.data.type) {
          return null
        }

        const data = this.parsePositionContent(p.data.type, p.data.content, p.data.version)

        if (!data) {
          return null
        }

        if (pairIds.length > 0 && !pairIds.includes(data.pair_id)) {
          return null
        }

        return data
      })
      .filter((t) => !!t)
  }

  /**
   * Get all bins associated with a position in a specific pair
   * @param pair - The LBPair object containing position manager
   * @param positionId - The ID of the position to fetch bins for
   * @returns Promise resolving to array of BinData
   * @throws Error if position manager not found or position doesn't match pair
   */
  public async getPositionBins(pair: LBPair, positionId: string): Promise<BinData[]> {
    const positionManager = pair.positionManager

    // Check if position manager exists
    if (!positionManager) {
      return []
    }

    // Fetch position to validate it belongs to this pair
    const position = await this.getLbPosition(positionId)

    if (position?.pair_id != pair.id) {
      throw new Error('Position is not match with pair id')
    }

    // Get bin manager for this position
    const binManager = await this.getBinManager(positionManager, positionId)

    // Return empty if no bins
    if (!binManager || binManager.size == '0') {
      return []
    }

    const binManagerId = binManager.id.id

    // Fetch all bins from the bin manager
    return await this.getBinsByManager(binManagerId, position.version)
  }

  /**
   * Get all bins associated with a position in a specific pair
   * @param pair - The LBPair object containing position manager
   * @param positionId - The ID of the position to fetch bins for
   * @returns Promise resolving to array of BinData
   * @throws Error if position manager not found or position doesn't match pair
   */
  public async getPositionBinsWithRange(pair: LBPair, positionId: string, binRange: [from: number, to: number]): Promise<BinData[]> {
    const positionManager = pair.positionManager

    // Check if position manager exists
    if (!positionManager) {
      return []
    }

    // Fetch position to validate it belongs to this pair
    const position = await this.getLbPosition(positionId)

    if (position?.pair_id != pair.id) {
      throw new Error('Position is not match with pair id')
    }

    // Get bin manager for this position
    const binManager = await this.getBinManager(positionManager, positionId)

    // Return empty if no bins
    if (!binManager || binManager.size == '0') {
      return []
    }

    const binManagerId = binManager.id.id

    // Fetch all bins from the bin manager
    return await this.getBinsByManager(binManagerId, position.version)
  }

  /**
   * Calculate the token amounts that can be withdrawn from each bin of a position
   * @param pair - The LBPair containing the position
   * @param positionId - ID of the position to calculate amounts for
   * @returns Promise resolving to array of amounts with bin liquidity details
   *
   * @example
   * ```typescript
   * const amounts = await positionModule.getPositionBinsAmount(pair, "0x123...");
   * amounts.forEach(bin => {
   *   console.log(`Bin ${bin.id}: ${bin.amountX} tokenX, ${bin.amountY} tokenY`);
   * });
   * ```
   */
  public async getPositionBinsAmount(pair: LBPair, positionId: string): Promise<Amounts[]> {
    const bins = await this.getPositionBins(pair, positionId)

    const binReserves = await this.sdk.Pair.getPairReserves(pair)
    const reserveMap = arrayToMap(binReserves)

    return bins.map((b) => {
      const binReserve = reserveMap[b.id]
      const totalSupply = binReserve.total_supply

      const amounts = getAmountOutOfBin(binReserve, b.liquidity, totalSupply)

      return {
        amountX: amounts.amount_x,
        amountY: amounts.amount_y,
        ...b,
      } as Amounts
    })
  }

  /**
   * Calculate pending reward amounts for a position across all rewarders
   * @param pair - The LBPair containing the position
   * @param positionId - ID of the position to check rewards for
   * @returns Promise resolving to array of pending rewards by coin type
   *
   * @example
   * ```typescript
   * const rewards = await positionModule.getPositionRewards(pair, "0x123...");
   * rewards.forEach(reward => {
   *   console.log(`Pending ${reward.amount} of ${reward.coinType}`);
   * });
   * ```
   */
  public async getPositionRewards(pair: LBPair, positionId: string, binIds: number[]): Promise<PositionReward[]> {
    const rewards: PositionReward[] = []
    const sender = this.sdk.senderAddress
    const tx = new Transaction()
    TransactionUtil.collectPositionFees(
      {
        pairId: pair.id,
        positionId,
        typeX: pair.tokenXType,
        typeY: pair.tokenYType,
        binIds,
      },
      this.sdk.sdkOptions,
      tx
    )
    for (const reward of pair.rewarders) {
      TransactionUtil.collectPositionRewards(
        {
          pairId: pair.id,
          positionId,
          rewardCoin: reward.reward_coin,
          typeX: pair.tokenXType,
          typeY: pair.tokenYType,
          binIds,
        },
        this.sdk.sdkOptions,
        tx
      )
    }
    const res = await this.sdk.fullClient.devInspectTransactionBlock({ transactionBlock: tx, sender })
    
    let skipped = false;

    for (const index in res.results ?? []) {
      if (!skipped) {
        skipped = true;
      continue
      }
      const result = res.results![index]

      const coin = "0x2::coin::Coin";
      if (!result.returnValues?.[0]?.[1].startsWith(coin)) {
        continue
      }
      
      const resValue = new Uint8Array(result.returnValues?.[0]?.[0] ?? [])
      const value = bcs.struct("", { address: bcs.Address, value: bcs.u64() }).parse(resValue)
      
      rewards.push({
        amount: value.value,
        coinType: normalizeStructTag(result.returnValues?.[0]?.[1]),
      })
    }

    return rewards
  }

  /**
   * Calculate pending reward amounts for a position across all rewarders
   * @param pair - The LBPair containing the position
   * @param positionId - ID of the position to check rewards for
   * @returns Promise resolving to array of pending rewards by coin type
   *
   * @example
   * ```typescript
   * const rewards = await positionModule.getPositionRewards(pair, "0x123...");
   * rewards.forEach(reward => {
   *   console.log(`Pending ${reward.amount} of ${reward.coinType}`);
   * });
   * ```
   */
  public async getPositionRewardsV2(pair: LBPair, positionId: string, binIds: number[]): Promise<PositionReward[]> {
    const rewards: PositionReward[] = []
    const sender = this.sdk.senderAddress
    const tx = new Transaction()
    TransactionUtil.collectPositionFeesV2(
      {
        pairId: pair.id,
        positionId,
        typeX: pair.tokenXType,
        typeY: pair.tokenYType,
        binIds,
      },
      this.sdk.sdkOptions,
      tx
    )
    
    for (const reward of pair.rewarders) {
      TransactionUtil.collectPositionRewards(
        {
          pairId: pair.id,
          positionId,
          rewardCoin: reward.reward_coin,
          typeX: pair.tokenXType,
          typeY: pair.tokenYType,
          binIds,
        },
        this.sdk.sdkOptions,
        tx
      )
    }
    const res = await this.sdk.fullClient.devInspectTransactionBlock({ transactionBlock: tx, sender })
    let skipped = false;

    for (const index in res.results ?? []) {
      if (!skipped) {
        skipped = true;
      continue
      }
      const result = res.results![index]

      const coin = "0x2::coin::Coin";
      if (!result.returnValues?.[0]?.[1].startsWith(coin)) {
        continue
      }
      
      const resValue = new Uint8Array(result.returnValues?.[0]?.[0] ?? [])
      const value = bcs.struct("", { address: bcs.Address, value: bcs.u64() }).parse(resValue)
      
      rewards.push({
        amount: value.value,
        coinType: normalizeStructTag(result.returnValues?.[0]?.[1]),
      })
    }

    return rewards
  }

  /**
   * Claim all pending rewards for a position and transfer to sender
   * @param pair - The LBPair containing the position
   * @param positionId - ID of the position to claim rewards for
   * @param tx - Optional existing transaction to add operations to
   * @returns Transaction object with reward claiming operations
   *
   * @example
   * ```typescript
   * const tx = await positionModule.claimPositionRewards(pair, "0x123...");
   * // All pending rewards will be transferred to sender
   * ```
   */
  public async claimPositionRewards(pair: LBPair, positionId: string, binIds: number[], tx?: Transaction): Promise<Transaction> {
    const sender = this.sdk.senderAddress
    tx ??= new Transaction()
    tx.setSender(sender)

    for (const reward of pair.rewarders) {
      const [_, coin] = TransactionUtil.collectPositionRewards(
        {
          pairId: pair.id,
          positionId,
          rewardCoin: reward.reward_coin,
          typeX: pair.tokenXType,
          typeY: pair.tokenYType,
          binIds,
        },
        this.sdk.sdkOptions,
        tx
      )

      tx.transferObjects([coin], sender)
    }

    return tx
  }

  /**
   * Claim all pending rewards for a position and transfer to sender
   * @param pair - The LBPair containing the position
   * @param positionId - ID of the position to claim rewards for
   * @param tx - Optional existing transaction to add operations to
   * @returns Transaction object with reward claiming operations
   *
   * @example
   * ```typescript
   * const tx = await positionModule.claimPositionRewards(pair, "0x123...");
   * // All pending rewards will be transferred to sender
   * ```
   */
  public async claimPositionRewardsV2(pair: LBPair, positionId: string, binIds: number[], tx?: Transaction): Promise<Transaction> {
    const sender = this.sdk.senderAddress
    tx ??= new Transaction()
    tx.setSender(sender)

    for (const reward of pair.rewarders) {
      const [_, coin] = TransactionUtil.collectPositionRewardsV2(
        {
          pairId: pair.id,
          positionId,
          rewardCoin: reward.reward_coin,
          typeX: pair.tokenXType,
          typeY: pair.tokenYType,
          binIds,
        },
        this.sdk.sdkOptions,
        tx
      )

      tx.transferObjects([coin], sender)
    }

    return tx
  }

  /**
   * Calculate pending fee amounts for specific bins of a position
   * @param pair - The LBPair containing the position
   * @param positionId - ID of the position to check fees for
   * @param binIds - Array of bin IDs to calculate fees for
   * @returns Promise resolving to tuple of [tokenX fees, tokenY fees] or null
   *
   * @example
   * ```typescript
   * const fees = await positionModule.getPositionFees(pair, "0x123...", [8388608, 8388609]);
   * if (fees) {
   *   console.log(`Fees: ${fees[0].amount} tokenX, ${fees[1].amount} tokenY`);
   * }
   * ```
   */
  public async getPositionFees(pair: LBPair, positionId: string, binIds: number[]): Promise<[PositionReward, PositionReward] | null> {
    let rewards: [PositionReward, PositionReward] | null = null
    const sender = this.sdk.senderAddress
    const tx = new Transaction()

    TransactionUtil.getPositionFees(
      {
        pairId: pair.id,
        positionId,
        typeX: pair.tokenXType,
        typeY: pair.tokenYType,
        binIds,
      },
      this.sdk.sdkOptions,
      tx
    )
    const res = await this.sdk.fullClient.devInspectTransactionBlock({ transactionBlock: tx, sender })
    
    for (const index in res.results ?? []) {
      const result = res.results![index]
      const resXValue = new Uint8Array(result.returnValues?.[0]?.[0] ?? [])
      const valueX = bcs.u64().parse(resXValue)

      const resYValue = new Uint8Array(result.returnValues?.[1]?.[0] ?? [])
      const valueY = bcs.u64().parse(resYValue)

      rewards = [
        {
          amount: valueX,
          coinType: pair.tokenXType,
        },
        {
          amount: valueY,
          coinType: pair.tokenYType,
        },
      ]
    }

    return rewards
  }

  /**
   * Calculate pending fee amounts for specific bins of a position
   * @param pair - The LBPair containing the position
   * @param positionId - ID of the position to check fees for
   * @param binIds - Array of bin IDs to calculate fees for
   * @returns Promise resolving to tuple of [tokenX fees, tokenY fees] or null
   *
   * @example
   * ```typescript
   * const fees = await positionModule.getPositionFees(pair, "0x123...", [8388608, 8388609]);
   * if (fees) {
   *   console.log(`Fees: ${fees[0].amount} tokenX, ${fees[1].amount} tokenY`);
   * }
   * ```
   */
  public async getPositionFeesV2(pair: LBPair, positionId: string, binIds: number[]): Promise<[PositionReward, PositionReward] | null> {
    let rewards: [PositionReward, PositionReward] | null = null
    const sender = this.sdk.senderAddress
    const tx = new Transaction()
    TransactionUtil.getPositionFeesV2(
      {
        pairId: pair.id,
        positionId,
        typeX: pair.tokenXType,
        typeY: pair.tokenYType,
        binIds,
      },
      this.sdk.sdkOptions,
      tx
    )
    const res = await this.sdk.fullClient.devInspectTransactionBlock({ transactionBlock: tx, sender })

    for (const index in res.results ?? []) {
      const result = res.results![index]
      const resXValue = new Uint8Array(result.returnValues?.[0]?.[0] ?? [])
      const valueX = bcs.u64().parse(resXValue)

      const resYValue = new Uint8Array(result.returnValues?.[1]?.[0] ?? [])
      const valueY = bcs.u64().parse(resYValue)

      rewards = [
        {
          amount: valueX,
          coinType: pair.tokenXType,
        },
        {
          amount: valueY,
          coinType: pair.tokenYType,
        },
      ]
    }

    return rewards
  }

  /**
   * Claim accumulated fees for specific bins of a position
   * @param pair - The LBPair containing the position
   * @param positionId - ID of the position to claim fees for
   * @param binIds - Array of bin IDs to claim fees from
   * @param tx - Optional existing transaction to add operations to
   * @returns Transaction object with fee claiming operations
   *
   * @example
   * ```typescript
   * const binIds = [8388608, 8388609, 8388610];
   * const tx = await positionModule.claimPositionFee(pair, "0x123...", binIds);
   * // Fees from specified bins will be transferred to sender
   * ```
   */
  public async claimPositionFee(pair: LBPair, positionId: string, binIds: number[], tx?: Transaction): Promise<Transaction> {
    const sender = this.sdk.senderAddress
    const BATCH_SIZE = 1000
    tx ??= new Transaction()
    tx.setSender(sender)
    for (let index = 0; index < binIds.length; index += BATCH_SIZE) {
      const bins = binIds.slice(index, index + BATCH_SIZE)

      const [_, coinX, coinY] = TransactionUtil.collectPositionFees(
        {
          pairId: pair.id,
          positionId,
          binIds: bins,
          typeX: pair.tokenXType,
          typeY: pair.tokenYType,
        },
        this.sdk.sdkOptions,
        tx
      )

      tx.transferObjects([coinX, coinY], sender)
    }

    return tx
  }

  /**
   * Claim accumulated fees for specific bins of a position
   * @param pair - The LBPair containing the position
   * @param positionId - ID of the position to claim fees for
   * @param binIds - Array of bin IDs to claim fees from
   * @param tx - Optional existing transaction to add operations to
   * @returns Transaction object with fee claiming operations
   *
   * @example
   * ```typescript
   * const binIds = [8388608, 8388609, 8388610];
   * const tx = await positionModule.claimPositionFee(pair, "0x123...", binIds);
   * // Fees from specified bins will be transferred to sender
   * ```
   */
  public async claimPositionFeeV2(pair: LBPair, positionId: string, binIds: number[], tx?: Transaction): Promise<Transaction> {
    const sender = this.sdk.senderAddress
    const BATCH_SIZE = 1000
    tx ??= new Transaction()
    tx.setSender(sender)
    for (let index = 0; index < binIds.length; index += BATCH_SIZE) {
      const bins = binIds.slice(index, index + BATCH_SIZE)

      const [_, coinX, coinY] = TransactionUtil.collectPositionFeesV2(
        {
          pairId: pair.id,
          positionId,
          binIds: bins,
          typeX: pair.tokenXType,
          typeY: pair.tokenYType,
        },
        this.sdk.sdkOptions,
        tx
      )

      tx.transferObjects([coinX, coinY], sender)
    }

    return tx
  }

  /**
   * Lock a position until a specified timestamp to prevent modifications
   * @param pair - The LBPair containing the position
   * @param positionId - ID of the position to lock
   * @param untilTimestamp - Timestamp (in milliseconds) until which position should be locked
   * @param tx - Optional existing transaction to add operations to
   * @returns Transaction object with position locking operation
   *
   * @example
   * ```typescript
   * const lockUntil = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
   * const tx = await positionModule.lockPosition(pair, "0x123...", lockUntil);
   * ```
   */
  public async lockPosition(pair: LBPair, positionId: string, untilTimestamp: number, tx?: Transaction): Promise<Transaction> {
    const sender = this.sdk.senderAddress

    tx ??= new Transaction()
    tx.setSender(sender)
    TransactionUtil.lockPosition(
      {
        pairId: pair.id,
        positionId,
        typeX: pair.tokenXType,
        typeY: pair.tokenYType,
        untilTimestamp,
      },
      this.sdk.sdkOptions,
      tx
    )

    return tx
  }

  /**
   * Get the lock status and timing information for a position
   * @param positionId - ID of the position to check lock status for
   * @returns Promise resolving to tuple of [lockUntilTimestamp, currentTimestamp, isCurrentlyLocked]
   *
   * @example
   * ```typescript
   * const [lockUntil, currentTime, isLocked] = await positionModule.getLockPositionStatus("0x123...");
   * if (isLocked) {
   *   const unlockDate = new Date(lockUntil);
   *   console.log(`Position locked until ${unlockDate}`);
   * }
   * ```
   */
  public async getLockPositionStatus(positionId: string): Promise<[current_lock: number, current_timestamp: number, is_locked: boolean]> {
    const sender = this.sdk.senderAddress
    const packageId = this.sdk.sdkOptions.dlmm_pool.package_id

    const tx = new Transaction()
    tx.setSender(sender)
    tx.moveCall({
      target: `${packageId}::lb_position::get_lock_until`,
      arguments: [tx.object(positionId)],
    })
    tx.moveCall({
      target: '0x2::clock::timestamp_ms',
      arguments: [tx.object(CLOCK_ADDRESS)],
    })

    const res = await this.sdk.fullClient.devInspectTransactionBlock({ transactionBlock: tx, sender })
    const currentLockBytes = new Uint8Array(res.results![0].returnValues?.[0]?.[0] ?? [])
    const currentLock = Number(bcs.u64().parse(currentLockBytes))

    const currentTimestampBytes = new Uint8Array(res.results![1].returnValues?.[0]?.[0] ?? [])
    const currentTimestamp = Number(bcs.u64().parse(currentTimestampBytes))

    return [currentLock, currentTimestamp, currentLock > currentTimestamp]
  }

  // private methods

  /**
   * Fetch all bins from a bin manager
   * @param binManagerId - The ID of the bin manager object
   * @param positionVersion - Version string of the position
   * @returns Promise resolving to sorted array of BinData
   */
  private async getBinsByManager(binManagerId: string, positionVersion: string): Promise<BinData[]> {
    // Create batcher for paginated bin fetching
    const binsFetcher = new RpcBatcher({
      key: ['bins', binManagerId],
      callback: async (cursor, limit) => {
        // Get dynamic fields (bins) of the bin manager
        const fields = await this.sdk.fullClient.getDynamicFields({
          parentId: binManagerId,
          cursor,
          limit,
        })

        // Fetch full content of each bin
        const objects = await this.sdk.fullClient.multiGetObjects({
          ids: fields.data.map((p) => p.objectId),
          options: {
            showContent: true,
          },
        })

        // Parse bin content
        const objectsContent = objects.map<PositionBinOnchain | null>(this.getStructContentFields)

        return {
          data: objectsContent.filter((o) => !!o),
          hasNextPage: fields.hasNextPage,
          nextCursor: fields.nextCursor,
        }
      },
      version: positionVersion,
    })

    // Fetch all bins and sort by bin ID
    const bins = await binsFetcher.fetchAll().then((res) => res.sort((a, b) => a.name - b.name))

    // Convert to BinData format
    return bins.flatMap((packed) =>
      packed.value.fields.bin_data.map(
        (bin) =>
          ({
            id: bin.fields.bin_id,
            liquidity: BigInt(bin.fields.amount),
          }) as BinData
      )
    )
  }

  /**
   * Get bin manager for a specific position
   * @param positionManager - The ID of the position manager object
   * @param positionId - The ID of the position
   * @returns Promise resolving to bin manager data
   * @throws Error if position manager ID is invalid or bin manager not found
   */
  private async getBinManager(
    positionManager: string,
    positionId: string
  ): Promise<{
    id: {
      id: string
    }
    size: string
  }> {
    // Validate position manager address
    if (!isValidSuiAddress(positionManager)) {
      throw new Error('Invalid position manager id')
    }

    const suiClient = this.sdk.fullClient

    // Fetch position info from position manager
    const positionInfo = await suiClient.getDynamicFieldObject({
      parentId: positionManager,
      name: {
        type: '0x2::object::ID',
        value: positionId,
      },
    })

    // Extract bin manager from position info
    const binManager = this.getBinManagerByPositionInfo(positionInfo)

    if (!binManager) {
      throw new Error('Bin Manager not found')
    }
    return binManager
  }

  /**
   * Extract struct content fields from a Sui object response
   * @param object - SuiObjectResponse to parse
   * @returns Parsed fields or null if invalid
   */
  private getStructContentFields<T extends Object>(object: SuiObjectResponse): T | null {
    // Skip package objects or objects without fields
    if (object.data?.content?.dataType === 'package' || !object.data?.content?.fields) {
      return null
    }

    return object.data?.content?.fields as unknown as T
  }

  /**
   * Extract bin manager from position info object
   * @param positionInfo - SuiObjectResponse containing position info
   * @returns Bin manager fields or null if not found
   */
  private getBinManagerByPositionInfo(positionInfo: SuiObjectResponse): {
    id: {
      id: string
    }
    size: string
  } | null {
    const content = this.getStructContentFields<PositionInfoOnChain>(positionInfo)
    const binManager = content?.value?.fields?.bins?.fields

    return binManager ?? null
  }

  /**
   * Parse raw position content into LBPosition format
   * @param typeTag - The type tag string of the position object
   * @param contents - The parsed data content from chain
   * @param version - Version string of the position
   * @returns Parsed LBPosition or null if invalid
   */
  private parsePositionContent(typeTag: string, contents: SuiParsedData | undefined | null, version: string): LBPosition | null {
    // Parse and validate struct tag
    const structTag = parseStructTag(typeTag)
    const {
      dlmm_pool: { package_id, published_at },
    } = this.sdk.sdkOptions

    // Validate position type matches expected structure
    if (
      contents?.dataType !== 'moveObject' ||
      (structTag.address !== package_id && structTag.address !== published_at) ||
      structTag.module !== 'lb_position' ||
      structTag.name !== 'LBPosition'
    ) {
      return null
    }

    // Cast to position on-chain type
    const positionOnChain = contents?.fields as LbPositionOnChain

    if (!positionOnChain) {
      return null
    }

    // Convert to LBPosition format
    return {
      id: positionOnChain.id.id,
      tokenXType: positionOnChain.coin_type_a.fields.name,
      tokenYType: positionOnChain.coin_type_b.fields.name,
      description: positionOnChain.description,
      index: positionOnChain.index,
      name: positionOnChain.name,
      pair_id: positionOnChain.pair_id,
      url: positionOnChain.url,
      version,
    }
  }
}

function arrayToMap<T extends { id: number }>(value: T[]): Record<number, T> {
  return value.reduce((p, v) => ((p[v.id] = v), p), {} as Record<number, T>)
}
