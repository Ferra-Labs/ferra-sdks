/* eslint-disable @typescript-eslint/no-use-before-define */
import BN from 'bn.js'
import { Transaction, TransactionArgument, TransactionObjectArgument } from '@mysten/sui/transactions'
import { BuildCoinResult, checkInvalidSuiAddress, extractStructTagFromType, normalizeCoinType, TransactionUtil } from '../utils'
import { ClmmFetcherModule, ClmmIntegratePoolModule, CLOCK_ADDRESS } from '../types/sui'
import { getRewardInTickRange } from '../utils/tick'
import { MathUtil, ONE, ZERO } from '../math/utils'
import { TickData } from '../types/clmm-pool'
import { FerraClmmSDK } from '../sdk'
import { IModule } from '../interfaces/IModule'
import { CollectRewarderParams, getPackagerConfigs, Pool, Position, PositionReward, Rewarder, RewarderAmountOwed } from '../types'
import { CollectFeesQuote } from '../math'
import { ClmmpoolsError, ConfigErrorCode, UtilsErrorCode } from '../errors/errors'

export type FetchPosRewardParams = {
  poolAddress: string
  positionId: string
  coinTypeA: string
  coinTypeB: string
  rewarderInfo: Rewarder[]
}

export type FetchPosFeeParams = {
  poolAddress: string
  positionId: string
  coinTypeA: string
  coinTypeB: string
}

export type PosRewarderResult = {
  poolAddress: string
  positionId: string
  rewarderAmountOwed: RewarderAmountOwed[]
}

/**
 * Rewarder module for managing position rewards in CLMM pools
 * Handles reward calculations, collection, and distribution for liquidity providers
 */
export class RewarderModule implements IModule {
  protected _sdk: FerraClmmSDK
  private growthGlobal: BN[]

  constructor(sdk: FerraClmmSDK) {
    this._sdk = sdk
    this.growthGlobal = [ZERO, ZERO, ZERO]
  }

  get sdk() {
    return this._sdk
  }

  /**
   * Calculates daily emissions for all rewarders in a pool
   * @param poolID - The pool object ID
   * @returns Array of daily emissions for each rewarder with coin addresses
   */
  async emissionsEveryDay(poolID: string) {
    const currentPool: Pool = await this.sdk.Pool.getPool(poolID)
    const rewarderInfos = currentPool.rewarder_infos
    if (!rewarderInfos) {
      return null
    }

    const emissionsEveryDay = []
    for (const rewarderInfo of rewarderInfos) {
      // Convert emissions from x64 fixed-point to regular number
      const emissionSeconds = MathUtil.fromX64(new BN(rewarderInfo.emissions_per_second))
      emissionsEveryDay.push({
        emissions: Math.floor(emissionSeconds.toNumber() * 60 * 60 * 24),
        coin_address: rewarderInfo.coinAddress,
      })
    }

    return emissionsEveryDay
  }

  /**
   * Updates pool rewarder growth globals based on time elapsed
   * Internal method used for reward calculations
   * @param poolID - The pool object ID
   * @param currentTime - Current timestamp in milliseconds
   * @returns Updated pool object with new rewarder state
   */
  private async updatePoolRewarder(poolID: string, currentTime: BN): Promise<Pool> {
    // Refresh pool rewarder state
    const currentPool: Pool = await this.sdk.Pool.getPool(poolID)
    const lastTime = currentPool.rewarder_last_updated_time
    currentPool.rewarder_last_updated_time = currentTime.toString()

    // Skip update if no liquidity or no time has passed
    if (Number(currentPool.liquidity) === 0 || currentTime.eq(new BN(lastTime))) {
      return currentPool
    }

    // Calculate time delta in seconds with 15 second buffer
    const timeDelta = currentTime.div(new BN(1000)).sub(new BN(lastTime)).add(new BN(15))
    const rewarderInfos: any = currentPool.rewarder_infos

    // Update growth global for each rewarder
    for (let i = 0; i < rewarderInfos.length; i += 1) {
      const rewarderInfo = rewarderInfos[i]
      const rewarderGrowthDelta = MathUtil.checkMulDivFloor(
        timeDelta,
        new BN(rewarderInfo.emissions_per_second),
        new BN(currentPool.liquidity),
        128
      )
      this.growthGlobal[i] = new BN(rewarderInfo.growth_global).add(new BN(rewarderGrowthDelta))
    }

    return currentPool
  }

