import { SdkV2Options } from '../sdk'
import { SuiAddressType, SuiObjectIdType } from './sui'

/**
 * Represents a coin asset with address, object ID, and balance information.
 */
export type CoinAsset = {
  /**
   * The address type of the coin asset.
   */
  coinAddress: SuiAddressType

  /**
   * The object identifier of the coin asset.
   */
  coinObjectId: SuiObjectIdType

  /**
   * The balance amount of the coin asset.
   */
  balance: bigint
}

/**
 * Configuration settings for the Cryptocurrency Liquidity Mining Module (CLMM).
 */
export type AggregatorConfig = {
  Ferra?: {
    clmm_global_config?: string
    dlmm_global_config?: string
  },
  Cetus?: {

  },
  Navi?: {

  },
  Turbos?: {

  },
}


export type AggregatorV2Config = {
  config: string
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

export enum AggProvider {
    CETUS = "cetus",
    FLOWX = "flowx",
    BLUEFIN = "bluefin",
}

export type AggV2Configs = {
  provider: AggProvider,
  options: SdkV2Options
}