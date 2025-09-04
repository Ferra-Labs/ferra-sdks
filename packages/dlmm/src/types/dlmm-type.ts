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
 * Represents a faucet coin configuration.
 */
export type FaucetCoin = {
  /**
   * The name or identifier of the transaction module.
   */
  transactionModule: string

  /**
   * The supply ID or object identifier of the faucet coin.
   */
  suplyID: SuiObjectIdType

  /**
   * The number of decimal places used for the faucet coin.
   */
  decimals: number
}


/**
 * Configuration settings for the Cryptocurrency Liquidity Mining Module (CLMM).
 */
export type DlmmConfig = {
  global_config: string
  pairs_id: string
  reward_vault: string
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