  /**
   * Calculates reward amounts owed to a specific position
   * @deprecated Use fetchPosRewardersAmount() for better performance and accuracy
   * @param poolID - The pool object ID
   * @param positionHandle - Position collection handle
   * @param positionID - Position object ID
   * @returns Array of reward amounts for each rewarder
   */
  async posRewardersAmount(poolID: string, positionHandle: string, positionID: string) {
    const currentTime = Date.parse(new Date().toString())
    const pool: Pool = await this.updatePoolRewarder(poolID, new BN(currentTime))
    const position = await this.sdk.Position.getPositionRewarders(positionHandle, positionID)

    if (position === undefined) {
      return []
    }

    const ticksHandle = pool.ticks_handle
    const tickLower = await this.sdk.Pool.getTickDataByIndex(ticksHandle, position.tick_lower_index)
    const tickUpper = await this.sdk.Pool.getTickDataByIndex(ticksHandle, position.tick_upper_index)

    const amountOwed = this.posRewardersAmountInternal(pool, position, tickLower!, tickUpper!)
    return amountOwed
  }

  /**
   * Calculates total reward amounts for all positions in a pool owned by an account
   * @deprecated Use fetchPosRewardersAmount() for better performance and accuracy
   * @param accountAddress - Owner's address
   * @param poolID - The pool object ID
   * @returns Array of total reward amounts for each rewarder
   */
  async poolRewardersAmount(accountAddress: string, poolID: string) {
    const currentTime = Date.parse(new Date().toString())
    const pool: Pool = await this.updatePoolRewarder(poolID, new BN(currentTime))

    const positions = await this.sdk.Position.getPositionList(accountAddress, [poolID])
    const tickDatas = await this.getPoolLowerAndUpperTicks(pool.ticks_handle, positions)

    const rewarderAmount = [ZERO, ZERO, ZERO]

    for (let i = 0; i < positions.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const posRewarderInfo: any = await this.posRewardersAmountInternal(pool, positions[i], tickDatas[0][i], tickDatas[1][i])
      for (let j = 0; j < 3; j += 1) {
        rewarderAmount[j] = rewarderAmount[j].add(posRewarderInfo[j].amount_owed)
      }
    }

    return rewarderAmount
  }

