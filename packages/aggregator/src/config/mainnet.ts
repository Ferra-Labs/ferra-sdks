import FerraAggregatorSDK, { SdkOptions } from '../main'
import { checkValidSuiAddress } from '../utils'

const SDKConfig = {
  aggConfig: {
    Ferra: {
      clmm_global_config: "0x2cd8382c19e6994f16df204e9b8cddd04bdc486c251de75ac66ac4e48e3e7081",
      dlmm_global_config: "0x5c9dacf5a678ea15b8569d65960330307e23d429289ca380e665b1aa175ebeca"
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
    package_id: '0x9ef2ac77f654d9ac048883150017cf82341471a717f3b901394dce368fbc069d',
    published_at: '0x9ef2ac77f654d9ac048883150017cf82341471a717f3b901394dce368fbc069d',
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
  if (wallet && checkValidSuiAddress(wallet)) {
    sdk.senderAddress = wallet
  }
  return sdk
}
