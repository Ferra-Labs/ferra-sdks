import FerraAggregatorSDK, { SdkOptions } from '../main'
import { checkInvalidSuiAddress } from '../utils'

const SDKConfig = {
  aggConfig: {
    Ferra: {
      clmm_global_config: "0x2d1269e1ade81a5189b625ee87c9425bc29249d21d273245269eb07e67dc6965",
      dlmm_global_config: "0x81840b602be475fabb192c9c6e2a56d38cf79b9bcb6f2f4f88a3421cad8dfe25"
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
    package_id: '0xaf5bf815babb462f6bdfd006edb00f3f53d382cf72901e8b11c1cae426c88cdd',
    published_at: '0xaf5bf815babb462f6bdfd006edb00f3f53d382cf72901e8b11c1cae426c88cdd',
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