  /**
   * Internal method to calculate reward amounts for a position
   * Uses tick data and growth globals to compute accurate rewards
   * @param pool - Pool object
   * @param position - Position reward data
   * @param tickLower - Lower tick data
   * @param tickUpper - Upper tick data
   * @returns Array of reward amounts owed for each rewarder
   */
  private posRewardersAmountInternal(pool: Pool, position: PositionReward, tickLower: TickData, tickUpper: TickData): RewarderAmountOwed[] {
    const tickLowerIndex = position.tick_lower_index
    const tickUpperIndex = position.tick_upper_index
    const rewardersInside = getRewardInTickRange(pool, tickLower, tickUpper, tickLowerIndex, tickUpperIndex, this.growthGlobal)

    const growthInside = []
    const AmountOwed = []

    // Process first rewarder if exists
    if (rewardersInside.length > 0) {
      let growthDelta0 = MathUtil.subUnderflowU128(rewardersInside[0], new BN(position.reward_growth_inside_0))

      // Cap growth delta to prevent overflow
      if (growthDelta0.gt(new BN('3402823669209384634633745948738404'))) {
        growthDelta0 = ONE
      }

      const amountOwed_0 = MathUtil.checkMulShiftRight(new BN(position.liquidity), growthDelta0, 64, 128)
      growthInside.push(rewardersInside[0])
      AmountOwed.push({
        amount_owed: new BN(position.reward_amount_owed_0).add(amountOwed_0),
        coin_address: pool.rewarder_infos[0].coinAddress,
      })
    }

    // Process second rewarder if exists
    if (rewardersInside.length > 1) {
      let growthDelta_1 = MathUtil.subUnderflowU128(rewardersInside[1], new BN(position.reward_growth_inside_1))
      // Cap growth delta to prevent overflow
      if (growthDelta_1.gt(new BN('3402823669209384634633745948738404'))) {
        growthDelta_1 = ONE
      }

      const amountOwed_1 = MathUtil.checkMulShiftRight(new BN(position.liquidity), growthDelta_1, 64, 128)
      growthInside.push(rewardersInside[1])

      AmountOwed.push({
        amount_owed: new BN(position.reward_amount_owed_1).add(amountOwed_1),
        coin_address: pool.rewarder_infos[1].coinAddress,
      })
    }

    // Process third rewarder if exists
    if (rewardersInside.length > 2) {
      let growthDelta_2 = MathUtil.subUnderflowU128(rewardersInside[2], new BN(position.reward_growth_inside_2))
      // Cap growth delta to prevent overflow
      if (growthDelta_2.gt(new BN('3402823669209384634633745948738404'))) {
        growthDelta_2 = ONE
      }

      const amountOwed_2 = MathUtil.checkMulShiftRight(new BN(position.liquidity), growthDelta_2, 64, 128)
      growthInside.push(rewardersInside[2])

      AmountOwed.push({
        amount_owed: new BN(position.reward_amount_owed_2).add(amountOwed_2),
        coin_address: pool.rewarder_infos[2].coinAddress,
      })
    }
    return AmountOwed
  }

  /**
   * Batch fetches reward amounts for multiple positions
   * More efficient than calling fetchPositionRewarders individually
   * @param positionIDs - Array of position object IDs
   * @returns Map of position ID to reward amounts
   */
  async batchFetchPositionRewarders(positionIDs: string[]): Promise<Record<string, RewarderAmountOwed[]>> {
    const posRewardParamsList: FetchPosRewardParams[] = []

    // Prepare parameters for each position
    for (const id of positionIDs) {
      const position = await this._sdk.Position.getPositionById(id, false)
      const pool = await this._sdk.Pool.getPool(position.pool, false)
      posRewardParamsList.push({
        poolAddress: pool.poolAddress,
        positionId: position.pos_object_id,
        coinTypeA: pool.coinTypeA,
        coinTypeB: pool.coinTypeB,
        rewarderInfo: pool.rewarder_infos,
      })
    }

    const positionMap: Record<string, RewarderAmountOwed[]> = {}

    if (posRewardParamsList.length > 0) {
      const result: PosRewarderResult[] = await this.fetchPosRewardersAmount(posRewardParamsList)
      for (const posRewarderInfo of result) {
        positionMap[posRewarderInfo.positionId] = posRewarderInfo.rewarderAmountOwed
      }
      return positionMap
    }
    return positionMap
  }

  /**
   * Fetches reward amounts for a single position
   * @param pool - Pool object
   * @param positionId - Position object ID
   * @returns Array of reward amounts for each rewarder
   */
  async fetchPositionRewarders(pool: Pool, positionId: string): Promise<RewarderAmountOwed[]> {
    const param = {
      poolAddress: pool.poolAddress,
      positionId,
      coinTypeA: pool.coinTypeA,
      coinTypeB: pool.coinTypeB,
      rewarderInfo: pool.rewarder_infos,
    }

    const result = await this.fetchPosRewardersAmount([param])

    return result[0].rewarderAmountOwed
  }

  /**
   * @deprecated Use Position.batchFetchPositionFees() instead
   * Batch fetches fee amounts for multiple positions
   * @param positionIDs - Array of position object IDs
   * @returns Map of position ID to fee amounts
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
   * Simulates fee collection for multiple positions
   * Uses devInspectTransactionBlock for gas-free calculation
   * @param params - Array of position fee parameters
   * @returns Array of fee quotes for each position
   */
  async fetchPosFeeAmount(params: FetchPosFeeParams[]): Promise<CollectFeesQuote[]> {
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

    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

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
      const posRewarderResult: CollectFeesQuote = {
        feeOwedA: new BN(parsedJson.fee_owned_a),
        feeOwedB: new BN(parsedJson.fee_owned_b),
        position_id: parsedJson.position_id,
      }
      result.push(posRewarderResult)
    }

