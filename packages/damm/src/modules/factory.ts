import { SuiClient } from '@mysten/sui/client'
import { CreateLBPairParams } from '../interfaces/IFactory'
import { IModule } from '../interfaces/IModule'
import { FerraDammSDK } from '../sdk'
import { CachedContent } from '../utils/cached-content'
import { isSortedSymbols, TransactionUtil } from '../utils'
import { Transaction, TransactionResult } from '@mysten/sui/transactions'
import { bcs, BcsType } from '@mysten/sui/bcs'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import { LBPair } from '../interfaces'

const GlobalConfigStruct = bcs.struct('GlobalConfig', {
  id: bcs.struct('0x2::object::ID', { id: bcs.Address }),
  pause: bcs.bool(),
  fee_tiers: bcs.struct('VecMap', {
    contents: bcs.vector(
      bcs.struct('Entry', {
        key: bcs.u32(),
        value: bcs.struct('FeeParameters', {
          base_factor: bcs.u32(),
          protocol_share: bcs.u16(),
          cliff_fee_numerator: bcs.u64(),
          period_frequency: bcs.u64(),
          number_of_period: bcs.u16(),
          fee_scheduler_reduction_factor: bcs.u64(),
          filter_period: bcs.u16(),
          decay_period: bcs.u16(),
          reduction_factor: bcs.u16(),
          variable_fee_control: bcs.u32(),
          max_volatility_accumulator: bcs.u32(),
        }),
      })
    ),
  }),
})

/**
 * Module for managing DAMM factory operations
 * Handles creation of new liquidity pairs
 */
export class FactoryModule implements IModule {
  protected _sdk: FerraDammSDK

  /**
   * Cache storage for factory data
   */
  private readonly _cache: Record<string, CachedContent> = {}

  /**
   * Initialize the factory module with SDK instance
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

  async getBaseFeeAvailable() {
    const config = this._sdk.sdkOptions.damm_pool.config?.global_config

    if (!config) {
      throw new Error('GLOBAL_CONFIG not set')
    }

    const configObject = (
      await this.sdk.grpcClient.ledgerService.getObject({
        objectId: config,
        readMask: {
          paths: ['contents'],
        },
      })
    ).response.object

    const data = GlobalConfigStruct.parse(configObject?.contents?.value ?? new Uint8Array())

    return data.fee_tiers.contents.map((v) => v.value)
  }

  /**
   * Creates a new LB pair and executes the transaction
   * @param params - Parameters for creating the LB pair
   *   @param params.tokenXType - Type of token X
   *   @param params.tokenYType - Type of token Y
   *   @param params.binStep - Bin step for the pair
   *   @param params.activeId - Initial active bin ID
   * @param tx - Optional existing transaction to add the creation to
   * @returns Transaction object ready to be executed
   *
   * @example
   * ```typescript
   * const tx = await factory.createLBPair({
   *   tokenXType: "0x2::sui::SUI",
   *   tokenYType: "0x...::usdc::USDC",
   *   binStep: 10,
   *   activeId: 8388608
   * });
   * ```
   */
  public createLBPair = async (params: Omit<CreateLBPairParams, 'packageId' | 'factoryId'>, tx?: Transaction): Promise<Transaction> => {
    // Get sender address from SDK
    const sender = this.sdk.senderAddress

    /**
     * Sort tokens to ensure consistent ordering
     * DAMM requires tokenX < tokenY for proper pair creation
     */
    if (isSortedSymbols(normalizeSuiAddress(params.tokenXType), normalizeSuiAddress(params.tokenYType))) {
      // Swap token types if they're in wrong order
      const swapCoinTypeY = params.tokenYType
      params.tokenYType = params.tokenXType
      params.tokenXType = swapCoinTypeY
    }

    /**
     * Create the LB pair transaction
     * This will add the necessary move calls to create a new pair
     */
    tx = TransactionUtil.createLBPair(
      {
        ...params,
      },
      this.sdk.sdkOptions,
      tx
    )

    /**
     * Set sender if not already set
     * Required for transaction execution
     */
    if (sender) {
      tx.setSenderIfNotSet(sender)
    }

    return tx
  }

  public createLBPairWithCallback = async (
    params: Omit<CreateLBPairParams, 'packageId' | 'factoryId'>,
    callback: (pair: LBPair) => Promise<void>,
    tx?: Transaction
  ): Promise<Transaction> => {
    // Get sender address from SDK
    const sender = this.sdk.senderAddress
    /**
     * Sort tokens to ensure consistent ordering
     * DAMM requires tokenX < tokenY for proper pair creation
     */
    if (isSortedSymbols(normalizeSuiAddress(params.tokenXType), normalizeSuiAddress(params.tokenYType))) {
      // Swap token types if they're in wrong order
      const swapCoinTypeY = params.tokenYType
      params.tokenYType = params.tokenXType
      params.tokenXType = swapCoinTypeY
    }

    tx ??= new Transaction()

    /**
     * Create the LB pair transaction
     * This will add the necessary move calls to create a new pair
     */
    const [pair, repayPair] = TransactionUtil.createAndReturnLBPair(
      {
        ...params,
      },
      this.sdk.sdkOptions,
      tx
    )

    await callback({
      id: pair,
      tokenXType: params.tokenXType,
      tokenYType: params.tokenYType,
      parameters: {
        active_id: params.activeId,
      },
    } as unknown as LBPair)

    TransactionUtil.sharedTransferPair(
      pair,
      repayPair,
      params.tokenXType,
      params.tokenYType,
      this.sdk.sdkOptions,
      tx
    )

    /**
     * Set sender if not already set
     * Required for transaction execution
     */
    if (sender) {
      tx.setSenderIfNotSet(sender)
    }

    return tx
  }
}
