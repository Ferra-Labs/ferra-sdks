import FerraAggregatorSDK, { SdkOptions } from '../main'
import { checkInvalidSuiAddress } from '../utils'

const SDKConfig = {
  aggConfig: {
    Ferra: {
      clmm_global_config: "0x742954bcd338245136baab63a2caea8c604a3deb1799a6f8b1652362c55ee1f3",
      dlmm_global_config: "0x975926b55ef6818b85a31811f3bc012f66e8d02218b57625a6d333a0c10dc26c"
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
    package_id: '0x632f0e228c5d6509b6838ee87747c1e7f62c151fd3916264120944ef34844c2a',
    published_at: '0x632f0e228c5d6509b6838ee87747c1e7f62c151fd3916264120944ef34844c2a',
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
