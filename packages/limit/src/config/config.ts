import { LimitError, LimitErrorCode, DETAILS_KEYS } from '../errors/errors'
import { FerraDcaSDK, SdkOptions } from '../sdk'
import { LimitOrderConfig } from '../types'
import { initMainnetSDK } from './mainnet'
import { initTestnetSDK } from './testnet'

interface InitFerraSDKOptions {
  network: 'mainnet' | 'testnet' | 'beta'
  fullNodeUrl?: string
  wallet?: string
}

export function getPackagerConfigs(config: SdkOptions['limit_order']): LimitOrderConfig {
  if (!config.config) {
    throw new LimitError("INVALID_CONFIG", LimitErrorCode.BuildError, {
      [DETAILS_KEYS.METHOD_NAME]: 'getPackagerConfigs'
    })
  }
  return config.config
}

/**
 * Helper function to initialize the Ferra SDK
 * @param env - The environment to initialize the SDK in. One of 'mainnet' or 'testnet'.
 * @param fullNodeUrl - The full node URL to use.
 * @param wallet - The wallet address to use. If not provided,
 *                 If you use the `preswap` method or other methods that require payment assistance,
 *                  you must configure a wallet with sufficient balance of input tokens.
 *                  If you do not set a wallet, the SDK will throw an error.
 * @returns The initialized Ferra SDK.
 */
export function initFerraSDK(options: InitFerraSDKOptions): FerraDcaSDK {
  const { network, fullNodeUrl, wallet } = options
  switch (network) {
    case 'mainnet':
      return initMainnetSDK(fullNodeUrl, wallet)
    case 'testnet':
      return initTestnetSDK(fullNodeUrl, wallet)

    default:
      break;
  }
  return initTestnetSDK(fullNodeUrl, wallet)
}

export function initFerraDcaSDK(options: InitFerraSDKOptions): FerraDcaSDK {
  return initFerraSDK(options)
}
