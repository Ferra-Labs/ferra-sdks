import { DynamicFieldPage, SuiObjectResponse, SuiTransactionBlockResponse } from '@mysten/sui/client'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions'
import { CachedContent, cacheTime24h, cacheTime5min, checkValidSuiAddress, getFutureTime } from '../utils'
import {
  CreatePoolAddLiquidityParams,
  CreatePoolParams,
  FetchParams,
  DammConfig,
  Pool,
  PoolImmutables,
  Position,
  PositionReward,
  getPackagerConfigs,
  CoinAsset,
  PoolTransactionInfo,
} from '../types'
import { TransactionUtil } from '../utils/transaction-util'
import { tickScore } from '../math'
import { asUintN, buildPool, buildPoolTransactionInfo, buildPositionReward, buildTickData, buildTickDataByEvent } from '../utils/common'
import { extractStructTagFromType, isSortedSymbols } from '../utils/contracts'
import { TickData } from '../types/damm-pool'
import {
  DammFetcherModule,
  DammIntegratePoolModule,
  DammPartnerModule,
  CLOCK_ADDRESS,
  DataPage,
  PageQuery,
  PaginationArgs,
  SuiObjectIdType,
  SuiResource,
} from '../types/sui'
import { FerraDammSDK } from '../sdk'
import { IModule } from '../interfaces/IModule'
import { getObjectPreviousTransactionDigest } from '../utils/objects'
import { DammpoolsError, ConfigErrorCode, PartnerErrorCode, PoolErrorCode, PositionErrorCode, UtilsErrorCode } from '../errors/errors'
import { RpcModule } from './rpc'
import { inspect } from 'util'

type GetTickParams = {
  start: number[]
  limit: number
} & FetchParams

export type CreatePoolAndAddLiquidityRowResult = {
  position: TransactionObjectArgument
  coinAObject: TransactionObjectArgument
  coinBObject: TransactionObjectArgument
  transaction: Transaction
  coinAType: string
  coinBType: string
}

export type FeeTier = {
  tick_spacing: number
  dynamic_fee: {
    decay_period: number
    filter_period: number
    max_volatility_accumulator: number
    reduction_factor: number
    variable_fee_control: number
  }
  fee_rate: number
  fee_scheduler: {
    exponential: {
      cliff_fee_numerator: string
      number_of_period: number
      period_frequency: string
      reduction_factor: string
    }
    linear: {
      cliff_fee_numerator: string
      number_of_period: number
      period_frequency: string
      reduction_factor: string
    }
  }
}

/**
 * Pool module for comprehensive DAMM pool management
 * Handles pool creation, data retrieval, liquidity operations, and tick management
 * Includes caching mechanisms for optimal performance
 *
 * @example
 * // Get pool information
 * const pool = await sdk.Pool.getPool('0x_pool_address');
 * console.log(`Liquidity: ${pool.liquidity}`);
 * console.log(`Current tick: ${pool.currentTickIndex}`);
 * console.log(`Fee rate: ${pool.feeRate / 10000000}%`);
 *
 * @example
 * // Fetch all ticks for a pool
 * const ticks = await sdk.Pool.fetchTicksByRpc('0x_pool_address');
 * console.log(`Found ${ticks.length} initialized ticks`);
 *
 * @example
 * // Create a new pool with initial liquidity
 * const createPoolTx = await sdk.Pool.createPoolTransactionPayload({
 *   coinTypeA: "0x2::sui::SUI",
 *   coinTypeB: "0x5d4b...::coin::COIN",
 *   tick_spacing: 60,
 *   initialize_sqrt_price: "79228162514264337593543950336", // 1:1 price
 *   uri: "https://example.com/pool-metadata.json",
 *   amount_a: 1000000000, // 1 SUI
 *   amount_b: 1000000,    // 1 COIN
 *   fix_amount_a: true,
 *   tick_lower: -120,
 *   tick_upper: 120,
 *   slippage: 0.05
 * });
 */
export class PoolModule implements IModule {
  protected _sdk: FerraDammSDK
  private readonly _cache: Record<string, CachedContent> = {}

