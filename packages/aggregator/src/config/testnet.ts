import FerraAggregatorSDK, { SdkOptions } from '../main'
import { checkValidSuiAddress } from '../utils'

const SDKConfig = {
  aggConfig: {
    Ferra: {
      clmm_global_config: "0x0f21705a8a674ce564b8e320c7bfccae236b763370786d504f7631af6425ff62",
      dlmm_global_config: "0x3ae130485253c7cefc9e328275f03b5ee516bc5a6246b6ef4f9dcff126144fb1"
    },
  }
}

// testnet
export const aggTestnet: SdkOptions = {
  fullRpcUrl: 'https://mainnet.suiet.app:443',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  agg_pkg: {
    package_id: '0xaa71601f6306104290d75002dc3da41e0daf972cc18f66557a8a5bba7e89a261',
    published_at: '0xaa71601f6306104290d75002dc3da41e0daf972cc18f66557a8a5bba7e89a261',
    config: SDKConfig.aggConfig,
  },
  quoterUrl: 'https://api-dev.ferra.ag/agg/quote',
}

/**
 * Initialize the testnet SDK
 * @param fullNodeUrl. If provided, it will be used as the full node URL.
 * @param simulationAccount. If provided, it will be used as the simulation account address.
 *                           when you use the `preswap` method or other methods that require payment assistance,
 *                           you must configure a simulation account with sufficient balance of input tokens.
 *                           If you connect the wallet, you can set the current wallet address to simulationAccount.
 * @returns
 */
export function initTestnetSDK(fullNodeUrl?: string, wallet?: string): FerraAggregatorSDK {
  if (fullNodeUrl) {
    aggTestnet.fullRpcUrl = fullNodeUrl
  }
  const sdk = new FerraAggregatorSDK(aggTestnet)
  if (wallet && checkValidSuiAddress(wallet)) {
    sdk.senderAddress = wallet
  }
  return sdk
}
