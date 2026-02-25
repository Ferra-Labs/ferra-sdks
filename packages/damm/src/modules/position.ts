import BN from 'bn.js'
import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions'
import { isValidSuiObjectId, normalizeStructTag } from '@mysten/sui/utils'
import {
  AddLiquidityFixTokenParams,
  AddLiquidityParams,
  ClosePositionParams,
  CollectFeeParams,
  OpenPositionParams,
  Pool,
  Position,
  PositionReward,
  PositionTransactionInfo,
  RemoveLiquidityParams,
  getPackagerConfigs,
} from '../types'
import {
  CachedContent,
  asUintN,
  buildPosition,
  buildPositionReward,
  buildPositionTransactionInfo,
  cacheTime24h,
  cacheTime5min,
  checkValidSuiAddress,
  extractStructTagFromType,
  getFutureTime,
} from '../utils'
import { BuildCoinResult, findAdjustCoin, TransactionUtil } from '../utils/transaction-util'
import {
  DammFetcherModule,
  DammIntegratePoolModule,
  CLOCK_ADDRESS,
  DataPage,
  PaginationArgs,
  SuiObjectIdType,
  SuiResource,
} from '../types/sui'
import { FerraDammSDK } from '../sdk'
import { IModule } from '../interfaces/IModule'
import { getObjectFields } from '../utils/objects'
import { CollectFeesQuote } from '../math'
import { FetchPosFeeParams } from './rewarder'
import { DammpoolsError, ConfigErrorCode, PoolErrorCode, UtilsErrorCode } from '../errors/errors'
import { RpcModule } from './rpc'
import { bcs } from '@mysten/bcs'

/**
 * Position module for managing liquidity positions in DAMM pools
 * Handles position creation, liquidity adjustments, fee collection, and rewards
 * Positions are represented as NFTs that can be transferred or locked
 *
 * @example
 * // Get all positions for a wallet
 * const positions = await sdk.Position.getPositionList(
 *   '0x_wallet_address',
 *   [] // All pools
 * );
 *
 * positions.forEach(pos => {
 *   console.log(`Position ${pos.pos_object_id}`);
 *   console.log(`Pool: ${pos.pool}`);
 *   console.log(`Liquidity: ${pos.liquidity}`);
 *   console.log(`Range: [${pos.tick_lower_index}, ${pos.tick_upper_index}]`);
 * });
 *
 * @example
 * // Add liquidity to existing position
 * const addLiqTx = await sdk.Position.createAddLiquidityPayload({
 *   pool_id: poolId,
 *   pos_id: positionId,
 *   coinTypeA: "0x2::sui::SUI",
 *   coinTypeB: "0x5d4b...::coin::COIN",
 *   delta_liquidity: "1000000000",
 *   max_amount_a: "1100000000",  // 10% slippage
 *   max_amount_b: "1100000"
 * });
 *
 * @example
 * // Collect fees from position
 * const pool = await sdk.Pool.getPool(poolId);
 * const collectTx = await sdk.Position.collectFeeTransactionPayload({
 *   pool,
 *   pos_id: positionId,
 *   coinTypeA: pool.coinTypeA,
 *   coinTypeB: pool.coinTypeB
 * });
 */
export class PositionModule implements IModule {
  protected _sdk: FerraDammSDK
  private readonly _cache: Record<string, CachedContent> = {}

