import FerraAggregatorSDK, { SdkOptions } from '../main'
import { checkInvalidSuiAddress } from '../utils'

const SDKConfig = {
  aggConfig: {
    Ferra: {
      clmm_global_config: "0xf95e1634845d71c56dcfcea3c96cef4c81ee2451b2e058a85ed763d81f06abf4",
      dlmm_global_config: "0x66c0565754d53f40dfcf7fa4ff866cb145a2add2d26344f57cbb3a94820826e7"
    },
  }
}

// beta
export const aggBeta: SdkOptions = {
  fullRpcUrl: 'https://mainnet.suiet.app:443',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  agg_pkg: {
    package_id: '0x7da2440b376fc3c4bd5ed7a2dcad1da8d5dedc185961b7933f8db3cf55863952',
    published_at: '0x7da2440b376fc3c4bd5ed7a2dcad1da8d5dedc185961b7933f8db3cf55863952',
    config: SDKConfig.aggConfig,
  },
  quoterUrl: 'https://agg-beta.ferra.xyz/agg/quote',
}

/**
 * Initialize the beta SDK
 * @param fullNodeUrl. If provided, it will be used as the full node URL.
 * @param simulationAccount. If provided, it will be used as the simulation account address.
 *                           when you use the `preswap` method or other methods that require payment assistance,
 *                           you must configure a simulation account with sufficient balance of input tokens.
 *                           If you connect the wallet, you can set the current wallet address to simulationAccount.
 * @returns
 */
export function initBetaSDK(fullNodeUrl?: string, wallet?: string): FerraAggregatorSDK {
  if (fullNodeUrl) {
    aggBeta.fullRpcUrl = fullNodeUrl
  }
  const sdk = new FerraAggregatorSDK(aggBeta)
  if (wallet && checkInvalidSuiAddress(wallet)) {
    sdk.senderAddress = wallet
  }
  return sdk
}