  constructor(sdk: FerraDammSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  /**
   * Retrieves available base fee tiers and their parameters
   * Returns all supported fee configurations including dynamic fee settings
   * @returns Array of fee tier configurations with tick spacing and fee parameters
   * @throws {DammpoolsError} If config fetch fails
   * @example
   * const feeTiers = await sdk.Pool.getBaseFeesAvailable();
   * feeTiers.forEach(tier => {
   *   console.log(`Tick spacing: ${tier.tick_spacing}`);
   *   console.log(`Fee rate: ${tier.fee_rate / 10000000}%`);
   *   console.log(`Dynamic fee enabled: ${tier.dynamic_fee !== null}`);
   * });
   */
  async getBaseFeesAvailable() {
    const {
      config: { global_config_id },
    } = this.sdk.sdkOptions.damm_pool

    const data = await this.sdk.fullClient.getObject({ id: global_config_id, options: { showContent: true } })
    if (data.data.content.dataType === 'package') {
      return []
    }
    const contents = data.data.content.fields as Record<string, any>

    return contents.fee_tiers?.fields?.contents.map((v) => ({
      tick_spacing: v.fields.key,
      dynamic_fee: v.fields.value.fields.dynamic_fee.fields,
      fee_rate: Number(v.fields.value.fields.fee_rate),
      fee_scheduler: {
        exponential: v.fields.value.fields.fee_scheduler.fields.exponential.fields,
        linear: v.fields.value.fields.fee_scheduler.fields.linear.fields,
      },
    })) as FeeTier[]
  }

  /**
   * Gets all positions for a specific pool
   * Fetches position data from the pool's position manager
   * @param positionHandle - Position manager handle ID from pool object
   * @param paginationArgs - Pagination configuration or 'all' to fetch everything
   * @returns Paginated list of positions
   * @throws {DammpoolsError} If position handle is invalid
   * @example
   * const pool = await sdk.Pool.getPool(poolId);
   * const positions = await sdk.Pool.getPositionList(
   *   pool.positionManager.positionsHandle,
   *   { cursor: null, limit: 50 }
   * );
   * console.log(`Found ${positions.data.length} positions`);
   */
  async getPositionList(positionHandle: string, paginationArgs: PaginationArgs = 'all'): Promise<DataPage<Position>> {
    const dataPage: DataPage<Position> = {
      data: [],
      hasNextPage: true,
    }
    const objects = await this._sdk.fullClient.getDynamicFieldsByPage(positionHandle, paginationArgs)

    dataPage.hasNextPage = objects.hasNextPage
    dataPage.nextCursor = objects.nextCursor

    const positionObjectIDs = objects.data.map((item: any) => {
      if (item.error != null) {
        throw new DammpoolsError(
          `when getPositionList get position objects error: ${item.error}, please check the rpc, contracts address config and position id.`,
          ConfigErrorCode.InvalidConfig
        )
      }

      return item.name.value
    })

    const allPosition: Position[] = await this._sdk.Position.getSipmlePositionList(positionObjectIDs)
    dataPage.data = allPosition
    return dataPage
  }

  /**
   * Fetches pool immutable data (type, addresses, spacing) for multiple pools
   * Immutables don't change after pool creation - safe to cache long-term
   * @param assignPoolIDs - Specific pool IDs to fetch (empty = all pools)
   * @param offset - Starting index for pagination
   * @param limit - Maximum number of pools to return
   * @param forceRefresh - Bypass cache and fetch fresh data
   * @returns Array of pool immutable data
   * @example
   * // Get all pools
   * const allPools = await sdk.Pool.getPoolImmutables();
   *
   * // Get specific pools
   * const specificPools = await sdk.Pool.getPoolImmutables([
   *   '0x_pool1',
   *   '0x_pool2'
   * ]);
   *
   * specificPools.forEach(pool => {
   *   console.log(`${pool.name}: ${pool.coin_type_a} / ${pool.coin_type_b}`);
   * });
   */
  async getPoolImmutables(assignPoolIDs: string[] = [], offset = 0, limit = 100, forceRefresh = false): Promise<PoolImmutables[]> {
    const { package_id } = this._sdk.sdkOptions.damm_pool
    const cacheKey = `${package_id}_getInitPoolEvent`
    const cacheData = this.getCache<PoolImmutables[]>(cacheKey, forceRefresh)

    const allPools: PoolImmutables[] = []
    const filterPools: PoolImmutables[] = []

    if (cacheData !== undefined) {
      allPools.push(...cacheData)
    }

    if (allPools.length === 0) {
      try {
        const objects = await this._sdk.fullClient.queryEventsByPage({ MoveEventType: `${package_id}::factory::CreatePoolEvent` })

        objects.data.forEach((object: any) => {
          const fields = object.parsedJson
          if (fields) {
            allPools.push({
              poolAddress: fields.pool_id,
              tickSpacing: fields.tick_spacing,
              coinTypeA: extractStructTagFromType(fields.coin_type_a).full_address,
              coinTypeB: extractStructTagFromType(fields.coin_type_b).full_address,
            })
          }
        })
        this.updateCache(cacheKey, allPools, cacheTime24h)
      } catch (error) {
        console.log('getPoolImmutables', error)
      }
    }

    const hasAssignPools = assignPoolIDs.length > 0
    for (let index = 0; index < allPools.length; index += 1) {
      const item = allPools[index]
      if (hasAssignPools && !assignPoolIDs.includes(item.poolAddress)) continue
      if (!hasAssignPools && (index < offset || index >= offset + limit)) continue
      filterPools.push(item)
    }
    return filterPools
  }

  /**
   * Fetches complete pool state including current liquidity, price, and fees
   * This is the main method for getting up-to-date pool data
   * @param assignPools - Specific pool IDs to fetch (empty = all pools)
   * @param offset - Starting index for pagination
   * @param limit - Maximum number of pools to return
   * @returns Array of complete pool objects
   * @example
   * const pools = await sdk.Pool.getPools(['0x_pool_id']);
   * const pool = pools[0];
   *
   * console.log(`Current sqrt price: ${pool.currentSqrtPrice}`);
   * console.log(`Current tick: ${pool.currentTickIndex}`);
   * console.log(`Total liquidity: ${pool.liquidity}`);
   * console.log(`Coin A amount: ${pool.coinAmountA}`);
   * console.log(`Coin B amount: ${pool.coinAmountB}`);
   * console.log(`Fee rate: ${pool.feeRate / 10000000}%`);
   */
  async getPools(assignPools: string[] = [], offset = 0, limit = 100): Promise<Pool[]> {
    const allPool: Pool[] = []
    let poolObjectIds: string[] = []

    if (assignPools.length > 0) {
      poolObjectIds = [...assignPools]
    } else {
      const poolImmutables = await this.getPoolImmutables([], offset, limit, false)
      poolImmutables.forEach((item) => poolObjectIds.push(item.poolAddress))
    }

    const objectDataResponses = await this._sdk.fullClient.batchGetObjects(poolObjectIds, {
      showContent: true,
      showType: true,
    })

    for (const suiObj of objectDataResponses) {
      if (suiObj.error != null || suiObj.data?.content?.dataType !== 'moveObject') {
        throw new DammpoolsError(
          `getPools error code: ${suiObj.error?.code ?? 'unknown error'}, please check config and object ids`,
          PoolErrorCode.InvalidPoolObject
        )
      }
      // console.log('suiObj', inspect(suiObj.data.content.fields, { depth: null, colors: true }));

      const pool = buildPool(suiObj)
      allPool.push(pool)
      const cacheKey = `${pool.poolAddress}_getPoolObject`
      this.updateCache(cacheKey, pool, cacheTime24h)
    }
    return allPool
  }

  /**
   * Retrieves pool immutable data with advanced pagination support
   * @param paginationArgs - Pagination parameters ('all' or specific cursor/limit)
   * @param forceRefresh - Force cache refresh if true
   * @returns Paginated pool immutable data with navigation metadata
   */
  async getPoolImmutablesWithPage(paginationArgs: PaginationArgs = 'all', forceRefresh = false): Promise<DataPage<PoolImmutables>> {
    const { package_id } = this._sdk.sdkOptions.damm_pool
    const allPools: PoolImmutables[] = []
    const dataPage: DataPage<PoolImmutables> = {
      data: [],
      hasNextPage: false,
    }

    const queryAll = paginationArgs === 'all'
    const cacheAllKey = `${package_id}_getPoolImmutables`
    if (queryAll) {
      const cacheDate = this.getCache<PoolImmutables[]>(cacheAllKey, forceRefresh)
      if (cacheDate) {
        allPools.push(...cacheDate)
      }
    }
    if (allPools.length === 0) {
      try {
        const moveEventType = `${package_id}::factory::CreatePoolEvent`
        const objects = await this._sdk.fullClient.queryEventsByPage({ MoveEventType: moveEventType }, paginationArgs)
        dataPage.hasNextPage = objects.hasNextPage
        dataPage.nextCursor = objects.nextCursor
        objects.data.forEach((object: any) => {
          const fields = object.parsedJson
          if (fields) {
            const poolImmutables = {
              poolAddress: fields.pool_id,
              tickSpacing: fields.tick_spacing,
              coinTypeA: extractStructTagFromType(fields.coin_type_a).full_address,
              coinTypeB: extractStructTagFromType(fields.coin_type_b).full_address,
            }
            allPools.push(poolImmutables)
          }
        })
      } catch (error) {
        console.log('getPoolImmutables', error)
      }
    }
    dataPage.data = allPools
    if (queryAll) {
      this.updateCache(`${package_id}_getPoolImmutables`, allPools, cacheTime24h)
    }
    return dataPage
  }

  /**
   * Retrieves complete pool data with advanced pagination support
   * @param assignPools - Specific pool IDs to retrieve (empty array for all pools)
   * @param paginationArgs - Pagination parameters ('all' or specific cursor/limit)
   * @param forceRefresh - Force cache refresh if true
   * @returns Array of complete pool objects with current state
   */
  async getPoolsWithPage(assignPools: string[] = [], paginationArgs: PaginationArgs = 'all', forceRefresh = false): Promise<Pool[]> {
    const allPool: Pool[] = []
    let poolObjectIds: string[] = []

    if (assignPools.length > 0) {
      poolObjectIds = [...assignPools]
    } else {
      const poolImmutables = (await this.getPoolImmutablesWithPage(paginationArgs, forceRefresh)).data
      poolImmutables.forEach((item) => poolObjectIds.push(item.poolAddress))
    }

    const objectDataResponses: any[] = await this._sdk.fullClient.batchGetObjects(poolObjectIds, {
      showContent: true,
      showType: true,
    })

    for (const suiObj of objectDataResponses) {
      if (suiObj.error != null || suiObj.data?.content?.dataType !== 'moveObject') {
        throw new DammpoolsError(
          `getPoolWithPages error code: ${suiObj.error?.code ?? 'unknown error'}, please check config and object ids`,
          PoolErrorCode.InvalidPoolObject
        )
      }
      const pool = buildPool(suiObj)
      allPool.push(pool)
      const cacheKey = `${pool.poolAddress}_getPoolObject`
      this.updateCache(cacheKey, pool, cacheTime24h)
    }
    return allPool
  }

  /**
   * Gets a single pool's complete state by ID
   * Preferred method for fetching individual pool data - includes caching
   * @param poolID - Pool object ID (0x-prefixed address)
   * @param forceRefresh - Skip cache and fetch fresh data (default: true)
   * @returns Complete pool object with current state
   * @throws {DammpoolsError} If pool doesn't exist or fetch fails (PoolErrorCode.InvalidPoolObject)
   * @example
   * const pool = await sdk.Pool.getPool('0x_pool_address');
   *
   * // Check if pool is paused
   * if (pool.isPause) {
   *   console.log('Pool is currently paused');
   * }
   *
   * // Calculate current price from sqrt price
   * const sqrtPrice = new BN(pool.currentSqrtPrice);
   * const price = TickMath.sqrtPriceX64ToPrice(sqrtPrice, 9, 6);
   * console.log(`Current price: ${price.toString()} COIN per SUI`);
   */
  async getPool(poolID: string, forceRefresh = true): Promise<Pool> {
    const cacheKey = `${poolID}_getPoolObject`
    const cacheData = this.getCache<Pool>(cacheKey, forceRefresh)
    if (cacheData !== undefined) {
      return cacheData
    }
    const object = (await this._sdk.fullClient.getObject({
      id: poolID,
      options: {
        showType: true,
        showContent: true,
      },
    })) as SuiObjectResponse

    if (object.error != null || object.data?.content?.dataType !== 'moveObject') {
      throw new DammpoolsError(
        `getPool error code: ${object.error?.code ?? 'unknown error'}, please check config and object id`,
        PoolErrorCode.InvalidPoolObject
      )
    }
    const pool = buildPool(object)
    this.updateCache(cacheKey, pool)
    return pool
  }

  /**
   * Creates a transaction to instantiate a new pool with initial liquidity
   * Automatically sorts coins and validates parameters
   * @param params - Pool creation parameters including coins, fee tier, and initial position
   * @returns Transaction ready for signing and execution
   * @throws {DammpoolsError} If coin types are invalid or amounts insufficient
   * @example
   * const tx = await sdk.Pool.createPoolTransactionPayload({
   *   coinTypeA: "0x2::sui::SUI",
   *   coinTypeB: "0x5d4b...::coin::COIN",
   *   tick_spacing: 60,  // Standard 0.3% fee tier
   *   initialize_sqrt_price: "79228162514264337593543950336", // 1:1 price
   *   uri: "https://ferra.xyz/pool-metadata.json",
   *   amount_a: 10_000_000_000, // 10 SUI
   *   amount_b: 10_000_000,     // 10 COIN
   *   fix_amount_a: true,
   *   tick_lower: -600,  // Wide range
   *   tick_upper: 600,
   *   slippage: 0.05
   * });
   *
   * const result = await sdk.fullClient.signAndExecuteTransaction({
   *   transaction: tx,
   *   signer: keypair
   * });
   *
   * // Extract pool ID from events
   * const poolCreatedEvent = result.events?.find(
   *   e => e.type.includes('::PoolCreatedEvent')
   * );
   * const poolId = poolCreatedEvent?.parsedJson?.pool_id;
   */
  async creatPoolTransactionPayload(params: CreatePoolAddLiquidityParams): Promise<Transaction> {
    // Ensure coin types follow protocol ordering rules
    // Reference: https://ferra-1.gitbook.io/ferra-developer-docs/developer/via-sdk/features-available/create-damm-pool
    if (isSortedSymbols(normalizeSuiAddress(params.coinTypeA), normalizeSuiAddress(params.coinTypeB))) {
      const swpaCoinTypeB = params.coinTypeB
      params.coinTypeB = params.coinTypeA
      params.coinTypeA = swpaCoinTypeB

      const metadataB = params.metadata_b
      params.metadata_b = params.metadata_a
      params.metadata_a = metadataB
    }
    return await this.createPoolAndAddLiquidity(params)
  }

  /**
   * Creates a pool with initial liquidity position
   * Automatically sorts coin types according to protocol requirements
   * @param params - Pool creation and liquidity parameters
   * @returns Transaction object for pool creation and liquidity addition
   */
  async createPoolTransactionPayload(params: CreatePoolAddLiquidityParams): Promise<Transaction> {
    // Ensure coin types follow protocol ordering rules
    if (isSortedSymbols(normalizeSuiAddress(params.coinTypeA), normalizeSuiAddress(params.coinTypeB))) {
      const swpaCoinTypeB = params.coinTypeB
      params.coinTypeB = params.coinTypeA
      params.coinTypeA = swpaCoinTypeB
      const metadataB = params.metadata_b
      params.metadata_b = params.metadata_a
      params.metadata_a = metadataB
    }
    return await this.createPoolAndAddLiquidity(params)
  }

  /**
   * Gets DAMM global configuration including registry IDs and settings
   * Configuration is cached for performance
   * @param forceRefresh - Bypass cache and fetch fresh config
   * @returns Global DAMM configuration object
   * @example
   * const config = await sdk.Pool.getDammConfigs();
   * console.log(`Global config ID: ${config.global_config_id}`);
   * console.log(`Pools registry: ${config.pools_id}`);
   * console.log(`Rewarder vault: ${config.global_rewarder_vault_id}`);
   */
  async getDammConfigs(forceRefresh = false): Promise<DammConfig> {
    const { package_id } = this._sdk.sdkOptions.damm_pool
    const cacheKey = `${package_id}_getInitEvent`
    const cacheData = this.getCache<DammConfig>(cacheKey, forceRefresh)
    if (cacheData !== undefined) {
      return cacheData
    }
    const packageObject = await this._sdk.fullClient.getObject({
      id: package_id,
      options: { showPreviousTransaction: true },
    })

    const previousTx = getObjectPreviousTransactionDigest(packageObject) as string

    const objects = (await this._sdk.fullClient.queryEventsByPage({ Transaction: previousTx })).data

    const dammConfig: DammConfig = {
      pools_id: '',
      global_config_id: '',
      global_rewarder_vault_id: '',
    }

    if (objects.length > 0) {
      objects.forEach((item: any) => {
        const fields = item.parsedJson as any

        if (item.type) {
          switch (extractStructTagFromType(item.type).full_address) {
            case `${package_id}::config::InitConfigEvent`:
              dammConfig.global_config_id = fields.global_config_id
              break
            case `${package_id}::factory::InitFactoryEvent`:
              dammConfig.pools_id = fields.pools_id
              break
            case `${package_id}::rewarder::RewarderInitEvent`:
              dammConfig.global_rewarder_vault_id = fields.global_rewarder_vault_id
              break
            case `${package_id}::partner::InitPartnerEvent`:
              dammConfig.partners_id = fields.partners_id
              break
            default:
              break
          }
        }
      })
      this.updateCache(cacheKey, dammConfig, cacheTime24h)
      return dammConfig
    }

    return dammConfig
  }

  /**
   * Retrieves full transaction details including events and effects
   * Used for analyzing pool-related transactions
   * @param digest - Transaction digest to query
   * @param forceRefresh - Force cache refresh if true
   * @returns Complete transaction block response or null
   */
  async getSuiTransactionResponse(digest: string, forceRefresh = false): Promise<SuiTransactionBlockResponse | null> {
    const cacheKey = `${digest}_getSuiTransactionResponse`
    const cacheData = this.getCache<SuiTransactionBlockResponse>(cacheKey, forceRefresh)

    if (cacheData !== undefined) {
      return cacheData
    }
    let objects
    try {
      objects = (await this._sdk.fullClient.getTransactionBlock({
        digest,
        options: {
          showEvents: true,
          showEffects: true,
          showBalanceChanges: true,
          showInput: true,
          showObjectChanges: true,
        },
      })) as SuiTransactionBlockResponse
    } catch (error) {
      objects = (await this._sdk.fullClient.getTransactionBlock({
        digest,
        options: {
          showEvents: true,
          showEffects: true,
        },
      })) as SuiTransactionBlockResponse
    }

    this.updateCache(cacheKey, objects, cacheTime24h)
    return objects
  }

  /**
   * Gets transaction history for a specific pool
   * Returns swaps, adds/removes liquidity, fee collections
   * @param pool_id - Pool object ID
   * @param limit - Maximum transactions to return (default: 100)
   * @param offset - Starting offset for pagination
   * @returns Array of pool transaction info
   * @example
   * const txList = await sdk.Pool.getPoolTransactionList({
   *   pool_id: poolId,
   *   limit: 50,
   *   offset: 0
   * });
   *
   * txList.forEach(tx => {
   *   const type = tx.type.split('::').pop();
   *   console.log(`${type}: ${tx.tx}`);
   * });
   */
  async getPoolTransactionList({
    poolId,
    paginationArgs,
    order = 'descending',
    fullRpcUrl,
  }: {
    poolId: string
    fullRpcUrl?: string
    paginationArgs: PageQuery
    order?: 'ascending' | 'descending' | null | undefined
  }): Promise<DataPage<PoolTransactionInfo>> {
    const { fullClient, sdkOptions } = this._sdk
    let client
    if (fullRpcUrl) {
      client = new RpcModule({
        url: fullRpcUrl,
      })
    } else {
      client = fullClient
    }
    const data: DataPage<PoolTransactionInfo> = {
      data: [],
      hasNextPage: false,
    }

    const limit = 50
    const query = paginationArgs
    const userLimit = paginationArgs.limit || 10

    // Fetch transactions in batches until we reach user limit
    do {
      const res = await client.queryTransactionBlocksByPage({ ChangedObject: poolId }, { ...query, limit: 50 }, order)
      res.data.forEach((item, index) => {
        data.nextCursor = res.nextCursor
        const dataList = buildPoolTransactionInfo(item, index, sdkOptions.damm_pool.package_id, poolId)
        data.data = [...data.data, ...dataList]
      })
      data.hasNextPage = res.hasNextPage
      data.nextCursor = res.nextCursor
      query.cursor = res.nextCursor
    } while (data.data.length < userLimit && data.hasNextPage)

    // Trim results to user limit
    if (data.data.length > userLimit) {
      data.data = data.data.slice(0, userLimit)
      data.nextCursor = data.data[data.data.length - 1].tx
    }

    return data
  }

  /**
   * Internal method for creating pool with initial liquidity
   * Uses integrate contract to handle pool creation and liquidity in single transaction
   * @param params - Pool creation and liquidity parameters
   * @returns Transaction object
   */
  private async createPoolAndAddLiquidity(params: CreatePoolAddLiquidityParams): Promise<Transaction> {
    if (!checkValidSuiAddress(this.sdk.senderAddress)) {
      throw new DammpoolsError(
        'Invalid sender address: ferra damm sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }

    params.tick_lower ??= -443636
    params.tick_upper ??= 443636

    const tx = new Transaction()
    tx.setSender(this.sdk.senderAddress)
    const { integrate, damm_pool } = this.sdk.sdkOptions
    // Build coin inputs from user's balance
    const allCoinAsset = await this._sdk.getOwnerCoinAssets(this.sdk.senderAddress)
    const primaryCoinAInputsR = TransactionUtil.buildCoinForAmount(tx, allCoinAsset, BigInt(params.amount_a), params.coinTypeA, false, true)
    const primaryCoinBInputsR = TransactionUtil.buildCoinForAmount(tx, allCoinAsset, BigInt(params.amount_b), params.coinTypeB, false, true)

    const args = [
      tx.object(damm_pool.config.global_config_id),
      tx.object(damm_pool.config.pools_id),
      tx.pure.u32(params.tick_spacing),
      tx.pure.u128(params.initialize_sqrt_price),
      tx.pure.string(params.uri),
      tx.pure.u32(Number(asUintN(BigInt(params.tick_lower)).toString())),
      tx.pure.u32(Number(asUintN(BigInt(params.tick_upper)).toString())),
      primaryCoinAInputsR.targetCoin,
      primaryCoinBInputsR.targetCoin,
      tx.pure.bool(params.fix_amount_a),
      tx.pure.u8(params.collect_fee_mode),
      tx.pure.bool(params.is_quote_y),
      tx.pure.u8(params.fee_scheduler_mode),
      tx.pure.bool(params.enable_fee_scheduler),
      tx.pure.bool(params.enable_dynamic_fee),
      tx.pure.u64(params.activation_timestamp),
      tx.object(CLOCK_ADDRESS),
    ]

    tx.moveCall({
      target: `${integrate.published_at}::${DammIntegratePoolModule}::create_pool`,
      typeArguments: [params.coinTypeA, params.coinTypeB],
      arguments: args,
    })

    // Return remaining coins to sender
    TransactionUtil.buildTransferCoinToSender(this._sdk, tx, primaryCoinAInputsR.targetCoin, params.coinTypeA)
    TransactionUtil.buildTransferCoinToSender(this._sdk, tx, primaryCoinBInputsR.targetCoin, params.coinTypeB)

    return tx
  }

  /**
   * Fetches all initialized ticks for a pool from on-chain events
   * More comprehensive but slower than fetchTicksByRpc
   * Use this when you need complete tick history including deleted ticks
   * @param params - Fetch parameters with pool ID
   * @returns Array of all tick data from pool history
   * @example
   * const ticks = await sdk.Pool.fetchTicks({ pool_id: poolId });
   * console.log(`Total ticks: ${ticks.length}`);
   *
   * // Find ticks in specific range
   * const ticksInRange = ticks.filter(
   *   t => t.index >= -120 && t.index <= 120
   * );
   */
  async fetchTicks(params: FetchParams): Promise<TickData[]> {
    let ticks: TickData[] = []
    let start: number[] = []
    const limit = 512

    // Fetch ticks in batches
    while (true) {
      const data = await this.getTicks({
        pool_id: params.pool_id,
        coinTypeA: params.coinTypeA,
        coinTypeB: params.coinTypeB,
        start,
        limit,
      })
      ticks = [...ticks, ...data]
      if (data.length < limit) {
        break
      }
      start = [Number(asUintN(BigInt(data[data.length - 1].index)))]
    }
    return ticks
  }

  /**
   * Internal method to fetch tick data using simulated transaction
   * Uses devInspectTransactionBlock for gas-free tick data retrieval
   * @param params - Tick fetch parameters including start indices and limit
   * @returns Array of tick data
   */
  private async getTicks(params: GetTickParams): Promise<TickData[]> {
    const { integrate, simulationAccount } = this.sdk.sdkOptions
    const ticks: TickData[] = []
    const typeArguments = [params.coinTypeA, params.coinTypeB]

    const tx = new Transaction()

    const start = tx.makeMoveVec({
      elements: params.start.map((index) => tx.pure.u32(index)),
      type: 'u32',
    })

    const args = [tx.object(params.pool_id), start, tx.pure.u64(params.limit.toString())]

    tx.moveCall({
      target: `${integrate.published_at}::${DammFetcherModule}::fetch_ticks`,
      arguments: args,
      typeArguments,
    })

    if (!checkValidSuiAddress(simulationAccount.address)) {
      throw new DammpoolsError(
        'Invalid simulation account: Configuration requires a valid Sui address. Please check your SDK configuration.',
        ConfigErrorCode.InvalidSimulateAccount
      )
    }

    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

    if (simulateRes.error != null) {
      throw new DammpoolsError(
        `getTicks error code: ${simulateRes.error ?? 'unknown error'}, please check config and tick object ids`,
        PoolErrorCode.InvalidTickObjectId
      )
    }

    simulateRes.events?.forEach((item: any) => {
      if (extractStructTagFromType(item.type).name === `FetchTicksResultEvent`) {
        item.parsedJson.ticks.forEach((tick: any) => {
          ticks.push(buildTickDataByEvent(tick))
        })
      }
    })
    return ticks
  }

  /**
   * Fetches position rewards from events for multiple positions
   * Useful for displaying historical reward claims
   * @param params - Fetch parameters with pool ID
   * @returns Array of position reward data
   * @example
   * const rewards = await sdk.Pool.fetchPositionRewardList({
   *   pool_id: poolId
   * });
   *
   * rewards.forEach(reward => {
   *   console.log(`Position: ${reward.pos_object_id}`);
   *   console.log(`Reward 0: ${reward.reward_amount_owed_0}`);
   *   console.log(`Reward 1: ${reward.reward_amount_owed_1}`);
   *   console.log(`Reward 2: ${reward.reward_amount_owed_2}`);
   * });
   */

  async fetchPositionRewardList(params: FetchParams): Promise<PositionReward[]> {
    const { integrate, simulationAccount } = this.sdk.sdkOptions
    const allPosition: PositionReward[] = []
    let start: SuiObjectIdType[] = []
    const limit = 512

    // Fetch position rewards in batches
    while (true) {
      const typeArguments = [params.coinTypeA, params.coinTypeB]

      const tx = new Transaction()

      const vecStart = tx.makeMoveVec({
        elements: start.map((id) => tx.pure.address(id)),
        type: '0x2::object::ID',
      })
      const args = [tx.object(params.pool_id), vecStart, tx.pure.u64(limit)]

      tx.moveCall({
        target: `${integrate.published_at}::${DammFetcherModule}::fetch_positions`,
        arguments: args,
        typeArguments,
      })

      if (!checkValidSuiAddress(simulationAccount.address)) {
        throw new DammpoolsError('this config simulationAccount is not set right', ConfigErrorCode.InvalidSimulateAccount)
      }
      const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
        transactionBlock: tx,
        sender: simulationAccount.address,
      })

      if (simulateRes.error != null) {
        throw new DammpoolsError(
          `fetch position reward error code: ${simulateRes.error ?? 'unknown error'}, please check config and tick object ids`,
          PositionErrorCode.InvalidPositionRewardObject
        )
      }

      const positionRewards: PositionReward[] = []
      simulateRes?.events?.forEach((item: any) => {
        if (extractStructTagFromType(item.type).name === `FetchPositionsEvent`) {
          item.parsedJson.positions.forEach((item: any) => {
            const positionReward = buildPositionReward(item)
            positionRewards.push(positionReward)
          })
        }
      })

      allPosition.push(...positionRewards)

      if (positionRewards.length < limit) {
        break
      } else {
        start = [positionRewards[positionRewards.length - 1].pos_object_id]
      }
    }

    return allPosition
  }

  /**
   * Fetches current tick state directly from pool's tick manager (RPC)
   * Faster than event-based fetch, returns only currently active ticks
   * Recommended for most use cases
   * @param tickHandle - Tick manager handle ID from pool object
   * @returns Array of currently active tick data
   * @example
   * const pool = await sdk.Pool.getPool(poolId);
   * const ticks = await sdk.Pool.fetchTicksByRpc(pool.ticksHandle);
   *
   * // Sort ticks by index for swap simulation
   * ticks.sort((a, b) => a.index - b.index);
   *
   * // Find nearest tick below current
   * const nearestBelow = ticks
   *   .filter(t => t.index < pool.currentTickIndex)
   *   .sort((a, b) => b.index - a.index)[0];
   */
  async fetchTicksByRpc(tickHandle: string): Promise<TickData[]> {
    let allTickData: TickData[] = []
    let nextCursor: string | null = null
    const limit = 50

    // Paginate through all tick dynamic fields
    while (true) {
      const allTickId: SuiObjectIdType[] = []
      const idRes: DynamicFieldPage = await this.sdk.fullClient.getDynamicFields({
        parentId: tickHandle,
        cursor: nextCursor,
        limit,
      })
      nextCursor = idRes.nextCursor
      idRes.data.forEach((item) => {
        if (extractStructTagFromType(item.objectType).module === 'skip_list') {
          allTickId.push(item.objectId)
        }
      })

      allTickData = [...allTickData, ...(await this.getTicksByRpc(allTickId))]

      if (!idRes.hasNextPage) {
        break
      }
    }

    return allTickData
  }

  /**
   * Internal method to fetch tick objects by their IDs
   * @param tickObjectId - Array of tick object IDs
   * @returns Array of tick data
   */
  private async getTicksByRpc(tickObjectId: string[]): Promise<TickData[]> {
    const ticks: TickData[] = []
    const objectDataResponses = await this.sdk.fullClient.batchGetObjects(tickObjectId, { showContent: true, showType: true })
    for (const suiObj of objectDataResponses) {
      if (suiObj.error != null || suiObj.data?.content?.dataType !== 'moveObject') {
        throw new DammpoolsError(
          `getTicksByRpc error code: ${suiObj.error?.code ?? 'unknown error'}, please check config and tick object ids`,
          PoolErrorCode.InvalidTickObjectId
        )
      }

      const tick = buildTickData(suiObj)
      if (tick != null) {
        ticks.push(tick)
      }
    }
    return ticks
  }

  /**
   * Gets tick data for a specific tick index
   * Returns null if tick is not initialized
   * @param tickHandle - Tick manager handle ID
   * @param tickIndex - Specific tick index to fetch
   * @returns Tick data or throws if tick doesn't exist
   * @throws {DammpoolsError} If tick is not initialized
   * @example
   * const pool = await sdk.Pool.getPool(poolId);
   *
   * try {
   *   const tick = await sdk.Pool.getTickDataByIndex(
   *     pool.ticksHandle,
   *     -120
   *   );
   *   console.log(`Liquidity at tick -120: ${tick.liquidityGross.toString()}`);
   * } catch (error) {
   *   console.log('Tick -120 is not initialized');
   * }
   */
  async getTickDataByIndex(tickHandle: string, tickIndex: number): Promise<TickData> {
    const name = { type: 'u64', value: asUintN(BigInt(tickScore(tickIndex).toString())).toString() }
    const res = await this.sdk.fullClient.getDynamicFieldObject({
      parentId: tickHandle,
      name,
    })

    if (res.error != null || res.data?.content?.dataType !== 'moveObject') {
      throw new DammpoolsError(`get tick by index: ${tickIndex} error: ${res.error}`, PoolErrorCode.InvalidTickIndex)
    }

    return buildTickData(res)
  }

  /**
   * Retrieves tick data by its object ID
   * Direct object fetch for known tick IDs
   * @param tickId - Tick object ID
   * @returns Tick data or null if not found
   */
  async getTickDataByObjectId(tickId: string): Promise<TickData | null> {
    const res = await this.sdk.fullClient.getObject({
      id: tickId,
      options: { showContent: true },
    })

    if (res.error != null || res.data?.content?.dataType !== 'moveObject') {
      throw new DammpoolsError(
        `getTicksByRpc error code: ${res.error?.code ?? 'unknown error'}, please check config and tick object ids`,
        PoolErrorCode.InvalidTickObjectId
      )
    }
    return buildTickData(res)
  }

  /**
   * Retrieves referral fee balances for a partner
   * @param partner - Partner object ID
   * @param showDisplay - Include display metadata
   * @returns Array of coin assets with balances
   */
  async getPartnerRefFeeAmount(partner: string, showDisplay = true): Promise<CoinAsset[]> {
    const objectDataResponses = await this._sdk.fullClient.batchGetObjects([partner], {
      showOwner: true,
      showContent: true,
      showDisplay,
      showType: true,
    })

    if (objectDataResponses[0].data?.content?.dataType !== 'moveObject') {
      throw new DammpoolsError(
        `get partner by object id: ${partner} error: ${objectDataResponses[0].error}`,
        PartnerErrorCode.NotFoundPartnerObject
      )
    }

    const balance = (objectDataResponses[0].data.content.fields as any).balances

    const objects = await this._sdk.fullClient.getDynamicFieldsByPage(balance.fields.id.id)

    const coins: string[] = []
    objects.data.forEach((object) => {
      if (object.objectId != null) {
        coins.push(object.objectId)
      }
    })

    const refFee: CoinAsset[] = []
    const object = await this._sdk.fullClient.batchGetObjects(coins, {
      showOwner: true,
      showContent: true,
      showDisplay,
      showType: true,
    })
    object.forEach((info: any) => {
      if (info.error != null || info.data?.content?.dataType !== 'moveObject') {
        throw new DammpoolsError(
          `get coin by object id: ${info.data.objectId} error: ${info.error}`,
          PartnerErrorCode.InvalidParnterRefFeeFields
        )
      }

      const coinAsset: CoinAsset = {
        coinAddress: info.data.content.fields.name,
        coinObjectId: info.data.objectId,
        balance: BigInt(info.data.content.fields.value),
      }
      refFee.push(coinAsset)
    })

    return refFee
  }

  /**
   * Claims partner referral fees accumulated for a partner
   * Requires partner capability NFT
   * @param partnerCap - Partner capability object ID
   * @param partner - Partner address
   * @param coinType - Type of coin to claim fees in
   * @returns Transaction for claiming partner fees
   * @throws {DammpoolsError} If partner not found or invalid (PartnerErrorCode.NotFoundPartnerObject)
   * @example
   * const tx = await sdk.Pool.claimPartnerRefFeePayload(
   *   '0x_partner_cap_id',
   *   '0x_partner_address',
   *   '0x2::sui::SUI'
   * );
   *
   * const result = await sdk.fullClient.signAndExecuteTransaction({
   *   transaction: tx,
   *   signer: partnerKeypair
   * });
   */
  async claimPartnerRefFeePayload(partnerCap: string, partner: string, coinType: string): Promise<Transaction> {
    const tx = new Transaction()
    const { damm_pool } = this.sdk.sdkOptions
    const { global_config_id } = getPackagerConfigs(damm_pool)
    const typeArguments = [coinType]

    const args = [tx.object(global_config_id), tx.object(partnerCap), tx.object(partner)]

    tx.moveCall({
      target: `${damm_pool.published_at}::${DammPartnerModule}::claim_ref_fee`,
      arguments: args,
      typeArguments,
    })

    return tx
  }

  /**
   * Updates cached data with expiration time
   * @param key - Cache key
   * @param data - Data to cache
   * @param time - Cache duration in minutes (default: 5)
   */
  updateCache(key: string, data: SuiResource, time = cacheTime5min) {
    let cacheData = this._cache[key]
    if (cacheData) {
      cacheData.overdueTime = getFutureTime(time)
      cacheData.value = data
    } else {
      cacheData = new CachedContent(data, getFutureTime(time))
    }
    this._cache[key] = cacheData
  }

  /**
   * Retrieves cached data if valid
   * @param key - Cache key
   * @param forceRefresh - Bypass cache if true
   * @returns Cached data or undefined if expired/not found
   */
  getCache<T>(key: string, forceRefresh = false): T | undefined {
    const cacheData = this._cache[key]
    const isValid = cacheData?.isValid()
    if (!forceRefresh && isValid) {
      return cacheData.value as T
    }
    if (!isValid) {
      delete this._cache[key]
    }
    return undefined
  }
}
