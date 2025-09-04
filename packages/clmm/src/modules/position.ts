import BN from 'bn.js'
import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions'
import { isValidSuiObjectId } from '@mysten/sui/utils'
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
  checkInvalidSuiAddress,
  extractStructTagFromType,
  getFutureTime,
} from '../utils'
import { BuildCoinResult, findAdjustCoin, TransactionUtil } from '../utils/transaction-util'
import {
  ClmmFetcherModule,
  ClmmIntegratePoolModule,
  CLOCK_ADDRESS,
  DataPage,
  PaginationArgs,
  SuiObjectIdType,
  SuiResource,
} from '../types/sui'
import { FerraClmmSDK } from '../sdk'
import { IModule } from '../interfaces/IModule'
import { getObjectFields } from '../utils/objects'
import { CollectFeesQuote } from '../math'
import { FetchPosFeeParams } from './rewarder'
import { ClmmpoolsError, ConfigErrorCode, PoolErrorCode, UtilsErrorCode } from '../errors/errors'
import { RpcModule } from './rpc'
import { bcs } from '@mysten/bcs'

/**
 * Position module for managing liquidity positions in CLMM pools
 * Provides functionality for creating, updating, and managing positions
 */
export class PositionModule implements IModule {
  protected _sdk: FerraClmmSDK
  private readonly _cache: Record<string, CachedContent> = {}

  constructor(sdk: FerraClmmSDK) {
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
    const ferraClmm = this._sdk.sdkOptions.clmm_pool.package_id
    return `${ferraClmm}::position::Position`
  }

