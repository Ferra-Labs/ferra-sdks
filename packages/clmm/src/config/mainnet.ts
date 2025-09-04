import FerraClmmSDK, { SdkOptions } from '../main'
import { checkInvalidSuiAddress } from '../utils'

const SDKConfig = {
  clmmConfig: {
    pools_id: '0xcf8cd5934d0ba8ab70a6db533ac4ff20b0ccd55e54b82688811007723cf8e468',
    global_config_id: '0x32bcdffb86333e3092ff3aa2d97847cde7a36724a026844732ade63a42fc8b45',
    global_rewarder_vault_id: '0x97e1f1e0931eed67806e598fdf33b699cb988ae04558ff0ae7d74d23cab06d42',
  }
}

// mainnet
export const clmmMainnet: SdkOptions = {
  fullRpcUrl: 'https://mainnet.suiet.app:443',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  clmm_pool: {
    package_id: '0x677a8ee8489097070f95ffdac5c385ee1ee84e1056ea3d29ede5e09f3e612420',
    published_at: '0x677a8ee8489097070f95ffdac5c385ee1ee84e1056ea3d29ede5e09f3e612420',
    config: SDKConfig.clmmConfig,
  },
  integrate: {
    package_id: '0x97084e44e7778be7414a8fa00623a6274f0161ab0735390a6f2a569e1bdaef7f',
    published_at: '0x97084e44e7778be7414a8fa00623a6274f0161ab0735390a6f2a569e1bdaef7f',
  },
  swapCountUrl: 'https://api-beta.ferra.xyz/clmm/swap/pools'
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
  if (wallet && checkInvalidSuiAddress(wallet)) {
    sdk.senderAddress = wallet
  }
  return sdk
}