    return result
  }

  /**
   * Simulates reward collection for multiple positions
   * Main method for fetching position rewards efficiently
   * @param params - Array of position reward parameters
   * @returns Array of reward results for each position
   */
  async fetchPosRewardersAmount(params: FetchPosRewardParams[]) {
    const { clmm_pool, integrate, simulationAccount } = this.sdk.sdkOptions
    const tx = new Transaction()

    // Build simulation transaction for all positions
    for (const paramItem of params) {
      const typeArguments = [paramItem.coinTypeA, paramItem.coinTypeB]
      const args = [
        tx.object(getPackagerConfigs(clmm_pool).global_config_id),
        tx.object(paramItem.poolAddress),
        tx.pure.address(paramItem.positionId),
        tx.object(CLOCK_ADDRESS),
      ]
      tx.moveCall({
        target: `${integrate.published_at}::${ClmmFetcherModule}::fetch_position_rewards`,
        arguments: args,
        typeArguments,
      })
    }

    if (!checkInvalidSuiAddress(simulationAccount.address)) {
      throw new ClmmpoolsError(
        `this config simulationAccount: ${simulationAccount.address} is not set right`,
        ConfigErrorCode.InvalidSimulateAccount
      )
    }

    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

    if (simulateRes.error != null) {
      throw new ClmmpoolsError(
        `fetch position rewards error code: ${simulateRes.error ?? 'unknown error'}, please check config and params`,
        ConfigErrorCode.InvalidConfig
      )
    }

    // Extract reward data from simulation events
    const valueData: any = simulateRes.events?.filter((item: any) => {
      return extractStructTagFromType(item.type).name === `FetchPositionRewardsEvent`
    })
    if (valueData.length === 0) {
      return []
    }

    if (valueData.length !== params.length) {
      throw new ClmmpoolsError('valueData.length !== params.length')
    }

    const result: PosRewarderResult[] = []

    // Process results for each position
    for (let i = 0; i < valueData.length; i += 1) {
      const posRewarderResult: PosRewarderResult = {
        poolAddress: params[i].poolAddress,
        positionId: params[i].positionId,
        rewarderAmountOwed: [],
      }

      // Extract reward amounts for each rewarder
      for (let j = 0; j < params[i].rewarderInfo.length; j += 1) {
        posRewarderResult.rewarderAmountOwed.push({
          amount_owed: new BN(valueData[i].parsedJson.data[j]),
          coin_address: params[i].rewarderInfo[j].coinAddress,
        })
      }

      result.push(posRewarderResult)
    }

    return result
  }

  /**
   * Calculates total rewards for all positions owned by an account in a pool
   * @param account - Owner's address
   * @param poolObjectId - Pool object ID
   * @returns Array of total reward amounts for each rewarder or null
   */
  async fetchPoolRewardersAmount(account: string, poolObjectId: string) {
    const pool: Pool = await this.sdk.Pool.getPool(poolObjectId)
    const positions = await this.sdk.Position.getPositionList(account, [poolObjectId])

    const params: FetchPosRewardParams[] = []

    // Prepare parameters for all positions
    for (const position of positions) {
      params.push({
        poolAddress: pool.poolAddress,
        positionId: position.pos_object_id,
        rewarderInfo: pool.rewarder_infos,
        coinTypeA: pool.coinTypeA,
        coinTypeB: pool.coinTypeB,
      })
    }

    const result = await this.fetchPosRewardersAmount(params)

    const rewarderAmount = [ZERO, ZERO, ZERO]

    // Sum up rewards across all positions
    if (result != null) {
      for (const posRewarderInfo of result) {
        for (let j = 0; j < posRewarderInfo.rewarderAmountOwed.length; j += 1) {
          rewarderAmount[j] = rewarderAmount[j].add(posRewarderInfo.rewarderAmountOwed[j].amount_owed)
        }
      }
    }
    return rewarderAmount
  }

  /**
   * Fetches tick data for all positions' upper and lower bounds
   * @param ticksHandle - Pool's tick collection handle
   * @param positions - Array of positions
   * @returns Array containing lower and upper tick data arrays
   */
  private async getPoolLowerAndUpperTicks(ticksHandle: string, positions: Position[]): Promise<TickData[][]> {
    const lowerTicks: TickData[] = []
    const upperTicks: TickData[] = []

    for (const pos of positions) {
      const tickLower = await this.sdk.Pool.getTickDataByIndex(ticksHandle, pos.tick_lower_index)
      const tickUpper = await this.sdk.Pool.getTickDataByIndex(ticksHandle, pos.tick_upper_index)
      lowerTicks.push(tickLower!)
      upperTicks.push(tickUpper!)
    }

    return [lowerTicks, upperTicks]
  }

  /**
   * Creates transaction to collect rewards from a position
   * @param params - Collection parameters
   * @returns Transaction object for reward collection
   */
  async collectRewarderTransactionPayload(params: CollectRewarderParams, tx?: Transaction): Promise<Transaction> {
    if (!checkInvalidSuiAddress(this.sdk.senderAddress)) {
      throw new ClmmpoolsError(
        'Invalid sender address: ferra clmm sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }
    const allCoinAsset = await this.sdk.getOwnerCoinAssets(this.sdk.senderAddress, null)
    tx ??= new Transaction()

    tx = TransactionUtil.createCollectRewarderAndFeeParams(this._sdk, tx, params, allCoinAsset)
    return tx
  }

  /**
   * Creates batch transaction to collect rewards from multiple positions
   * Optimizes coin object usage across multiple collections
   * @param params - Array of collection parameters
   * @param tx - Optional existing transaction to append to
   * @param inputCoinA - Optional pre-built coin A object
   * @param inputCoinB - Optional pre-built coin B object
   * @returns Transaction object for batch reward collection
   */
  async batchCollectRewardePayload(
    params: CollectRewarderParams[],
    tx?: Transaction,
    inputCoinA?: TransactionObjectArgument,
    inputCoinB?: TransactionObjectArgument
  ) {
    if (!checkInvalidSuiAddress(this.sdk.senderAddress)) {
      throw new ClmmpoolsError(
        'Invalid sender address: ferra clmm sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }
    const allCoinAsset = await this.sdk.getOwnerCoinAssets(this.sdk.senderAddress, null)
    tx = tx || new Transaction()
    const coinIdMaps: Record<string, BuildCoinResult> = {}

    // Process each collection request
    params.forEach((item) => {
      const coinTypeA = normalizeCoinType(item.coinTypeA)
      const coinTypeB = normalizeCoinType(item.coinTypeB)

      // Collect fees if requested
      if (item.collect_fee) {
        // Build or reuse coin A input
        let coinAInput = coinIdMaps[coinTypeA]
        if (coinAInput == null) {
          if (inputCoinA == null) {
            coinAInput = TransactionUtil.buildCoinForAmount(tx!, allCoinAsset!, BigInt(0), coinTypeA, false)
          } else {
            coinAInput = {
              targetCoin: inputCoinA,
              remainCoins: [],
              isMintZeroCoin: false,
              tragetCoinAmount: '0',
            }
          }

          coinIdMaps[coinTypeA] = coinAInput
        }

        // Build or reuse coin B input
        let coinBInput = coinIdMaps[coinTypeB]
        if (coinBInput == null) {
          if (inputCoinB == null) {
            coinBInput = TransactionUtil.buildCoinForAmount(tx!, allCoinAsset!, BigInt(0), coinTypeB, false)
          } else {
            coinBInput = {
              targetCoin: inputCoinB,
              remainCoins: [],
              isMintZeroCoin: false,
              tragetCoinAmount: '0',
            }
          }

          coinIdMaps[coinTypeB] = coinBInput
        }

        // Add fee collection to transaction
        tx = this._sdk.Position.createCollectFeeNoSendPaylod(
          {
            pool_id: item.pool_id,
            pos_id: item.pos_id,
            coinTypeA: item.coinTypeA,
            coinTypeB: item.coinTypeB,
          },
          tx!,
          coinAInput.targetCoin,
          coinBInput.targetCoin
        )
      }

      // Build coin inputs for each rewarder
      const primaryCoinInputs: TransactionObjectArgument[] = []
      item.rewarder_coin_types.forEach((type) => {
        const coinType = normalizeCoinType(type)
        let coinInput = coinIdMaps[type]
        if (coinInput === undefined) {
          coinInput = TransactionUtil.buildCoinForAmount(tx!, allCoinAsset!, BigInt(0), coinType, false)
          coinIdMaps[coinType] = coinInput
        }
        primaryCoinInputs.push(coinInput.targetCoin)
      })

      // Add reward collection to transaction
      tx = this.createCollectRewarderNoSendPaylod(item, tx!, primaryCoinInputs)
    })

    // Transfer any minted zero coins to sender
    Object.keys(coinIdMaps).forEach((key) => {
      const value = coinIdMaps[key]
      if (value.isMintZeroCoin) {
        TransactionUtil.buildTransferCoin(this.sdk, tx!, value.targetCoin, key, this.sdk.senderAddress)
      }
    })

    return tx
  }

  /**
   * Creates collect reward move calls (internal method)
   * @param params - Collection parameters
   * @param tx - Transaction object
   * @param primaryCoinInputs - Array of coin objects for each rewarder
   * @returns Transaction object with collect reward calls
   */
  createCollectRewarderPaylod(params: CollectRewarderParams, tx: Transaction, primaryCoinInputs: TransactionArgument[]) {
    const { clmm_pool, integrate } = this.sdk.sdkOptions
    const clmmConfigs = getPackagerConfigs(clmm_pool)
    const typeArguments = [params.coinTypeA, params.coinTypeB]

    // Create collect call for each rewarder
    params.rewarder_coin_types.forEach((type, index) => {
      if (tx) {
        tx.moveCall({
          target: `${integrate.published_at}::${ClmmIntegratePoolModule}::collect_reward`,
          typeArguments: [...typeArguments, type],
          arguments: [
            tx.object(clmmConfigs.global_config_id),
            tx.object(params.pool_id),
            tx.object(params.pos_id),
            tx.object(clmmConfigs.global_rewarder_vault_id),
            primaryCoinInputs[index],
            tx.object(CLOCK_ADDRESS),
          ],
        })
      }
    })
    return tx
  }

  /**
   * Creates collect reward calls without sending coins to sender
   * Used when coins need to be used in subsequent operations
   * @param params - Collection parameters
   * @param tx - Transaction object
   * @param primaryCoinInputs - Array of coin objects for each rewarder
   * @returns Transaction object with collect reward calls
   */
  createCollectRewarderNoSendPaylod(params: CollectRewarderParams, tx: Transaction, primaryCoinInputs: TransactionArgument[]) {
    const { clmm_pool, integrate } = this.sdk.sdkOptions
    const clmmConfigs = getPackagerConfigs(clmm_pool)
    const typeArguments = [params.coinTypeA, params.coinTypeB]

    // Create collect call for each rewarder
    params.rewarder_coin_types.forEach((type, index) => {
      if (tx) {
        tx.moveCall({
          target: `${integrate.published_at}::${ClmmIntegratePoolModule}::collect_reward`,
          typeArguments: [...typeArguments, type],
          arguments: [
            tx.object(clmmConfigs.global_config_id),
            tx.object(params.pool_id),
            tx.object(params.pos_id),
            tx.object(clmmConfigs.global_rewarder_vault_id),
            primaryCoinInputs[index],
            tx.object(CLOCK_ADDRESS),
          ],
        })
      }
    })
    return tx
  }
}