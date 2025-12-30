import FerraDammSDK from '../main'
import { initMainnetSDK } from './mainnet'
import { initTestnetSDK } from './testnet'
import { initBetaSDK } from './beta'

interface InitFerraSDKOptions {
  network: 'mainnet' | 'testnet' | 'beta'
  fullNodeUrl?: string
  wallet?: string
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
export function initFerraSDK(options: InitFerraSDKOptions): FerraDammSDK {
  const { network, fullNodeUrl, wallet } = options
  switch (network) {
    case 'mainnet':
      return initMainnetSDK(fullNodeUrl, wallet)
    case 'testnet':
      return initTestnetSDK(fullNodeUrl, wallet)
    case 'beta':
      return initBetaSDK(fullNodeUrl, wallet)

    default:
      break;
  }
  return initTestnetSDK(fullNodeUrl, wallet)
}


export function initFerraDammSDK(options: InitFerraSDKOptions): FerraDammSDK {
  return initFerraSDK(options)
}
