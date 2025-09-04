import { CoinBalance } from '@mysten/sui/client'
import { QuoterModule } from './modules/quoter'
import { AggSwapModule } from './modules/agg-swap'
import { CachedContent, cacheTime24h, extractStructTagFromType, getFutureTime, patchFixSuiObjectId } from './utils'
import { AggregatorConfig, CoinAsset, Package, SuiResource, SuiAddressType, TokenConfig } from './types'
import { RpcModule } from './utils/rpc'

/**
 * Represents options and configurations for an SDK.
 */
export type SdkOptions = {
  /**
   * The full URL for interacting with the RPC (Remote Procedure Call) service.
   */
  fullRpcUrl: string

  /**
   * Optional URL for the faucet service.
   */
  faucetURL?: string

  /**
   * Configuration for the simulation account.
   */
  simulationAccount: {
    /**
     * The address of the simulation account.
     */
    address: string
  }



  /**
   * Package containing token-related configurations.
   */
  token?: Package<TokenConfig>

  /**
   * Package containing Aggregator Package configurations.
   */
  agg_pkg: Package<AggregatorConfig>

  /**
   * The URL for the quoter
   */
  quoterUrl?: string


}

/**
 * The entry class of FerraAggregatorSDK, which is almost responsible for all interactions with CLMM.
 */
export class FerraAggregatorSDK {
  private readonly _cache: Record<string, CachedContent> = {}

  /**
   * RPC provider on the SUI chain
   */
  protected _rpcModule: RpcModule

  /**
   * Provide interact with dlmm pairs with a pool router interface.
   */

  protected _quoter: QuoterModule

  protected _aggSwap: AggSwapModule

  /**
   *  Provide sdk options
   */
  protected _sdkOptions: SdkOptions

  /**
   * After connecting the wallet, set the current wallet address to senderAddress.
   */
  protected _senderAddress = ''
    config: any

  constructor(options: SdkOptions) {
    this._sdkOptions = options
    this._rpcModule = new RpcModule({
      url: options.fullRpcUrl,
    })

    this._quoter = new QuoterModule(this)
    this._aggSwap = new AggSwapModule(this)

    patchFixSuiObjectId(this._sdkOptions)
  }

  /**
   * Getter for the sender address property.
   * @returns {SuiAddressType} The sender address.
   */
  get senderAddress(): SuiAddressType {
    return this._senderAddress
  }

  /**
   * Setter for the sender address property.
   * @param {string} value - The new sender address value.
   */
  set senderAddress(value: string) {
    this._senderAddress = value
  }

  /**
   * Getter for the fullClient property.
   * @returns {RpcModule} The fullClient property value.
   */
  get fullClient(): RpcModule {
    return this._rpcModule
  }

  /**
   * Getter for the sdkOptions property.
   * @returns {SdkOptions} The sdkOptions property value.
   */
  get sdkOptions(): SdkOptions {
    return this._sdkOptions
  }

  get Quoter(): QuoterModule {
    return this._quoter
  }

  get AggSwap(): AggSwapModule {
    return this._aggSwap
  }

  /**
   * Gets all coin assets for the given owner and coin type.
   *
   * @param suiAddress The address of the owner.
   * @param coinType The type of the coin.
   * @returns an array of coin assets.
   */
  async getOwnerCoinAssets(suiAddress: string, coinType?: string | null, forceRefresh = true): Promise<CoinAsset[]> {
    const allCoinAsset: CoinAsset[] = []
    let nextCursor: string | null | undefined = null

    const cacheKey = `${this.sdkOptions.fullRpcUrl}_${suiAddress}_${coinType}_getOwnerCoinAssets`
    const cacheData = this.getCache<CoinAsset[]>(cacheKey, forceRefresh)
    if (cacheData) {
      return cacheData
    }

    while (true) {
      const allCoinObject: any = await (coinType
        ? this.fullClient.getCoins({
            owner: suiAddress,
            coinType,
            cursor: nextCursor,
          })
        : this.fullClient.getAllCoins({
            owner: suiAddress,
            cursor: nextCursor,
          }))

      allCoinObject.data.forEach((coin: any) => {
        if (BigInt(coin.balance) > 0) {
          allCoinAsset.push({
            coinAddress: extractStructTagFromType(coin.coinType).source_address,
            coinObjectId: coin.coinObjectId,
            balance: BigInt(coin.balance),
          })
        }
      })
      nextCursor = allCoinObject.nextCursor

      if (!allCoinObject.hasNextPage) {
        break
      }
    }
    this.updateCache(cacheKey, allCoinAsset, 30 * 1000)
    return allCoinAsset
  }

  /**
   * Gets all coin balances for the given owner and coin type.
   *
   * @param suiAddress The address of the owner.
   * @param coinType The type of the coin.
   * @returns an array of coin balances.
   */
  async getOwnerCoinBalances(suiAddress: string, coinType?: string | null): Promise<CoinBalance[]> {
    let allCoinBalance: CoinBalance[] = []

    if (coinType) {
      const res = await this.fullClient.getBalance({
        owner: suiAddress,
        coinType,
      })
      allCoinBalance = [res]
    } else {
      const res = await this.fullClient.getAllBalances({
        owner: suiAddress,
      })
      allCoinBalance = [...res]
    }
    return allCoinBalance
  }

  /**
   * Updates the cache for the given key.
   *
   * @param key The key of the cache entry to update.
   * @param data The data to store in the cache.
   * @param time The time in minutes after which the cache entry should expire.
   */
  updateCache(key: string, data: SuiResource, time = cacheTime24h) {
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
   * Gets the cache entry for the given key.
   *
   * @param key The key of the cache entry to get.
   * @param forceRefresh Whether to force a refresh of the cache entry.
   * @returns The cache entry for the given key, or undefined if the cache entry does not exist or is expired.
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
