import FerraDlmmSDK, { SdkOptions } from '../main'
import { checkValidSuiAddress } from '../utils'

const SDKConfig = {
  dlmmConfig: {
    global_config: '0x5c9dacf5a678ea15b8569d65960330307e23d429289ca380e665b1aa175ebeca',
    pairs_id: '0x71ae968a99fd9a0b6a46519d7875fcc454c9811a3a6da8114382e6d926e78a04',
    reward_vault: '0xd68c56a1610953b0a81c48ad26e463c6c51e50ddcc13e5e4121fe70ee75c1bf7',
  }
}

// mainnet
export const dlmmMainnet: SdkOptions = {
  fullRpcUrl: 'https://mainnet.suiet.app:443',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  dlmm_pool: {
    package_id: '0x5a5c1d10e4782dbbdec3eb8327ede04bd078b294b97cfdba447b11b846b383ac',
    published_at: '0x5a5c1d10e4782dbbdec3eb8327ede04bd078b294b97cfdba447b11b846b383ac',
    config: SDKConfig.dlmmConfig,
  },
  integrate: {
    package_id: '',
    published_at: '',
  },
  dlmmApiUrl: "https://api.ferra.ag/dlmm/pair/"
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
export function initMainnetSDK(fullNodeUrl?: string, wallet?: string): FerraDlmmSDK {
  if (fullNodeUrl) {
    dlmmMainnet.fullRpcUrl = fullNodeUrl
  }
  const sdk = new FerraDlmmSDK(dlmmMainnet)
  if (wallet && checkValidSuiAddress(wallet)) {
    sdk.senderAddress = wallet
  }
  return sdk
}