  /**
   * Retrieves transaction history for a specific position
   * Supports custom RPC endpoints and filtering by multiple position IDs
   * @param posId - Primary position ID to query
   * @param originPosId - Optional original position ID for filtering
   * @param fullRpcUrl - Optional custom RPC endpoint
   * @param paginationArgs - Pagination parameters (default: 'all')
   * @param order - Sort order for transactions (default: 'ascending')
   * @returns Paginated list of position transactions
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
   * Retrieves all positions owned by an account
   * Optionally filters by pool IDs
   * @param accountAddress - Owner's address
   * @param assignPoolIds - Optional array of pool IDs to filter positions
   * @param showDisplay - Include display metadata (default: true)
   * @returns Array of Position objects owned by the account
   */
  async getPositionList(accountAddress: string, assignPoolIds: string[] = [], showDisplay = true): Promise<Position[]> {
    const allPosition: Position[] = []

    const ownerRes: any = await this._sdk.fullClient.getOwnedObjectsByPage(accountAddress, {
      options: { showType: true, showContent: true, showDisplay, showOwner: true },
      filter: { Package: this._sdk.sdkOptions.clmm_pool.package_id },
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
   * Retrieves position data directly by ID (recommended method)
   * Automatically fetches pool data to calculate rewards if needed
   * @param positionID - Position object ID
   * @param calculateRewarder - Calculate reward amounts (default: true)
   * @param showDisplay - Include display metadata (default: true)
   * @returns Complete position object with optional rewards
   */
  async getPositionById(positionID: string, calculateRewarder = true, showDisplay = true): Promise<Position> {
    const position = await this.getSimplePosition(positionID, showDisplay)
    if (calculateRewarder) {
      const pool = await this._sdk.Pool.getPool(position.pool, false)
      const result = await this.updatePositionRewarders(pool.position_manager.positions_handle, position)
      return result
    }
    return position
  }

  /**
   * Retrieves basic position data without reward calculations
   * Uses cache to minimize RPC calls
   * @param positionID - Position object ID
   * @param showDisplay - Include display metadata (default: true)
   * @returns Basic position object without rewards
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
   * Batch retrieves multiple positions efficiently
   * Uses cache and batch RPC calls to optimize performance
   * @param positionIDs - Array of position object IDs
   * @param showDisplay - Include display metadata (default: true)
   * @returns Array of position objects
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
   * Simulates fee collection for multiple positions
   * Uses devInspectTransactionBlock for gas-free simulation
   * @param params - Array of position parameters for fee calculation
   * @returns Array of fee quotes for each position
   */
  public async fetchPosFeeAmount(params: FetchPosFeeParams[]): Promise<CollectFeesQuote[]> {
    const { clmm_pool, integrate, simulationAccount } = this.sdk.sdkOptions
    const tx = new Transaction()

    // Build simulation transaction for all positions
    for (const paramItem of params) {
      const typeArguments = [paramItem.coinTypeA, paramItem.coinTypeB]
      const args = [
        tx.object(getPackagerConfigs(clmm_pool).global_config_id),
        tx.object(paramItem.poolAddress),
        tx.pure.address(paramItem.positionId),
      ]
      tx.moveCall({
        target: `${integrate.published_at}::${ClmmFetcherModule}::fetch_position_fees`,
        arguments: args,
        typeArguments,
      })
    }

    if (!checkInvalidSuiAddress(simulationAccount.address)) {
      throw new ClmmpoolsError('this config simulationAccount is not set right', ConfigErrorCode.InvalidSimulateAccount)
    }

    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

    if (simulateRes.error != null) {
      throw new ClmmpoolsError(
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
   * Batch fetches fee amounts for multiple positions
   * Automatically retrieves position and pool data
   * @param positionIDs - Array of position object IDs
   * @returns Map of position ID to fee quote
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
   * Creates transaction to add liquidity with fixed token amount
   * Supports gas estimation for SUI token transactions
   * @param params - Fixed token liquidity parameters
   * @param gasEstimateArg - Optional gas estimation parameters for SUI
   * @param tx - Optional existing transaction to append to
   * @param inputCoinA - Optional pre-built coin A object
   * @param inputCoinB - Optional pre-built coin B object
   * @returns Transaction object for adding liquidity
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
    if (!checkInvalidSuiAddress(this.sdk.senderAddress)) {
      throw new ClmmpoolsError(
        'Invalid sender address: ferra clmm sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
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
   * Creates transaction to add liquidity to a position
   * Automatically handles position creation if needed
   * @param params - Liquidity addition parameters
   * @param tx - Optional existing transaction to append to
   * @param inputCoinA - Optional pre-built coin A object
   * @param inputCoinB - Optional pre-built coin B object
   * @returns Transaction object for adding liquidity
   */
  async createAddLiquidityPayload(
    params: AddLiquidityParams,
    tx?: Transaction,
    inputCoinA?: TransactionObjectArgument,
    inputCoinB?: TransactionObjectArgument
  ): Promise<Transaction> {
    const { integrate, clmm_pool } = this._sdk.sdkOptions
    if (!checkInvalidSuiAddress(this.sdk.senderAddress)) {
      throw new ClmmpoolsError(
        'Invalid sender address: ferra clmm sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }

    // Convert tick indices to unsigned format
    const tick_lower = asUintN(BigInt(params.tick_lower)).toString()
    const tick_upper = asUintN(BigInt(params.tick_upper)).toString()
    const lock_until = asUintN(BigInt(params.lock_until ?? 0)).toString()

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
        target: `${integrate.published_at}::${ClmmIntegratePoolModule}::open_position_with_liquidity`,
        typeArguments,
        arguments: [
          tx.object(getPackagerConfigs(clmm_pool).global_config_id),
          tx.object(params.pool_id),
          tx.pure.u32(Number(tick_lower)),
          tx.pure.u32(Number(tick_upper)),
          primaryCoinAInputs.targetCoin,
          primaryCoinBInputs.targetCoin,
          tx.pure.u64(params.max_amount_a),
          tx.pure.u64(params.max_amount_b),
          tx.pure.u128(params.delta_liquidity),
          tx.pure.u64(lock_until),
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
        target: `${integrate.published_at}::${ClmmIntegratePoolModule}::add_liquidity`,
        typeArguments,
        arguments: [
          tx.object(getPackagerConfigs(clmm_pool).global_config_id),
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
   * Creates transaction to remove liquidity from a position
   * Automatically collects fees and rewards before removal
   * @param params - Liquidity removal parameters
   * @param tx - Optional existing transaction to append to
   * @returns Transaction object for removing liquidity
   */
  async removeLiquidityTransactionPayload(params: RemoveLiquidityParams, tx?: Transaction): Promise<Transaction> {
    if (!checkInvalidSuiAddress(this.sdk.senderAddress)) {
      throw new ClmmpoolsError(
        'Invalid sender address: ferra clmm sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }
    const { clmm_pool, integrate } = this.sdk.sdkOptions

    const functionName = 'remove_liquidity'

    tx = tx || new Transaction()

    const typeArguments = [params.coinTypeA, params.coinTypeB]

    const allCoinAsset = await this._sdk.getOwnerCoinAssets(this.sdk.senderAddress)

    // Collect fees and rewards before removing liquidity
    tx = TransactionUtil.createCollectRewarderAndFeeParams(this._sdk, tx, params, allCoinAsset)

    const args = [
      tx.object(getPackagerConfigs(clmm_pool).global_config_id),
      tx.object(params.pool_id),
      tx.object(params.pos_id),
      tx.pure.u128(params.delta_liquidity),
      tx.pure.u64(params.min_amount_a),
      tx.pure.u64(params.min_amount_b),
      tx.object(CLOCK_ADDRESS),
    ]

    tx.moveCall({
      target: `${integrate.published_at}::${ClmmIntegratePoolModule}::${functionName}`,
      typeArguments,
      arguments: args,
    })

    return tx
  }

  /**
   * Creates transaction to close a position completely
   * Removes all liquidity and collects all fees/rewards
   * @param params - Position closure parameters
   * @param tx - Optional existing transaction to append to
   * @returns Transaction object for closing position
   */
  async closePositionTransactionPayload(params: ClosePositionParams, tx?: Transaction): Promise<Transaction> {
    if (!checkInvalidSuiAddress(this.sdk.senderAddress)) {
      throw new ClmmpoolsError(
        'Invalid sender address: ferra clmm sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }
    const { clmm_pool, integrate } = this.sdk.sdkOptions

    tx = tx || new Transaction()

    const typeArguments = [params.coinTypeA, params.coinTypeB]

    const allCoinAsset = await this.sdk.getOwnerCoinAssets(this.sdk.senderAddress)

    // Collect all fees and rewards before closing
    tx = TransactionUtil.createCollectRewarderAndFeeParams(this._sdk, tx, params, allCoinAsset)

    tx.moveCall({
      target: `${integrate.published_at}::${ClmmIntegratePoolModule}::close_position`,
      typeArguments,
      arguments: [
        tx.object(getPackagerConfigs(clmm_pool).global_config_id),
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
    const { clmm_pool, integrate } = this.sdk.sdkOptions
    tx = tx || new Transaction()

    const typeArguments = [params.coinTypeA, params.coinTypeB]
    // Convert tick indices to unsigned format
    const tick_lower = asUintN(BigInt(params.tick_lower)).toString()
    const tick_upper = asUintN(BigInt(params.tick_upper)).toString()
    const lock_until = asUintN(BigInt(params?.lock_until ?? 0)).toString()
    const args = [
      tx.object(getPackagerConfigs(clmm_pool).global_config_id),
      tx.object(params.pool_id),
      tx.pure.u32(Number(tick_lower)),
      tx.pure.u32(Number(tick_upper)),
      tx.pure.u64(Number(lock_until))
    ]

    tx.moveCall({
      target: `${integrate.published_at}::${ClmmIntegratePoolModule}::open_position`,
      typeArguments,
      arguments: args,
    })

    return tx
  }

  public async lockPosition(pool: Pool, positionId: string, untilTimestamp: number) {
    const sender = this.sdk.senderAddress

    const tx = new Transaction()
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

  public async getLockPositionStatusById(positionId: string): Promise<[current_lock: number, current_timestamp: number, is_locked: boolean]> {
    const position = await this.getPositionById(positionId)
    const currentLock = Number(position.lock_until);
    const currentTimestamp = Date.now();

    return [currentLock, currentTimestamp, currentLock > currentTimestamp]
  }

  public async getLockPositionStatus(position: Position): Promise<[current_lock: number, current_timestamp: number, is_locked: boolean]> {
    const currentLock = Number(position.lock_until);
    const currentTimestamp = Date.now();

    return [currentLock, currentTimestamp, currentLock > currentTimestamp]
  }

  /**
   * Creates transaction to collect LP fees from a position
   * @param params - Fee collection parameters
   * @param tx - Optional existing transaction to append to
   * @param inputCoinA - Optional pre-built coin A object
   * @param inputCoinB - Optional pre-built coin B object
   * @returns Transaction object for fee collection
   */
  async collectFeeTransactionPayload(
    params: CollectFeeParams,
    tx?: Transaction,
    inputCoinA?: TransactionObjectArgument,
    inputCoinB?: TransactionObjectArgument
  ): Promise<Transaction> {
    if (!checkInvalidSuiAddress(this.sdk.senderAddress)) {
      throw new ClmmpoolsError(
        'Invalid sender address: ferra clmm sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
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
    const { clmm_pool, integrate } = this.sdk.sdkOptions
    const typeArguments = [params.coinTypeA, params.coinTypeB]
    const args = [
      tx.object(getPackagerConfigs(clmm_pool).global_config_id),
      tx.object(params.pool_id),
      tx.object(params.pos_id),
      primaryCoinAInput,
      primaryCoinBInput,
    ]

    tx.moveCall({
      target: `${integrate.published_at}::${ClmmIntegratePoolModule}::collect_fee`,
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
    const { clmm_pool, integrate } = this.sdk.sdkOptions
    const typeArguments = [params.coinTypeA, params.coinTypeB]
    const args = [
      tx.object(getPackagerConfigs(clmm_pool).global_config_id),
      tx.object(params.pool_id),
      tx.object(params.pos_id),
      primaryCoinAInput,
      primaryCoinBInput,
    ]

    tx.moveCall({
      target: `${integrate.published_at}::${ClmmIntegratePoolModule}::collect_fee`,
      typeArguments,
      arguments: args,
    })
    return tx
  }

  /**
   * Simulates fee collection to calculate claimable amounts
   * Uses devInspectTransactionBlock for gas-free calculation
   * @param params - Fee collection parameters
   * @returns Object containing fee amounts for both tokens
   */
  async calculateFee(params: CollectFeeParams) {
    const paylod = await this.collectFeeTransactionPayload(params)
    if (!checkInvalidSuiAddress(this.sdk.senderAddress)) {
      throw new ClmmpoolsError(
        'Invalid sender address: ferra clmm sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
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