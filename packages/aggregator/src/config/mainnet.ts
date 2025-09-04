import FerraAggregatorSDK, { SdkOptions } from '../main'
import { checkInvalidSuiAddress } from '../utils'

const SDKConfig = {
  aggConfig: {
    Ferra: {
      clmm_global_config: "0x62f3f95bc1d68c4a92712d344bd7699d7babec3e17ab2a2fbc96dd5a5f968906",
      dlmm_global_config: "0xf28811a2b2fe8838129df1fc0b825057972436777bf0e45bda3d82c8d7c49850"
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
    package_id: '0xeeb25fb858c258ddf37488cfecb31ff3db2b2228aecdad5b5ebdeefb99f8a714',
    published_at: '0xeeb25fb858c258ddf37488cfecb31ff3db2b2228aecdad5b5ebdeefb99f8a714',
    config: SDKConfig.aggConfig,
  },
  quoterUrl: 'https://agg-beta.ferra.xyz/agg/quote',
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