  constructor(sdk: FerraDammSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  /**
   * Constructs the full type address for Position objects
   * @returns Full type string in format: packageId::module::type
   */
  buildPositionType() {
    const ferraDamm = this._sdk.sdkOptions.damm_pool.package_id
    return `${ferraDamm}::position::Position`
  }

 /**
 * Gets transaction history for specific positions
 * Returns liquidity changes, fee collections, reward claims
 * @param account - Wallet address that owns positions
 * @param positionIds - Array of position NFT IDs
 * @param limit - Max transactions to return (default: 100)
 * @param offset - Starting offset for pagination
 * @returns Array of position transaction info
 * @example
 * const txList = await sdk.Position.getPositionTransactionList({
 *   account: walletAddress,
 *   positionIds: [posId1, posId2],
 *   limit: 50
 * });
 * 
 * txList.forEach(tx => {
 *   console.log(`${tx.type}: ${tx.txDigest}`);
 *   console.log(`  Timestamp: ${new Date(Number(tx.timestampMs))}`);
 * });
 */
  async getPositionTransactionList({
    posId,
    paginationArgs = 'all',
    order = 'ascending',
    fullRpcUrl,
    originPosId,
  }: {
    posId: string
    originPosId?: string
    fullRpcUrl?: string
    paginationArgs?: PaginationArgs
    order?: 'ascending' | 'descending' | null | undefined
  }): Promise<DataPage<PositionTransactionInfo>> {
    const { fullClient } = this._sdk
    const filterIds: string[] = [posId]
    if (originPosId) {
      filterIds.push(originPosId)
    }

    // Use custom RPC client if provided
    let client
    if (fullRpcUrl) {
      client = new RpcModule({
        url: fullRpcUrl,
      })
    } else {
      client = fullClient
    }

    const data: DataPage<PositionTransactionInfo> = {
      data: [],
      hasNextPage: false,
    }

    try {
      const res = await client.queryTransactionBlocksByPage({ ChangedObject: posId }, paginationArgs, order)

      res.data.forEach((item, index) => {
        const dataList = buildPositionTransactionInfo(item, index, filterIds)
        data.data = [...data.data, ...dataList]
      })
      data.hasNextPage = res.hasNextPage
      data.nextCursor = res.nextCursor
      return data
    } catch (error) {
      console.log('Error in getPositionTransactionList:', error)
    }

    return data
  }

  /**
   * Gets all positions owned by a specific wallet address
   * Optionally filters by pool IDs
   * @param accountAddress - Wallet address to query positions for
   * @param assignPoolIds - Filter by specific pool IDs (empty = all pools)
   * @param showDisplay - Include NFT display metadata (default: true)
   * @returns Array of position objects owned by the account
   * @example
   * // Get all positions
   * const allPositions = await sdk.Position.getPositionList(
   *   '0x_wallet_address'
   * );
   *
   * // Get positions for specific pools only
   * const filteredPositions = await sdk.Position.getPositionList(
   *   '0x_wallet_address',
   *   ['0x_pool1', '0x_pool2']
   * );
   *
   * // Check position status
   * filteredPositions.forEach(pos => {
   *   const pool = await sdk.Pool.getPool(pos.pool);
   *   const status = PositionUtil.getPositionStatus(
   *     pool.currentTickIndex,
   *     pos.tick_lower_index,
   *     pos.tick_upper_index
   *   );
   *   console.log(`Position ${pos.pos_object_id}: ${status}`);
   * });
   */
  async getPositionList(accountAddress: string, assignPoolIds: string[] = [], showDisplay = true): Promise<Position[]> {
    const allPosition: Position[] = []

    const ownerRes: any = await this._sdk.fullClient.getOwnedObjectsByPage(accountAddress, {
      options: { showType: true, showContent: true, showDisplay, showOwner: true },
      filter: { Package: this._sdk.sdkOptions.damm_pool.package_id },
    })

    const hasAssignPoolIds = assignPoolIds.length > 0
    for (const item of ownerRes.data as any[]) {
      const type = extractStructTagFromType(item.data.type)

      if (type.full_address === this.buildPositionType()) {
        const position = buildPosition(item)
        const cacheKey = `${position.pos_object_id}_getPositionList`
        this.updateCache(cacheKey, position, cacheTime24h)

        // Filter by pool IDs if specified
        if (hasAssignPoolIds) {
          if (assignPoolIds.includes(position.pool)) {
            allPosition.push(position)
          }
        } else {
          allPosition.push(position)
        }
      }
    }

    return allPosition
  }

  /**
   * Retrieves position data using position handle (requires pool info)
   * Note: getPositionById is recommended for direct position retrieval
   * @param positionHandle - Position collection handle from pool
   * @param positionID - Position object ID
   * @param calculateRewarder - Calculate reward amounts (default: true)
   * @param showDisplay - Include display metadata (default: true)
   * @returns Complete position object with optional rewards
   */
  async getPosition(positionHandle: string, positionID: string, calculateRewarder = true, showDisplay = true): Promise<Position> {
    let position = await this.getSimplePosition(positionID, showDisplay)
    if (calculateRewarder) {
      position = await this.updatePositionRewarders(positionHandle, position)
    }
    return position
  }

  /**
   * Gets complete position data by position ID
   * This is the recommended method - simpler than getPosition()
   * @param positionID - Position NFT object ID
   * @param calculateRewarder - Calculate pending rewards (default: true)
   * @param showDisplay - Include NFT metadata (default: true)
   * @returns Complete position object
   * @throws {DammpoolsError} If position doesn't exist
   * @example
   * const position = await sdk.Position.getPositionById(
   *   '0x_position_id',
   *   true  // Calculate rewards
   * );
   *
   * console.log(`Liquidity: ${position.liquidity}`);
   * console.log(`Fee owed A: ${position.fee_owed_a}`);
   * console.log(`Fee owed B: ${position.fee_owed_b}`);
   * console.log(`Reward 0: ${position.reward_amount_owed_0}`);
   */
  async getPositionById(positionID: string, calculateRewarder = true, showDisplay = true): Promise<Position> {
    const position = await this.getSimplePosition(positionID, showDisplay)
    if (calculateRewarder) {
      const pool = await this._sdk.Pool.getPool(position.pool, false)
      const result = await this.updatePositionRewarders(pool.positionManager.positionsHandle, position)
      return result
    }
    return position
  }

  /**
   * Gets basic position data without reward calculations
   * Faster than getPositionById when rewards not needed
   * @param positionID - Position NFT object ID
   * @param showDisplay - Include NFT metadata (default: true)
   * @returns Position object without reward amounts
   * @example
   * // Quick position check
   * const position = await sdk.Position.getSimplePosition(positionId);
   * console.log(`Range: [${position.tick_lower_index}, ${position.tick_upper_index}]`);
   * console.log(`In pool: ${position.pool}`);
   */
  async getSimplePosition(positionID: string, showDisplay = true): Promise<Position> {
    const cacheKey = `${positionID}_getPositionList`

    let position = this.getSimplePositionByCache(positionID)

    if (position === undefined) {
      const objectDataResponses = await this.sdk.fullClient.getObject({
        id: positionID,
        options: { showContent: true, showType: true, showDisplay, showOwner: true },
      })
      position = buildPosition(objectDataResponses)

      this.updateCache(cacheKey, position, cacheTime24h)
    }
    return position
  }

  /**
   * Internal method to retrieve cached position data
   * @param positionID - Position object ID
   * @returns Cached position or undefined if not found/expired
   */
  private getSimplePositionByCache(positionID: string): Position | undefined {
    const cacheKey = `${positionID}_getPositionList`
    return this.getCache<Position>(cacheKey)
  }

  /**
   * Batch fetches simple position data for multiple positions
   * More efficient than calling getSimplePosition multiple times
   * @param positionIDs - Array of position NFT IDs
   * @param showDisplay - Include NFT metadata (default: true)
   * @returns Array of position objects
   * @example
   * const positions = await sdk.Position.getSipmlePositionList([
   *   '0x_pos1',
   *   '0x_pos2',
   *   '0x_pos3'
   * ]);
   *
   * // Quick overview
   * positions.forEach(pos => {
   *   console.log(`${pos.pos_object_id}: ${pos.liquidity} liquidity`);
   * });
   */
  async getSipmlePositionList(positionIDs: SuiObjectIdType[], showDisplay = true): Promise<Position[]> {
    const positionList: Position[] = []
    const notFoundIds: SuiObjectIdType[] = []

    // Check cache first
    positionIDs.forEach((id) => {
      const position = this.getSimplePositionByCache(id)
      if (position) {
        positionList.push(position)
      } else {
        notFoundIds.push(id)
      }
    })

    // Batch fetch positions not in cache
    if (notFoundIds.length > 0) {
      const objectDataResponses = await this._sdk.fullClient.batchGetObjects(notFoundIds, {
        showOwner: true,
        showContent: true,
        showDisplay,
        showType: true,
      })

      objectDataResponses.forEach((info) => {
        if (info.error == null) {
          const position = buildPosition(info)
          positionList.push(position)
          const cacheKey = `${position.pos_object_id}_getPositionList`
          this.updateCache(cacheKey, position, cacheTime24h)
        }
      })
    }

    return positionList
  }

  /**
   * Internal method to update position with reward information
   * @param positionHandle - Position collection handle
   * @param position - Position object to update
   * @returns Position object with reward data
   */
  private async updatePositionRewarders(positionHandle: string, position: Position): Promise<Position> {
    const positionReward = await this.getPositionRewarders(positionHandle, position.pos_object_id)
    return {
      ...position,
      ...positionReward,
    }
  }

  /**
   * Retrieves reward information for a specific position
   * @param positionHandle - Position collection handle
   * @param positionID - Position object ID
   * @returns Position reward data or undefined if not found
   */
  async getPositionRewarders(positionHandle: string, positionID: string): Promise<PositionReward | undefined> {
    try {
      const dynamicFieldObject = await this._sdk.fullClient.getDynamicFieldObject({
        parentId: positionHandle,
        name: {
          type: '0x2::object::ID',
          value: positionID,
        },
      })

      const objectFields = getObjectFields(dynamicFieldObject.data as any) as any
      const fields = objectFields.value.fields.value
      const positionReward = buildPositionReward(fields)
      return positionReward
    } catch (error) {
      console.log(error)
      return undefined
    }
  }

  /**
   * Calculates pending fees for multiple positions
   * Uses on-chain simulation for accurate calculations
   * @param params - Array of position and pool parameters
   * @returns Array of fee quotes (amounts owed)
   * @example
   * const fees = await sdk.Position.fetchPosFeeAmount([
   *   {
   *     pool_id: poolId1,
   *     pos_id: posId1,
   *     coinTypeA: "0x2::sui::SUI",
   *     coinTypeB: "0x5d4b...::coin::COIN"
   *   },
   *   {
   *     pool_id: poolId2,
   *     pos_id: posId2,
   *     coinTypeA: "0x2::sui::SUI",
   *     coinTypeB: "0x456::usdc::USDC"
   *   }
   * ]);
   *
   * fees.forEach(fee => {
   *   console.log(`Position: ${fee.position_id}`);
   *   console.log(`Fee A: ${fee.feeOwedA.toString()}`);
   *   console.log(`Fee B: ${fee.feeOwedB.toString()}`);
   * });
   */
  public async fetchPosFeeAmount(params: FetchPosFeeParams[]): Promise<CollectFeesQuote[]> {
    const { damm_pool, integrate, simulationAccount } = this.sdk.sdkOptions
    const tx = new Transaction()

    // Build simulation transaction for all positions
    for (const paramItem of params) {
      const typeArguments = [paramItem.coinTypeA, paramItem.coinTypeB]
      const args = [
        tx.object(getPackagerConfigs(damm_pool).global_config_id),
        tx.object(paramItem.poolAddress),
        tx.pure.address(paramItem.positionId),
      ]
      tx.moveCall({
        target: `${integrate.published_at}::${DammFetcherModule}::fetch_position_fees`,
        arguments: args,
        typeArguments,
      })
    }

    if (!checkValidSuiAddress(simulationAccount.address)) {
      throw new DammpoolsError('this config simulationAccount is not set right', ConfigErrorCode.InvalidSimulateAccount)
    }

    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

    if (simulateRes.error != null) {
      throw new DammpoolsError(
        `fetch position fee error code: ${simulateRes.error ?? 'unknown error'}, please check config and postion and pool object ids`,
        PoolErrorCode.InvalidPoolObject
      )
    }

    // Extract fee data from simulation events
    const valueData: any = simulateRes.events?.filter((item: any) => {
      return extractStructTagFromType(item.type).name === `FetchPositionFeesEvent`
    })
    if (valueData.length === 0) {
      return []
    }

    const result: CollectFeesQuote[] = []

    for (let i = 0; i < valueData.length; i += 1) {
      const { parsedJson } = valueData[i]
      const posRrewarderResult: CollectFeesQuote = {
        feeOwedA: new BN(parsedJson.fee_owned_a),
        feeOwedB: new BN(parsedJson.fee_owned_b),
        position_id: parsedJson.position_id,
      }
      result.push(posRrewarderResult)
    }

    return result
  }

  /**
   * Batch fetches pending fees for multiple positions by ID
   * Convenient wrapper around fetchPosFeeAmount
   * @param positionIDs - Array of position NFT IDs
   * @returns Map of position ID to fee quote
   * @example
   * const feeMap = await sdk.Position.batchFetchPositionFees([
   *   '0x_pos1',
   *   '0x_pos2'
   * ]);
   *
   * for (const [posId, fees] of Object.entries(feeMap)) {
   *   console.log(`Position ${posId}:`);
   *   console.log(`  Fee A: ${fees.feeOwedA.toString()}`);
   *   console.log(`  Fee B: ${fees.feeOwedB.toString()}`);
   * }
   */
  async batchFetchPositionFees(positionIDs: string[]): Promise<Record<string, CollectFeesQuote>> {
    const posFeeParamsList: FetchPosFeeParams[] = []

    // Prepare parameters for each position
    for (const id of positionIDs) {
      const position = await this._sdk.Position.getPositionById(id, false)
      const pool = await this._sdk.Pool.getPool(position.pool, false)
      posFeeParamsList.push({
        poolAddress: pool.poolAddress,
        positionId: position.pos_object_id,
        coinTypeA: pool.coinTypeA,
        coinTypeB: pool.coinTypeB,
      })
    }

    const positionMap: Record<string, CollectFeesQuote> = {}

    if (posFeeParamsList.length > 0) {
      const result: CollectFeesQuote[] = await this.fetchPosFeeAmount(posFeeParamsList)
      for (const posRewarderInfo of result) {
        positionMap[posRewarderInfo.position_id] = posRewarderInfo
      }
      return positionMap
    }
    return positionMap
  }

  /**
   * Creates a transaction to add liquidity with fixed token amounts
   * Useful when you want to specify exact amounts rather than liquidity delta
   * @param params - Parameters including amounts and slippage tolerance
   * @returns Transaction for adding liquidity
   * @example
   * const tx = await sdk.Position.createAddLiquidityFixTokenPayload({
   *   coinTypeA: "0x2::sui::SUI",
   *   coinTypeB: "0x5d4b...::coin::COIN",
   *   pool_id: poolId,
   *   pos_id: positionId,
   *   amount_a: 1000000000,  // 1 SUI
   *   amount_b: 5000000,     // 5 COIN
   *   fix_amount_a: true,    // Fix SUI, adjust COIN
   *   slippage: 0.05,        // 5% slippage
   *   tick_lower: -120,
   *   tick_upper: 120,
   *   collect_fee: true      // Auto-collect fees before adding
   * });
   */
  async createAddLiquidityFixTokenPayload(
    params: AddLiquidityFixTokenParams,
    gasEstimateArg?: {
      slippage: number
      curSqrtPrice: BN
    },
    tx?: Transaction,
    inputCoinA?: TransactionObjectArgument,
    inputCoinB?: TransactionObjectArgument
  ): Promise<Transaction> {
    if (!checkValidSuiAddress(this.sdk.senderAddress)) {
      throw new DammpoolsError(
        'Invalid sender address: ferra damm sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }
    const allCoinAsset = await this._sdk.getOwnerCoinAssets(this.sdk.senderAddress)

    // Handle gas estimation for SUI token
    if (gasEstimateArg) {
      const { isAdjustCoinA, isAdjustCoinB } = findAdjustCoin(params)
      params = params as AddLiquidityFixTokenParams
      if ((params.fix_amount_a && isAdjustCoinA) || (!params.fix_amount_a && isAdjustCoinB)) {
        tx = await TransactionUtil.buildAddLiquidityFixTokenForGas(
          this._sdk,
          allCoinAsset,
          params,
          gasEstimateArg,
          tx,
          inputCoinA,
          inputCoinB
        )
        return tx
      }
    }

    return TransactionUtil.buildAddLiquidityFixToken(this._sdk, allCoinAsset, params, tx, inputCoinA, inputCoinB)
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
    const { global_rewarder_vault_id } = config.damm_pool.config ?? {}
    if (!global_rewarder_vault_id) {
      throw new Error('Rewarder vault id not found from config')
    }

    const vault = await client.getObject({
      id: global_rewarder_vault_id,
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
   * Creates a transaction to add liquidity with exact liquidity delta
   * Preferred method when you know the exact liquidity amount to add
   * @param params - Parameters including liquidity delta and amount limits
   * @returns Transaction for adding liquidity
   * @example
   * const tx = await sdk.Position.createAddLiquidityPayload({
   *   pool_id: poolId,
   *   pos_id: positionId,
   *   coinTypeA: "0x2::sui::SUI",
   *   coinTypeB: "0x5d4b...::coin::COIN",
   *   delta_liquidity: "1000000000",
   *   max_amount_a: "1100000000",  // Max SUI to spend
   *   max_amount_b: "1100000"      // Max COIN to spend
   * });
   */
  async createAddLiquidityPayload(
    params: AddLiquidityParams,
    tx?: Transaction,
    inputCoinA?: TransactionObjectArgument,
    inputCoinB?: TransactionObjectArgument
  ): Promise<Transaction> {
    const { integrate, damm_pool } = this._sdk.sdkOptions
    if (!checkValidSuiAddress(this.sdk.senderAddress)) {
      throw new DammpoolsError(
        'Invalid sender address: ferra damm sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }

    // Convert tick indices to unsigned format
    const tick_lower = asUintN(BigInt(params.tick_lower)).toString()
    const tick_upper = asUintN(BigInt(params.tick_upper)).toString()

    const typeArguments = [params.coinTypeA, params.coinTypeB]

    tx = tx || new Transaction()

    const needOpenPosition = !isValidSuiObjectId(params.pos_id)
    const max_amount_a = BigInt(params.max_amount_a)
    const max_amount_b = BigInt(params.max_amount_b)

    // Build coin inputs if not provided
    let primaryCoinAInputs: BuildCoinResult
    let primaryCoinBInputs: BuildCoinResult
    if (inputCoinA == null || inputCoinB == null) {
      const allCoinAsset = await this.sdk.getOwnerCoinAssets(this.sdk.senderAddress)
      primaryCoinAInputs = TransactionUtil.buildCoinForAmount(tx, allCoinAsset, max_amount_a, params.coinTypeA, false, true)
      primaryCoinBInputs = TransactionUtil.buildCoinForAmount(tx, allCoinAsset, max_amount_b, params.coinTypeB, false, true)
    } else {
      primaryCoinAInputs = {
        targetCoin: inputCoinA,
        remainCoins: [],
        isMintZeroCoin: false,
        tragetCoinAmount: '0',
      }
      primaryCoinBInputs = {
        targetCoin: inputCoinB,
        remainCoins: [],
        isMintZeroCoin: false,
        tragetCoinAmount: '0',
      }
    }

    if (needOpenPosition) {
      // Create new position with initial liquidity
      tx.moveCall({
        target: `${integrate.published_at}::${DammIntegratePoolModule}::open_position_with_liquidity`,
        typeArguments,
        arguments: [
          tx.object(getPackagerConfigs(damm_pool).global_config_id),
          tx.object(params.pool_id),
          primaryCoinAInputs.targetCoin,
          primaryCoinBInputs.targetCoin,
          tx.pure.u64(params.max_amount_a),
          tx.pure.u64(params.max_amount_b),
          tx.pure.u32(Number(tick_lower)),
          tx.pure.u32(Number(tick_upper)),
          tx.pure.u128(params.delta_liquidity),
          tx.object(CLOCK_ADDRESS),
        ],
      })
    } else {
      // Add liquidity to existing position
      const allCoinAsset = await this.sdk.getOwnerCoinAssets(this.sdk.senderAddress)
      tx = TransactionUtil.createCollectRewarderAndFeeParams(
        this.sdk,
        tx,
        params,
        allCoinAsset,
        primaryCoinAInputs.remainCoins,
        primaryCoinBInputs.remainCoins
      )
      tx.moveCall({
        target: `${integrate.published_at}::${DammIntegratePoolModule}::add_liquidity`,
        typeArguments,
        arguments: [
          tx.object(getPackagerConfigs(damm_pool).global_config_id),
          tx.object(params.pool_id),
          tx.object(params.pos_id),
          primaryCoinAInputs.targetCoin,
          primaryCoinBInputs.targetCoin,
          tx.pure.u64(params.max_amount_a),
          tx.pure.u64(params.max_amount_b),
          tx.pure.u128(params.delta_liquidity),
          tx.object(CLOCK_ADDRESS),
        ],
      })
    }
    return tx
  }

  /**
   * Creates a transaction to remove liquidity from a position
   * @param params - Parameters including liquidity amount to remove and minimum outputs
   * @param tx - Optional existing transaction to extend
   * @returns Transaction for removing liquidity
   * @example
   * // Remove 50% of liquidity
   * const position = await sdk.Position.getPositionById(positionId);
   * const halfLiquidity = new BN(position.liquidity).divn(2);
   *
   * const tx = await sdk.Position.removeLiquidityTransactionPayload({
   *   pool_id: poolId,
   *   pos_id: positionId,
   *   coinTypeA: "0x2::sui::SUI",
   *   coinTypeB: "0x5d4b...::coin::COIN",
   *   delta_liquidity: halfLiquidity.toString(),
   *   min_amount_a: "900000000",  // Minimum SUI to receive
   *   min_amount_b: "4500000",    // Minimum COIN to receive
   *   collect_fee: true           // Also collect pending fees
   * });
   */
  async removeLiquidityTransactionPayload(params: RemoveLiquidityParams, tx?: Transaction): Promise<Transaction> {
    if (!checkValidSuiAddress(this.sdk.senderAddress)) {
      throw new DammpoolsError(
        'Invalid sender address: ferra damm sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }
    const { damm_pool, integrate } = this.sdk.sdkOptions

    const functionName = 'remove_liquidity'

    tx = tx || new Transaction()

    const typeArguments = [params.coinTypeA, params.coinTypeB]

    const allCoinAsset = await this._sdk.getOwnerCoinAssets(this.sdk.senderAddress)

    // Collect fees and rewards before removing liquidity
    tx = TransactionUtil.createCollectRewarderAndFeeParams(this._sdk, tx, params, allCoinAsset)

    const args = [
      tx.object(getPackagerConfigs(damm_pool).global_config_id),
      tx.object(params.pool_id),
      tx.object(params.pos_id),
      tx.pure.u128(params.delta_liquidity),
      tx.pure.u64(params.min_amount_a),
      tx.pure.u64(params.min_amount_b),
      tx.object(CLOCK_ADDRESS),
    ]

    tx.moveCall({
      target: `${integrate.published_at}::${DammIntegratePoolModule}::${functionName}`,
      typeArguments,
      arguments: args,
    })

    return tx
  }

  /**
   * Creates a transaction to close a position (remove all liquidity)
   * Position NFT is burned after closing
   * @param params - Parameters including slippage tolerance
   * @param tx - Optional existing transaction to extend
   * @returns Transaction for closing position
   * @example
   * const tx = await sdk.Position.closePositionTransactionPayload({
   *   pool_id: poolId,
   *   pos_id: positionId,
   *   coinTypeA: "0x2::sui::SUI",
   *   coinTypeB: "0x5d4b...::coin::COIN",
   *   min_amount_a: "950000000",  // Accept 5% slippage
   *   min_amount_b: "4750000",
   *   collect_fee: true,
   *   rewarder_coin_types: [
   *     "0x_reward_coin_1",
   *     "0x_reward_coin_2",
   *     "0x_reward_coin_3"
   *   ]
   * });
   */
  async closePositionTransactionPayload(params: ClosePositionParams, tx?: Transaction): Promise<Transaction> {
    if (!checkValidSuiAddress(this.sdk.senderAddress)) {
      throw new DammpoolsError(
        'Invalid sender address: ferra damm sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }
    const { damm_pool, integrate } = this.sdk.sdkOptions

    tx = tx || new Transaction()

    const typeArguments = [params.coinTypeA, params.coinTypeB]

    const allCoinAsset = await this.sdk.getOwnerCoinAssets(this.sdk.senderAddress)

    // Collect all fees and rewards before closing
    tx = TransactionUtil.createCollectRewarderAndFeeParams(this._sdk, tx, params, allCoinAsset)

    tx.moveCall({
      target: `${integrate.published_at}::${DammIntegratePoolModule}::close_position`,
      typeArguments,
      arguments: [
        tx.object(getPackagerConfigs(damm_pool).global_config_id),
        tx.object(params.pool_id),
        tx.object(params.pos_id),
        tx.pure.u64(params.min_amount_a),
        tx.pure.u64(params.min_amount_b),
        tx.object(CLOCK_ADDRESS),
      ],
    })

    return tx
  }

  /**
   * Creates transaction to open a new empty position
   * Position will have no liquidity until added separately
   * @param params - Position opening parameters
   * @param tx - Optional existing transaction to append to
   * @returns Transaction object for opening position
   */
  openPositionTransactionPayload(params: OpenPositionParams, tx?: Transaction): Transaction {
    const { damm_pool, integrate } = this.sdk.sdkOptions
    tx = tx || new Transaction()

    const typeArguments = [params.coinTypeA, params.coinTypeB]
    // Convert tick indices to unsigned format
    const tick_lower = asUintN(BigInt(params.tick_lower)).toString()
    const tick_upper = asUintN(BigInt(params.tick_upper)).toString()
    const args = [
      tx.object(getPackagerConfigs(damm_pool).global_config_id),
      tx.object(params.pool_id),
      tx.pure.u32(Number(tick_lower)),
      tx.pure.u32(Number(tick_upper)),
    ]

    tx.moveCall({
      target: `${integrate.published_at}::${DammIntegratePoolModule}::`,
      typeArguments,
      arguments: args,
    })

    return tx
  }

  /**
   * Locks a position until a specific timestamp
   * Locked positions cannot be closed or have liquidity removed
   * Useful for governance or vesting mechanisms
   * @param pool - Pool object
   * @param positionId - Position NFT ID
   * @param untilTimestamp - Unix timestamp (seconds) when lock expires
   * @param tx - Optional transaction to extend
   * @returns Transaction for locking position
   * @example
   * const pool = await sdk.Pool.getPool(poolId);
   * const oneWeekFromNow = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);
   *
   * const tx = await sdk.Position.lockPosition(
   *   pool,
   *   positionId,
   *   oneWeekFromNow
   * );
   *
   * console.log(`Position locked until: ${new Date(oneWeekFromNow * 1000)}`);
   */
  public async lockPosition(pool: Pool, positionId: string, untilTimestamp: number, tx = new Transaction()) {
    const sender = this.sdk.senderAddress

    tx.setSender(sender)
    TransactionUtil.buildLockPosition(
      {
        poolId: pool.poolAddress,
        positionId,
        typeA: pool.coinTypeA,
        typeB: pool.coinTypeB,
        untilTimestamp,
      },
      this.sdk.sdkOptions,
      tx
    )

    return tx
  }

  /**
   * Gets lock status for a position by ID
   * @param positionId - Position NFT ID
   * @returns Tuple of [lockTimestamp, currentTimestamp, isLocked]
   * @example
   * const [lockTime, currentTime, isLocked] =
   *   await sdk.Position.getLockPositionStatusById(positionId);
   *
   * if (isLocked) {
   *   const unlockDate = new Date(lockTime * 1000);
   *   console.log(`Locked until: ${unlockDate}`);
   *   console.log(`Time remaining: ${lockTime - currentTime}s`);
   * } else {
   *   console.log('Position is unlocked');
   * }
   */
  public async getLockPositionStatusById(
    positionId: string
  ): Promise<[current_lock: number, current_timestamp: number, is_locked: boolean]> {
    const position = await this.getPositionById(positionId)
    const currentLock = Number(position.lock_until)
    const currentTimestamp = Date.now()

    return [currentLock, currentTimestamp, currentLock > currentTimestamp]
  }

  public async getLockPositionStatus(position: Position): Promise<[current_lock: number, current_timestamp: number, is_locked: boolean]> {
    const currentLock = Number(position.lock_until)
    const currentTimestamp = Date.now()

    return [currentLock, currentTimestamp, currentLock > currentTimestamp]
  }

  /**
   * Creates a transaction to collect accumulated fees from a position
   * Fees can be collected without affecting liquidity
   * @param params - Parameters including pool and position info
   * @param tx - Optional transaction to extend
   * @returns Transaction for collecting fees
   * @example
   * const pool = await sdk.Pool.getPool(poolId);
   *
   * const collectTx = await sdk.Position.collectFeeTransactionPayload({
   *   pool,
   *   pos_id: positionId,
   *   coinTypeA: pool.coinTypeA,
   *   coinTypeB: pool.coinTypeB,
   *   collect_fee: true
   * });
   *
   * const result = await sdk.fullClient.signAndExecuteTransaction({
   *   transaction: collectTx,
   *   signer: keypair
   * });
   *
   * // Check collected amounts from events
   * const collectEvent = result.events?.find(
   *   e => e.type.includes('CollectFeeEvent')
   * );
   * console.log(`Collected A: ${collectEvent?.parsedJson?.amount_a}`);
   * console.log(`Collected B: ${collectEvent?.parsedJson?.amount_b}`);
   */
  async collectFeeTransactionPayload(
    params: CollectFeeParams,
    tx?: Transaction,
    inputCoinA?: TransactionObjectArgument,
    inputCoinB?: TransactionObjectArgument
  ): Promise<Transaction> {
    if (!checkValidSuiAddress(this.sdk.senderAddress)) {
      throw new DammpoolsError(
        'Invalid sender address: ferra damm sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }

    tx = tx || new Transaction()

    // Build zero-balance coins if not provided
    const coinA = inputCoinA || TransactionUtil.buildCoinWithBalance(BigInt(0), params.coinTypeA)
    const coinB = inputCoinB || TransactionUtil.buildCoinWithBalance(BigInt(0), params.coinTypeB)

    this.createCollectFeePaylod(params, tx, coinA, coinB)
    return tx
  }

  /**
   * Internal method to create collect fee move call
   * @param params - Fee collection parameters
   * @param tx - Transaction object
   * @param primaryCoinAInput - Coin A object
   * @param primaryCoinBInput - Coin B object
   * @returns Transaction object with collect fee call
   */
  createCollectFeePaylod(
    params: CollectFeeParams,
    tx: Transaction,
    primaryCoinAInput: TransactionObjectArgument,
    primaryCoinBInput: TransactionObjectArgument
  ) {
    const { damm_pool, integrate } = this.sdk.sdkOptions
    const typeArguments = [params.coinTypeA, params.coinTypeB]
    const args = [
      tx.object(getPackagerConfigs(damm_pool).global_config_id),
      tx.object(params.pool_id),
      tx.object(params.pos_id),
      primaryCoinAInput,
      primaryCoinBInput,
    ]

    tx.moveCall({
      target: `${integrate.published_at}::${DammIntegratePoolModule}::collect_fee`,
      typeArguments,
      arguments: args,
    })
    return tx
  }

  /**
   * Creates collect fee call without sending coins to sender
   * Used when coins need to be used in subsequent operations
   * @param params - Fee collection parameters
   * @param tx - Transaction object
   * @param primaryCoinAInput - Coin A object
   * @param primaryCoinBInput - Coin B object
   * @returns Transaction object with collect fee call
   */
  createCollectFeeNoSendPaylod(
    params: CollectFeeParams,
    tx: Transaction,
    primaryCoinAInput: TransactionObjectArgument,
    primaryCoinBInput: TransactionObjectArgument
  ) {
    const { damm_pool, integrate } = this.sdk.sdkOptions
    const typeArguments = [params.coinTypeA, params.coinTypeB]
    const args = [
      tx.object(getPackagerConfigs(damm_pool).global_config_id),
      tx.object(params.pool_id),
      tx.object(params.pos_id),
      primaryCoinAInput,
      primaryCoinBInput,
    ]

    tx.moveCall({
      target: `${integrate.published_at}::${DammIntegratePoolModule}::collect_fee`,
      typeArguments,
      arguments: args,
    })
    return tx
  }

  /**
 * Calculates pending fees for a position using local computation
 * Faster than on-chain simulation but less accurate
 * @param params - Pool and position parameters
 * @returns Fee quote with amounts owed
 * @example
 * const pool = await sdk.Pool.getPool(poolId);
 * const position = await sdk.Position.getPositionById(positionId);
 * const ticks = await sdk.Pool.fetchTicksByRpc(pool.ticksHandle);
 * 
 * const tickLower = ticks.find(t => t.index === position.tick_lower_index);
 * const tickUpper = ticks.find(t => t.index === position.tick_upper_index);
 * 
 * const fees = await sdk.Position.calculateFee({
 *   pool,
 *   position,
 *   tickLower,
 *   tickUpper
 * });
 * 
 * console.log(`Pending fee A: ${fees.feeOwedA.toString()}`);
 * console.log(`Pending fee B: ${fees.feeOwedB.toString()}`);
 */
  async calculateFee(params: CollectFeeParams) {
    const paylod = await this.collectFeeTransactionPayload(params)
    if (!checkValidSuiAddress(this.sdk.senderAddress)) {
      throw new DammpoolsError(
        'Invalid sender address: ferra damm sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }
    const res = await this._sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: paylod,
      sender: this.sdk.senderAddress,
    })

    // Extract fee amounts from simulation events
    for (const event of res.events) {
      if (extractStructTagFromType(event.type).name === 'CollectFeeEvent') {
        const json = event.parsedJson as any
        return {
          feeOwedA: json.amount_a,
          feeOwedB: json.amount_b,
        }
      }
    }

    return {
      feeOwedA: '0',
      feeOwedB: '0',
    }
  }

  /**
   * Updates cached data with expiration time
   * @param key - Cache key
   * @param data - Data to cache
   * @param time - Cache duration in minutes (default: 5)
   */
  private updateCache(key: string, data: SuiResource, time = cacheTime5min) {
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
  private getCache<T>(key: string, forceRefresh = false): T | undefined {
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

type SizedArray<T, S extends number, Arr extends T[] = []> = Arr['length'] extends S ? Arr : SizedArray<T, S, [...Arr, T]>
