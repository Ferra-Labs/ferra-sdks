import { SuiClient } from '@mysten/sui/client'
import { CreateLBPairParams } from '../interfaces/IFactory'
import { IModule } from '../interfaces/IModule'
import { FerraDlmmSDK } from '../sdk'
import { CachedContent } from '../utils/cached-content'
import { isSortedSymbols, TransactionUtil } from '../utils'
import { Transaction } from '@mysten/sui/transactions'
import { bcs } from '@mysten/bcs'
import { normalizeSuiAddress } from '@mysten/sui/utils'

/**
* Module for managing DLMM factory operations
* Handles creation of new liquidity pairs
*/
export class FactoryModule implements IModule {
  protected _sdk: FerraDlmmSDK

  /**
   * Cache storage for factory data
   */
  private readonly _cache: Record<string, CachedContent> = {}

  /**
   * Initialize the factory module with SDK instance
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
  public createLBPair = async (
    params: Omit<CreateLBPairParams, 'packageId' | 'factoryId'>,
    tx?: Transaction
  ): Promise<Transaction> => {
    // Get sender address from SDK
    const sender = this.sdk.senderAddress

    /**
     * Sort tokens to ensure consistent ordering
     * DLMM requires tokenX < tokenY for proper pair creation
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
}