import { isValidSuiAddress, normalizeStructTag, parseStructTag } from '@mysten/sui/utils'
import { IModule } from '../interfaces/IModule'
import { FerraDammSDK } from '../sdk'
import { CachedContent } from '../utils/cached-content'
import { Amounts, BinData, CollectPositionRewardsEvent, LBPair, LbPairBinData, LBPosition } from '../interfaces/IPair'
import type { SuiClient, SuiObjectResponse, SuiParsedData } from '@mysten/sui/client'
import { checkValidSuiAddress, RpcBatcher, TransactionUtil } from '../utils'
import { DammPairsError, UtilsErrorCode } from '../errors/errors'
import { LbPositionOnChain, PositionBinOnchain, PositionInfoOnChain, PositionReward } from '../interfaces/IPosition'

import { getAmountOutOfBin } from '../utils/bin_helper'
import { Transaction } from '@mysten/sui/transactions'
import { inspect } from 'util'
import { bcs, BcsType } from '@mysten/sui/bcs'
import { CLOCK_ADDRESS } from '../types'

export const LBPositionStruct = bcs.struct('LBPosition', {
  id: bcs.struct('0x2::object::ID', { id: bcs.Address }),
  pair_id: bcs.Address,
  my_id: bcs.Address,
  saved_fees_x: bcs.u128(),
  saved_fees_y: bcs.u128(),
  saved_rewards: bcs.vector(bcs.u128()),
  coin_type_a: bcs.struct('TypeName', {
    fields: bcs.struct('TypeNameFields', { name: bcs.String }),
  }),
  coin_type_b: bcs.struct('TypeName', {
    fields: bcs.struct('TypeNameFields', { name: bcs.String }),
  }),
  lock_until: bcs.u64(),
  total_bins: bcs.u64(),
})

const DynamicFieldNode = <K extends BcsType<any>, V extends BcsType<any>>(key: K, value: V) => {
  return bcs.struct('DynamicFieldNode', {
    id: bcs.struct('UID', {
      id: bcs.Address,
    }),
    name: key,
    value,
  })
}

export const PackedBinsStruct = DynamicFieldNode(
  bcs.u32(),bcs.struct('PackedBins', {
  active_bins_bitmap: bcs.u8(),
  bin_data: bcs.vector(
    bcs.struct('LBBinPosition', {
      bin_id: bcs.u32(),
      amount: bcs.u128(),
      fee_growth_inside_last_x: bcs.u128(),
      fee_growth_inside_last_y: bcs.u128(),
      reward_growth_inside_last: bcs.vector(bcs.u128()),
    })
  ),
}))

/**
 * Module for managing DAMM positions
 * Handles fetching and parsing of liquidity positions and their associated bins
 */
export class PositionModule implements IModule {
  protected _sdk: FerraDammSDK

  /**
   * Cache storage for position data
   */
  private readonly _cache: Record<string, CachedContent> = {}

  /**
   * Initialize the position module with SDK instance
   * @param sdk - FerraDammSDK instance
   */
  constructor(sdk: FerraDammSDK) {
    this._sdk = sdk
  }

