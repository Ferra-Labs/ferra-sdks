import { dcaMainnet, dcaTestnet } from './config'
import { DcaModule } from './modules/dcaModule'
import { RpcModule } from './modules/rpc'
import type { DcaConfigs } from './types/dca-type'
import { SuiAddressType, SuiResource } from './types/sui'
import { CachedContent, cacheTime24h, getFutureTime } from './utils/cached-content'

/**
 * Represents options and configurations for an SDK.
 */
export interface SdkOptions {
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

  dca: Package<DcaConfigs>
}

export type Package<T = undefined> = {
  /**
   * The unique identifier of the package.
   */
  package_id: string
  /**
   * the package was published.
   */
  published_at: string
  /**
   * The version number of the package (optional).
   */
  version?: number
  /**
   * The configuration or data contained in the package (optional).
   */
  config?: T
}

/**
 * The entry class of FerraDcaSDK, which is almost responsible for all interactions with dca.
 */
export class FerraDcaSDK {
  private readonly _cache: Record<string, CachedContent> = {}
  protected _dca: DcaModule
  protected _sdkOptions: SdkOptions
  protected _senderAddress = ''
  /**
   * RPC provider on the SUI chain
   */
  protected _rpcModule: RpcModule

  constructor(options: SdkOptions) {
    this._sdkOptions = options
    this._rpcModule = new RpcModule({
      url: options.fullRpcUrl,
    })

    this._dca = new DcaModule(this)
  }

  get Dca(): DcaModule {
    return this._dca
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
}
