/* eslint-disable @typescript-eslint/no-use-before-define */
import BN from 'bn.js'
import { Transaction, TransactionArgument, TransactionObjectArgument } from '@mysten/sui/transactions'
import { BuildCoinResult, checkValidSuiAddress, extractStructTagFromType, normalizeCoinType, TransactionUtil } from '../utils'
import { DammFetcherModule, DammIntegratePoolModule, CLOCK_ADDRESS } from '../types/sui'
import { getRewardInTickRange } from '../utils/tick'
import { MathUtil, ONE, ZERO } from '../math/utils'
import { TickData } from '../types/damm-pool'
import { FerraDammSDK } from '../sdk'
import { IModule } from '../interfaces/IModule'
import { CollectRewarderParams, getPackagerConfigs, Pool, Position, PositionReward, Rewarder, RewarderAmountOwed } from '../types'
import { CollectFeesQuote } from '../math'
import { DammpoolsError, ConfigErrorCode, UtilsErrorCode } from '../errors/errors'

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
 * Rewarder module for managing position rewards in DAMM pools
 * Handles reward calculations, collection, and distribution for liquidity providers
 */
export class RewarderModule implements IModule {
  protected _sdk: FerraDammSDK
  private growthGlobal: BN[]

  constructor(sdk: FerraDammSDK) {
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
    const rewarderInfos = currentPool.rewarderInfos
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
    const lastTime = currentPool.rewarderLastUpdatedTime
    currentPool.rewarderLastUpdatedTime = currentTime.toString()

    // Skip update if no liquidity or no time has passed
    if (Number(currentPool.liquidity) === 0 || currentTime.eq(new BN(lastTime))) {
      return currentPool
    }

    // Calculate time delta in seconds with 15 second buffer
    const timeDelta = currentTime.div(new BN(1000)).sub(new BN(lastTime)).add(new BN(15))
    const rewarderInfos: any = currentPool.rewarderInfos

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
        rewarderInfo: pool.rewarderInfos,
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
      rewarderInfo: pool.rewarderInfos,
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
    const { damm_pool, integrate, simulationAccount } = this.sdk.sdkOptions
    const tx = new Transaction()

    // Build simulation transaction for all positions
    for (const paramItem of params) {
      const typeArguments = [paramItem.coinTypeA, paramItem.coinTypeB]
      const args = [
        tx.object(getPackagerConfigs(damm_pool).global_config_id),
        tx.object(paramItem.poolAddress),
        tx.pure.address(paramItem.positionId),
        tx.object(CLOCK_ADDRESS),
      ]
      tx.moveCall({
        target: `${integrate.published_at}::${DammFetcherModule}::fetch_position_rewards`,
        arguments: args,
        typeArguments,
      })
    }

    if (!checkValidSuiAddress(simulationAccount.address)) {
      throw new DammpoolsError(
        `this config simulationAccount: ${simulationAccount.address} is not set right`,
        ConfigErrorCode.InvalidSimulateAccount
      )
    }

    const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: simulationAccount.address,
    })

    if (simulateRes.error != null) {
      throw new DammpoolsError(
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
      throw new DammpoolsError('valueData.length !== params.length')
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
        rewarderInfo: pool.rewarderInfos,
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
    if (!checkValidSuiAddress(this.sdk.senderAddress)) {
      throw new DammpoolsError(
        'Invalid sender address: ferra damm sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
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
    if (!checkValidSuiAddress(this.sdk.senderAddress)) {
      throw new DammpoolsError(
        'Invalid sender address: ferra damm sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
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
    const { damm_pool, integrate } = this.sdk.sdkOptions
    const dammConfigs = getPackagerConfigs(damm_pool)
    const typeArguments = [params.coinTypeA, params.coinTypeB]

    // Create collect call for each rewarder
    params.rewarder_coin_types.forEach((type, index) => {
      if (tx) {
        tx.moveCall({
          target: `${integrate.published_at}::${DammIntegratePoolModule}::collect_reward`,
          typeArguments: [...typeArguments, type],
          arguments: [
            tx.object(dammConfigs.global_config_id),
            tx.object(params.pool_id),
            tx.object(params.pos_id),
            tx.object(dammConfigs.global_rewarder_vault_id),
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
    const { damm_pool, integrate } = this.sdk.sdkOptions
    const dammConfigs = getPackagerConfigs(damm_pool)
    const typeArguments = [params.coinTypeA, params.coinTypeB]

    // Create collect call for each rewarder
    params.rewarder_coin_types.forEach((type, index) => {
      if (tx) {
        tx.moveCall({
          target: `${integrate.published_at}::${DammIntegratePoolModule}::collect_reward`,
          typeArguments: [...typeArguments, type],
          arguments: [
            tx.object(dammConfigs.global_config_id),
            tx.object(params.pool_id),
            tx.object(params.pos_id),
            tx.object(dammConfigs.global_rewarder_vault_id),
            primaryCoinInputs[index],
            tx.object(CLOCK_ADDRESS),
          ],
        })
      }
    })
    return tx
  }
}