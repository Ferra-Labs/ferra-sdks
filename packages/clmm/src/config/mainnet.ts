import FerraClmmSDK, { SdkOptions } from '../main'
import { checkValidSuiAddress } from '../utils'

const SDKConfig = {
  clmmConfig: {
    pools_id: '0x0eed6ad3e892da66858251e4f5f2ae7b64081894cb5c52e9ff0f575f7e4b32a1',
    global_config_id: '0x690dca273b863ad44ab125d34c4538ac4eb16e22f66e3720a2de9608e1552a68',
    global_rewarder_vault_id: '0x2a13d3b3bbc00faf59fd9a4cf961e568529db0ff2c2edea13e28ce3bc3da32e1'
  }
}

// mainnet
export const clmmMainnet: SdkOptions = {
  fullRpcUrl: 'https://mainnet.suiet.app:443',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  clmm_pool: {
    package_id: '0x45a137f238cc1205e220a4997fc0a8312427064cfae441f8c6ca12bf712f6232',
    published_at: '0x45a137f238cc1205e220a4997fc0a8312427064cfae441f8c6ca12bf712f6232',
    config: SDKConfig.clmmConfig,
  },
  integrate: {
    package_id: '0x103a7d00f1f49f2289740f41fabf5e3263e2c43db774a871baf5429cea4cef40',
    published_at: '0x103a7d00f1f49f2289740f41fabf5e3263e2c43db774a871baf5429cea4cef40',
  },
  swapCountUrl: 'https://api.ferra.ag/clmm/swap/pools'
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
export function initMainnetSDK(fullNodeUrl?: string, wallet?: string): FerraClmmSDK {
  if (fullNodeUrl) {
    clmmMainnet.fullRpcUrl = fullNodeUrl
  }
  const sdk = new FerraClmmSDK(clmmMainnet)
  if (wallet && checkValidSuiAddress(wallet)) {
    sdk.senderAddress = wallet
  }
  return sdk
}
