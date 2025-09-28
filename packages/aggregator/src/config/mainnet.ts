import FerraAggregatorSDK, { SdkOptions } from '../main'
import { checkInvalidSuiAddress } from '../utils'

const SDKConfig = {
  aggConfig: {
    Ferra: {
      clmm_global_config: "0x690dca273b863ad44ab125d34c4538ac4eb16e22f66e3720a2de9608e1552a68",
      dlmm_global_config: "0xdb7afb30c1b7a5652f3cccee1eecb2cfdb2a2d91bdc3d72598b3ad852304d9bc"
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
    package_id: '0x84b8e7813e60ed47e0fecbb63d1aee10cd5ab3bcaaf5e8a3195749a0a43dd557',
    published_at: '0x84b8e7813e60ed47e0fecbb63d1aee10cd5ab3bcaaf5e8a3195749a0a43dd557',
    config: SDKConfig.aggConfig,
  },
  quoterUrl: 'https://api.ferra.ag/agg/quote',
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
