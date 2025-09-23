import FerraAggregatorSDK, { SdkOptions } from '../main'
import { checkInvalidSuiAddress } from '../utils'

const SDKConfig = {
  aggConfig: {
    Ferra: {
      clmm_global_config: "0x2d1269e1ade81a5189b625ee87c9425bc29249d21d273245269eb07e67dc6965",
      dlmm_global_config: "0xab4744f35407db7b75b97d75396e655f48e6164a18fc6b4de5bf11de38146efc"
    },
  }
}


// mainnet
export const aggMainnet: SdkOptions = {
  fullRpcUrl: 'https://mainnet.suiet.app:443',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  agg_pkg: {
    package_id: '0x74342a1f88758a3b61dfd2616312a53c3ccec48e465482ceae37a3516303dc46',
    published_at: '0x74342a1f88758a3b61dfd2616312a53c3ccec48e465482ceae37a3516303dc46',
    config: SDKConfig.aggConfig,
  },
  quoterUrl: 'https://api.ferra.xyz/agg/quote',
}

/**
 * Initialize the mainnet SDK
 * @param fullNodeUrl. If provided, it will be used as the full node URL.
 * @param simulationAccount. If provided, it will be used as the simulation account address.
 *                           when you use the `preswap` method or other methods that require payment assistance,
 *                           you must configure a simulation account with sufficient balance of input tokens.
 *                           If you connect the wallet, you can set the current wallet address to simulationAccount.
 * @returns
 */
export function initMainnetSDK(fullNodeUrl?: string, wallet?: string): FerraAggregatorSDK {
  if (fullNodeUrl) {
    aggMainnet.fullRpcUrl = fullNodeUrl
  }
  const sdk = new FerraAggregatorSDK(aggMainnet)
  if (wallet && checkInvalidSuiAddress(wallet)) {
    sdk.senderAddress = wallet
  }
  return sdk
}