  /**
   * Get the SDK instance
   * @returns FerraDammSDK instance
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

    const lpPositionWapper = (
      await this.sdk.grpcClient.ledgerService.getObject({
        objectId: positionId,
        readMask: {
          paths: ['object_type', 'contents'],
        },
      })
    ).response

    // Validate response has required data
    if (!lpPositionWapper.object?.contents) {
      throw new Error('Position not found')
    }

    // Parse position content from on-chain data
    const data = this.parsePositionContent(
      lpPositionWapper.object.objectType!,
      LBPositionStruct.parse(lpPositionWapper.object.contents.value ?? new Uint8Array()),
      (lpPositionWapper.object.version ?? '0').toString()
    )

    if (!data) {
      throw new Error('Invalid position content')
    }

    return data
  }

  /**
   * Fetch all liquidity positions owned by the current sender
   * @returns Promise resolving to array of LBPosition data
   * @throws DammPairsError if sender address is invalid
   */
  public async getLbPositions(pairIds: string[], owner = this.sdk.senderAddress): Promise<LBPosition[]> {
    const suiClient = this.sdk.grpcClient
    const {
      damm_pool: { package_id },
    } = this.sdk.sdkOptions

    // Validate sender address
    if (!checkValidSuiAddress(this.sdk.senderAddress)) {
      throw new DammPairsError(
        'Invalid sender address: ferra clmm sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }

    const positions: LBPosition[] = []

    let pageToken: Uint8Array | undefined = undefined

    while (true) {
      const objects = await suiClient.stateService.listOwnedObjects({
        owner,
        objectType: `${package_id}::lb_position::LBPosition`,
        pageToken,
        pageSize: 500,
        readMask: {
          paths: ['object_type', 'contents'],
        },
      })

      for (const object of objects.response.objects) {
        const data = this.parsePositionContent(
          object.objectType!,
          LBPositionStruct.parse(object.contents?.value ?? new Uint8Array()),
          (object.version ?? '0').toString()
        )

        if (!data) {
          continue
        }

        positions.push(data)
      }

      if (!objects.response.objects.length || !objects.response.nextPageToken) {
        break
      } else {
        pageToken = objects.response.nextPageToken
      }
    }

    if (pairIds.length) {
      return positions.filter((v) => pairIds.includes(v.pair_id))
    }

    return positions
  }

  /**
   * Get all bins associated with a position in a specific pair
   * @param pair - The LBPair object containing position manager
   * @param positionId - The ID of the position to fetch bins for
   * @returns Promise resolving to array of BinData
   * @throws Error if position manager not found or position doesn't match pair
   */
  public async getPositionBins(pair: LBPair, positionId: string): Promise<BinData[]> {
    if (this._cache[positionId]) {
      return this._cache[positionId].value
    }
    const positionManager = pair.positionManager

    // Check if position manager exists
    if (!positionManager) {
      return []
    }

    // Get bin manager for this position
    const binManager = await this.getBinManager(positionManager, positionId)

    // Return empty if no bins
    if (!binManager || binManager.size == '0') {
      return []
    }

    const binManagerId = binManager.id.id
    const data = await this.getBinsByManager(binManagerId)
    // Fetch all bins from the bin manager
    this._cache[positionId] = new CachedContent(data)
    return data
  }

  // /**
  //  * Get all bins associated with a position in a specific pair
  //  * @param pair - The LBPair object containing position manager
  //  * @param positionId - The ID of the position to fetch bins for
  //  * @returns Promise resolving to array of BinData
  //  * @throws Error if position manager not found or position doesn't match pair
  //  */
  // public async getPositionBinsWithRange(pair: LBPair, positionId: string, binRange: [from: number, to: number]): Promise<BinData[]> {
  //   const positionManager = pair.positionManager

  //   // Check if position manager exists
  //   if (!positionManager) {
  //     return []
  //   }

  //   // Fetch position to validate it belongs to this pair
  //   const position = await this.getLbPosition(positionId)

  //   if (position?.pair_id != pair.id) {
  //     throw new Error('Position is not match with pair id')
  //   }

  //   // Get bin manager for this position
  //   const binManager = await this.getBinManager(positionManager, positionId)

  //   // Return empty if no bins
  //   if (!binManager || binManager.size == '0') {
  //     return []
  //   }

  //   const binManagerId = binManager.id.id

  //   // Fetch all bins from the bin manager
  //   return await this.getBinsByManager(binManagerId)
  // }

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
   * Retrieves the balance of multiple coin types from a RewarderGlobalVault on the SUI network.
   *
   * This function queries the RewarderGlobalVault's dynamic fields (stored in a Bag)
   * to find the balance for each provided coin type. If a coin type is not found in the vault,
   * it returns 0n for that coin type.
   *
   * @param {SuiClient} client - The SUI client instance used to make RPC calls
   * @param {string} rewarderVaultId - The object ID of the RewarderGlobalVault on SUI blockchain
   * @param {string[]} coinTypes - Array of coin type identifiers to query balances for
   *
   * @returns {Promise<bigint[]>} Array of balances corresponding to each coin type.
   *                               Returns 0n if a coin type doesn't exist in the vault.
   *                               The order matches the input coinTypes array.
   *
   * @example
   * ```typescript
   * const client = new SuiClient({ url: "https://fullnode.mainnet.sui.io" });
   *
   * const balances = await getRewarderBalances(
   *   client,
   *   "0xd68c56a1610953b0a81c48ad26e463c6c51e50ddcc13e5e4121fe70ee75c1bf7",
   *   [
   *     "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
   *     "0x2::sui::SUI",
   *   ]
   * );
   *
   * console.log(balances); // [47463762n, 0n]
   * ```
   *
   * @throws {Error} Throws if the vault object is invalid or not a moveObject
   */
  public async getRewarderBalances<T extends Array<string>>(coinTypes: T): Promise<SizedArray<bigint, T['length']>> {
    const config = this.sdk.sdkOptions
    const client = this.sdk.fullClient
    const { reward_vault } = config.damm_pool.config ?? {}
    if (!reward_vault) {
      throw new Error('Pairs id not found from config')
    }

    const vault = await client.getObject({
      id: reward_vault,
      options: {
        showContent: true,
        showType: true,
      },
    })

    if (vault.data?.content?.dataType !== 'moveObject') {
      throw new Error('Invalid vault object')
    }

    const vaultContent = vault.data.content.fields as any

    const balancesBagId = vaultContent.balances.fields.id.id

    let cursor: string | null = null
    const dynamicFieldsMap = new Map<string, string>()

    do {
      const response = await client.getDynamicFields({
        parentId: balancesBagId,
        cursor,
        limit: 100,
      })

      for (const field of response.data) {
        if (field.name.type === '0x1::type_name::TypeName') {
          const fieldName = field.name.value as any
          const coinType = fieldName.name?.fields?.name || fieldName?.name

          dynamicFieldsMap.set(normalizeStructTag(coinType), field.objectId)
        }
      }

      cursor = response.hasNextPage ? response.nextCursor : null
    } while (cursor)

    const results: bigint[] = []

    for (let coinType of coinTypes) {
      coinType = normalizeStructTag(coinType)
      let objectId = dynamicFieldsMap.get(coinType)

      if (!objectId) {
        results.push(0n)
        continue
      }

      try {
        const dynamicField = await client.getObject({
          id: objectId,
          options: {
            showContent: true,
          },
        })

        if (dynamicField.data?.content?.dataType === 'moveObject') {
          const fieldContent = dynamicField.data.content.fields as any
          const balance = BigInt(fieldContent.value || '0')
          results.push(balance)
        } else {
          results.push(0n)
        }
      } catch {
        results.push(0n)
      }
    }

    return results as SizedArray<bigint, T['length']>
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
  public async getPositionRewards(pair: LBPair, positionId: string): Promise<PositionReward[]> {
    const rewards: PositionReward[] = []
    const sender = this.sdk.senderAddress
    const tx = new Transaction()
    tx.setSender(sender)

    const bins = await this.getPositionBins(pair, positionId);

    const coins: any[] = []

    for (const reward of pair.rewarders) {
      const [_, coin] = TransactionUtil.collectPositionRewards(
        {
          pairId: pair.id,
          positionId,
          rewardCoin: reward.reward_coin,
          typeX: pair.tokenXType,
          typeY: pair.tokenYType,
          binIds: bins.map(b => b.id),
        },
        this.sdk.sdkOptions,
        tx
      )

      coins.push(coin)
    }

    if (coins.length) {
      tx.transferObjects([...coins], sender)
    }

    const res = await this.sdk.fullClient.dryRunTransactionBlock({
      transactionBlock: await tx.build({ client: this.sdk.fullClient }),
    })

    const rewardEvents = res.events as CollectPositionRewardsEvent[]

    for (const event of rewardEvents ?? []) {
      rewards.push({
        amount: event.parsedJson.amount,
        coinType: normalizeStructTag(event.parsedJson.reward_type.name),
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
  public async claimPositionRewards(pair: LBPair, positionId: string, hasLiquidity = true, tx?: Transaction): Promise<Transaction> {
    const sender = this.sdk.senderAddress
    tx ??= new Transaction()
    tx.setSender(sender)
    const bins = hasLiquidity ? await this.getPositionBins(pair, positionId) : [];

    for (const reward of pair.rewarders) {
      const [_, coin] = TransactionUtil.collectPositionRewards(
        {
          pairId: pair.id,
          positionId,
          rewardCoin: reward.reward_coin,
          typeX: pair.tokenXType,
          typeY: pair.tokenYType,
          binIds: bins.map(bin => bin.id),
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
  public async getPositionFees(pair: LBPair, positionId: string): Promise<[PositionReward, PositionReward] | null> {
    let rewards: [PositionReward, PositionReward] | null = null
    const sender = this.sdk.senderAddress
    const tx = new Transaction()

    const bins = await this.getPositionBins(pair, positionId)

    TransactionUtil.getPositionFees(
      {
        pairId: pair.id,
        positionId,
        typeX: pair.tokenXType,
        typeY: pair.tokenYType,
        binIds: bins.map(v => v.id),
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
  public async claimPositionFee(pair: LBPair, positionId: string, hasLiquidity = true, tx?: Transaction): Promise<Transaction> {
    const sender = this.sdk.senderAddress
    const BATCH_SIZE = 1000
    tx ??= new Transaction()
    tx.setSender(sender)
    const bins = hasLiquidity ? await this.getPositionBins(pair, positionId) : [];

    for (let index = 0; index < bins.length; index += BATCH_SIZE) {

      const [_, coinX, coinY] = TransactionUtil.collectPositionFees(
        {
          pairId: pair.id,
          positionId,
          binIds: bins.map(bin => bin.id),
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
    const packageId = this.sdk.sdkOptions.damm_pool.package_id

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
  private async getBinsByManager(binManagerId: string): Promise<BinData[]> {
    const grpcClient = this.sdk.grpcClient

    const bins: BinData[] = []
    let token: Uint8Array | undefined = undefined
    while (true) {
      const res = await grpcClient.stateService.listDynamicFields({
        parent: binManagerId,
        readMask: {
          paths: ['field_id', 'child_id', 'field_object.contents'],
        },
        pageSize: 500,
        pageToken: token
      }).response

      if (!!res.nextPageToken) {
        token = getNextPageToken(res)
      }
  
      const packed = res.dynamicFields.map((v) => PackedBinsStruct.parse(v.fieldObject?.contents?.value ?? new Uint8Array()))

      bins.push(...packed.flatMap(binPacked => binPacked.value.bin_data.map(v => ({
        id: v.bin_id,
        liquidity: BigInt(v.amount)
      } as BinData))))

      if (!packed.length || !res.nextPageToken) {
        break;
      }
    }

    return bins.sort((a, b) => a.id - b.id)
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
    const cache = this._cache[positionId]
    if (cache) {
      return cache.value
    }
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
    this._cache[positionId] = new CachedContent(binManager);
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
  private parsePositionContent(typeTag: string, positionOnChain: LbPositionOnChain, version: string): LBPosition | null {
    // Parse and validate struct tag
    const structTag = parseStructTag(typeTag)
    const {
      damm_pool: { package_id, published_at },
    } = this.sdk.sdkOptions

    // Validate position type matches expected structure
    if (
      (structTag.address !== package_id && structTag.address !== published_at) ||
      structTag.module !== 'lb_position' ||
      structTag.name !== 'LBPosition'
    ) {
      return null
    }

    if (!positionOnChain) {
      return null
    }

    // Convert to LBPosition format
    return {
      id: positionOnChain.id.id,
      tokenXType: positionOnChain.coin_type_a.fields.name,
      tokenYType: positionOnChain.coin_type_b.fields.name,
      pair_id: positionOnChain.pair_id,
      saved_fees_x: BigInt(positionOnChain.saved_fees_x),
      saved_fees_y: BigInt(positionOnChain.saved_fees_y),
      saved_rewards: positionOnChain.saved_rewards.map(BigInt),
      total_bins: Number(positionOnChain.total_bins),
      lock_until: Number(positionOnChain.lock_until),
      version,
    }
  }
}

function arrayToMap<T extends { id: number }>(value: T[]): Record<number, T> {
  return value.reduce((p, v) => ((p[v.id] = v), p), {} as Record<number, T>)
}

type SizedArray<T, S extends number, Arr extends T[] = []> = Arr['length'] extends S ? Arr : SizedArray<T, S, [...Arr, T]>

function getNextPageToken(o: any) {
  return o.nextPageToken
}